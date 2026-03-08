"""rename_team_admin_role_to_manager

Revision ID: e1a2b3c4d5e6
Revises: c7d1e2f3a4b5
Create Date: 2026-03-08 18:05:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "c7d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE team_memberships SET role = 'manager' WHERE role IN ('team_admin', 'admin')")


def downgrade() -> None:
    op.execute("UPDATE team_memberships SET role = 'team_admin' WHERE role = 'manager'")
