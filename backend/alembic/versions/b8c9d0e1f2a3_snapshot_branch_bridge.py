"""snapshot_branch_bridge

Revision ID: b8c9d0e1f2a3
Revises: a7e8f9d0c1b2
Create Date: 2026-03-07 22:05:00.000000

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a7e8f9d0c1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op bridge to keep local migration history linear after snapshot branch work."""


def downgrade() -> None:
    """No-op bridge to keep local migration history linear after snapshot branch work."""
