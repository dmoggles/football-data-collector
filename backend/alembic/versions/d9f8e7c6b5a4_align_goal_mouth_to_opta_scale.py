"""align goal mouth coordinates to OPTA scale

Revision ID: d9f8e7c6b5a4
Revises: c3d4e5f6a7b8
Create Date: 2026-03-08 12:20:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "d9f8e7c6b5a4"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE events SET goal_mouth_y = NULL WHERE goal_mouth_y < 0 OR goal_mouth_y > 100")
    op.execute("UPDATE events SET goal_mouth_z = NULL WHERE goal_mouth_z < 0 OR goal_mouth_z > 20")
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
        "goal_mouth_z IS NULL OR (goal_mouth_z >= 0 AND goal_mouth_z <= 20)",
    )


def downgrade() -> None:
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
