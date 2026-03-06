"""add_match_period_fields

Revision ID: a7e8f9d0c1b2
Revises: f1b2c3d4e5f6
Create Date: 2026-03-06 15:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7e8f9d0c1b2"
down_revision: Union[str, Sequence[str], None] = "f1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "matches",
        sa.Column(
            "period_format",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'halves'"),
        ),
    )
    op.add_column(
        "matches",
        sa.Column(
            "period_length_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("35"),
        ),
    )
    op.create_check_constraint(
        "ck_matches_period_format_allowed",
        "matches",
        "period_format IN ('halves', 'quarters', 'non_stop')",
    )
    op.create_check_constraint(
        "ck_matches_period_length_minutes_range",
        "matches",
        "period_length_minutes >= 1 AND period_length_minutes <= 120",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_matches_period_length_minutes_range", "matches", type_="check")
    op.drop_constraint("ck_matches_period_format_allowed", "matches", type_="check")
    op.drop_column("matches", "period_length_minutes")
    op.drop_column("matches", "period_format")
