"""drop_legacy_user_ownership_columns

Revision ID: c4f1e9d2ab77
Revises: 9587a26b990e
Create Date: 2026-03-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f1e9d2ab77"
down_revision: Union[str, Sequence[str], None] = "9587a26b990e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_fk_constraints_for_column(table_name: str, column_name: str) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table_name
              AND COLUMN_NAME = :column_name
              AND REFERENCED_TABLE_NAME IS NOT NULL
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).fetchall()

    for row in rows:
        op.drop_constraint(row[0], table_name, type_="foreignkey")


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
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

    if row:
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    """Upgrade schema."""
    _drop_fk_constraints_for_column("players", "user_id")
    _drop_fk_constraints_for_column("teams", "user_id")

    _drop_index_if_exists("players", "ix_players_user_id")
    _drop_index_if_exists("teams", "ix_teams_user_id")

    op.drop_column("players", "user_id")
    op.drop_column("teams", "user_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("teams", sa.Column("user_id", sa.String(length=36), nullable=True))
    op.add_column("players", sa.Column("user_id", sa.String(length=36), nullable=True))

    op.create_index("ix_teams_user_id", "teams", ["user_id"], unique=False)
    op.create_index("ix_players_user_id", "players", ["user_id"], unique=False)

    op.create_foreign_key(None, "teams", "users", ["user_id"], ["id"])
    op.create_foreign_key(None, "players", "users", ["user_id"], ["id"])
