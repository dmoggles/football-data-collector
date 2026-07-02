"""repair_collection_sessions_schema

Revision ID: b7c6d5e4f3a2
Revises: a9b8c7d6e5f4
Create Date: 2026-03-08 20:35:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c6d5e4f3a2"
down_revision: Union[str, Sequence[str], None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table_name
              AND COLUMN_NAME = :column_name
            LIMIT 1
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).fetchone()
    return bool(row)


def _index_exists(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table_name
              AND INDEX_NAME = :index_name
            LIMIT 1
            """
        ),
        {"table_name": table_name, "index_name": index_name},
    ).fetchone()
    return bool(row)


def upgrade() -> None:
    if not _column_exists("collection_sessions", "started_by_user_id"):
        op.add_column(
            "collection_sessions",
            sa.Column("started_by_user_id", sa.String(length=36), nullable=True),
        )
        op.execute(
            """
            UPDATE collection_sessions cs
            SET started_by_user_id = (
              SELECT m.user_id FROM matches m WHERE m.id = cs.match_id
            )
            WHERE started_by_user_id IS NULL
            """
        )
        op.alter_column("collection_sessions", "started_by_user_id", nullable=False)

    if not _column_exists("collection_sessions", "state"):
        op.add_column(
            "collection_sessions",
            sa.Column("state", sa.String(length=20), nullable=False, server_default=sa.text("'live'")),
        )

    if not _column_exists("collection_sessions", "period_number"):
        op.add_column(
            "collection_sessions",
            sa.Column("period_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
        )

    if not _column_exists("collection_sessions", "period_started_at"):
        op.add_column(
            "collection_sessions",
            sa.Column("period_started_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _column_exists("collection_sessions", "elapsed_seconds_before_period"):
        op.add_column(
            "collection_sessions",
            sa.Column("elapsed_seconds_before_period", sa.Integer(), nullable=False, server_default=sa.text("0")),
        )

    if not _column_exists("collection_sessions", "updated_at"):
        op.add_column(
            "collection_sessions",
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    if not _index_exists("collection_sessions", "ix_collection_sessions_match_id"):
        op.create_index("ix_collection_sessions_match_id", "collection_sessions", ["match_id"], unique=False)
    if not _index_exists("collection_sessions", "ix_collection_sessions_team_id"):
        op.create_index("ix_collection_sessions_team_id", "collection_sessions", ["team_id"], unique=False)
    if not _index_exists("collection_sessions", "ix_collection_sessions_started_by_user_id"):
        op.create_index(
            "ix_collection_sessions_started_by_user_id",
            "collection_sessions",
            ["started_by_user_id"],
            unique=False,
        )


def downgrade() -> None:
    # Repair migration is intentionally one-way for local drift handling.
    pass
