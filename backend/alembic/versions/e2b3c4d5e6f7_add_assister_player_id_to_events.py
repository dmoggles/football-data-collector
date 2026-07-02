"""add assister_player_id to events

Revision ID: e2b3c4d5e6f7
Revises: d9f8e7c6b5a4
Create Date: 2026-07-02 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e2b3c4d5e6f7"
down_revision: str | None = "d9f8e7c6b5a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "assister_player_id",
            sa.String(36),
            sa.ForeignKey("players.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_events_assister_player_id", "events", ["assister_player_id"])


def downgrade() -> None:
    op.drop_index("ix_events_assister_player_id", table_name="events")
    op.drop_column("events", "assister_player_id")
