"""add_lineup_slot_to_match_plan_players

Revision ID: d4e5f6a7b8c9
Revises: c1d2e3f4a5b6
Create Date: 2026-03-07 21:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("match_plan_players", sa.Column("lineup_slot", sa.String(length=20), nullable=True))
    op.create_unique_constraint(
        "uq_match_plan_players_plan_slot",
        "match_plan_players",
        ["match_plan_id", "lineup_slot"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_match_plan_players_plan_slot", "match_plan_players", type_="unique")
    op.drop_column("match_plan_players", "lineup_slot")
