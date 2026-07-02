"""add_collection_sessions_table

Revision ID: a9b8c7d6e5f4
Revises: f2a3b4c5d6e7
Create Date: 2026-03-08 20:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("collection_sessions"):
        op.create_table(
            "collection_sessions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("match_id", sa.String(length=36), nullable=False),
            sa.Column("team_id", sa.String(length=36), nullable=False),
            sa.Column("started_by_user_id", sa.String(length=36), nullable=False),
            sa.Column("state", sa.String(length=20), nullable=False, server_default=sa.text("'live'")),
            sa.Column("period_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("period_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("elapsed_seconds_before_period", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["match_id"], ["matches.id"]),
            sa.ForeignKeyConstraint(["team_id"], ["teams.id"]),
            sa.ForeignKeyConstraint(["started_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("match_id", "team_id", name="uq_collection_sessions_match_team"),
        )

    existing_indexes = {index["name"] for index in inspector.get_indexes("collection_sessions")}
    if op.f("ix_collection_sessions_match_id") not in existing_indexes:
        op.create_index(op.f("ix_collection_sessions_match_id"), "collection_sessions", ["match_id"], unique=False)
    if op.f("ix_collection_sessions_team_id") not in existing_indexes:
        op.create_index(op.f("ix_collection_sessions_team_id"), "collection_sessions", ["team_id"], unique=False)
    if op.f("ix_collection_sessions_started_by_user_id") not in existing_indexes:
        op.create_index(
            op.f("ix_collection_sessions_started_by_user_id"),
            "collection_sessions",
            ["started_by_user_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_collection_sessions_started_by_user_id"), table_name="collection_sessions")
    op.drop_index(op.f("ix_collection_sessions_team_id"), table_name="collection_sessions")
    op.drop_index(op.f("ix_collection_sessions_match_id"), table_name="collection_sessions")
    op.drop_table("collection_sessions")
