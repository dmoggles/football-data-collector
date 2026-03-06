"""add_match_format_column

Revision ID: f1b2c3d4e5f6
Revises: 2a1d7b9f45c3
Create Date: 2026-03-06 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "2a1d7b9f45c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "matches",
        sa.Column(
            "format",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'11_aside'"),
        ),
    )
    op.create_check_constraint(
        "ck_matches_format_allowed",
        "matches",
        "format IN ('5_aside', '7_aside', '9_aside', '11_aside')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_matches_format_allowed", "matches", type_="check")
    op.drop_column("matches", "format")
