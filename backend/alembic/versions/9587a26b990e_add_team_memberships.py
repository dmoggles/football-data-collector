"""add_team_memberships

Revision ID: 9587a26b990e
Revises: 8cb8a0ea2ba6
Create Date: 2026-03-06 01:23:25.453541

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9587a26b990e"
down_revision: Union[str, Sequence[str], None] = "8cb8a0ea2ba6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "team_memberships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'data_enterer'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "user_id", name="uq_team_memberships_team_user"),
    )
    op.create_index("ix_team_memberships_team_id", "team_memberships", ["team_id"], unique=False)
    op.create_index("ix_team_memberships_user_id", "team_memberships", ["user_id"], unique=False)

    op.execute(
        """
        INSERT INTO team_memberships (id, team_id, user_id, role, created_at)
        SELECT UUID(), teams.id, teams.user_id, 'admin', NOW()
        FROM teams
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_team_memberships_user_id", table_name="team_memberships")
    op.drop_index("ix_team_memberships_team_id", table_name="team_memberships")
    op.drop_table("team_memberships")
