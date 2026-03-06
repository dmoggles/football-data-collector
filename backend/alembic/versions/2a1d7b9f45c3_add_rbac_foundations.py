"""add_rbac_foundations

Revision ID: 2a1d7b9f45c3
Revises: 6f9cf62e2f3a
Create Date: 2026-03-06 11:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2a1d7b9f45c3"
down_revision: Union[str, Sequence[str], None] = "6f9cf62e2f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "global_roles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "role", name="uq_global_roles_user_role"),
    )
    op.create_index("ix_global_roles_user_id", "global_roles", ["user_id"], unique=False)
    op.create_index("ix_global_roles_role", "global_roles", ["role"], unique=False)

    op.create_table(
        "parent_player_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "player_id", name="uq_parent_player_links_user_player"),
    )
    op.create_index("ix_parent_player_links_user_id", "parent_player_links", ["user_id"], unique=False)
    op.create_index(
        "ix_parent_player_links_player_id", "parent_player_links", ["player_id"], unique=False
    )

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_logs_action", "admin_audit_logs", ["action"], unique=False)
    op.create_index(
        "ix_admin_audit_logs_actor_user_id", "admin_audit_logs", ["actor_user_id"], unique=False
    )
    op.create_index("ix_admin_audit_logs_target_id", "admin_audit_logs", ["target_id"], unique=False)
    op.create_index(
        "ix_admin_audit_logs_target_type", "admin_audit_logs", ["target_type"], unique=False
    )

    op.execute("UPDATE team_memberships SET role = 'team_admin' WHERE role = 'admin'")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE team_memberships SET role = 'admin' WHERE role = 'team_admin'")

    op.drop_index("ix_admin_audit_logs_target_type", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_target_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_actor_user_id", table_name="admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_action", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")

    op.drop_index("ix_parent_player_links_player_id", table_name="parent_player_links")
    op.drop_index("ix_parent_player_links_user_id", table_name="parent_player_links")
    op.drop_table("parent_player_links")

    op.drop_index("ix_global_roles_role", table_name="global_roles")
    op.drop_index("ix_global_roles_user_id", table_name="global_roles")
    op.drop_table("global_roles")
