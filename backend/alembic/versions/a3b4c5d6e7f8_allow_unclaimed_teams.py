"""allow unclaimed teams

Revision ID: a3b4c5d6e7f8
Revises: e2b3c4d5e6f7
"""

from alembic import op
import sqlalchemy as sa

revision = "a3b4c5d6e7f8"
down_revision = "e2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("teams", "club_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    op.alter_column("teams", "club_id", existing_type=sa.String(36), nullable=False)
