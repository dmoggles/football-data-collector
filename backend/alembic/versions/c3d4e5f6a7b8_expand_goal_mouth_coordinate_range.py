"""expand_goal_mouth_coordinate_range

Revision ID: c3d4e5f6a7b8
Revises: b7c6d5e4f3a2
Create Date: 2026-03-08 22:15:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b7c6d5e4f3a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_events_goal_mouth_y_range", "events", type_="check")
    op.drop_constraint("ck_events_goal_mouth_z_range", "events", type_="check")
    op.create_check_constraint(
        "ck_events_goal_mouth_y_range",
        "events",
        "goal_mouth_y IS NULL OR (goal_mouth_y >= -50 AND goal_mouth_y <= 150)",
    )
    op.create_check_constraint(
        "ck_events_goal_mouth_z_range",
        "events",
        "goal_mouth_z IS NULL OR (goal_mouth_z >= -50 AND goal_mouth_z <= 150)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_events_goal_mouth_y_range", "events", type_="check")
    op.drop_constraint("ck_events_goal_mouth_z_range", "events", type_="check")
    op.create_check_constraint(
        "ck_events_goal_mouth_y_range",
        "events",
        "goal_mouth_y IS NULL OR (goal_mouth_y >= 0 AND goal_mouth_y <= 100)",
    )
    op.create_check_constraint(
        "ck_events_goal_mouth_z_range",
        "events",
        "goal_mouth_z IS NULL OR (goal_mouth_z >= 0 AND goal_mouth_z <= 100)",
    )
