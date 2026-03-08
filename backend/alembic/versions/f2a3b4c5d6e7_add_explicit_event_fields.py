"""add_explicit_event_fields

Revision ID: f2a3b4c5d6e7
Revises: e1a2b3c4d5e6
Create Date: 2026-03-08 19:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("event_kind", sa.String(length=50), nullable=False, server_default=sa.text("'unknown'")),
    )
    op.add_column(
        "events",
        sa.Column("period_number", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.add_column(
        "events",
        sa.Column("period_second", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("events", sa.Column("x_pct", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("events", sa.Column("y_pct", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("events", sa.Column("end_x_pct", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("events", sa.Column("end_y_pct", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("events", sa.Column("goal_mouth_y", sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("events", sa.Column("goal_mouth_z", sa.Numeric(precision=5, scale=2), nullable=True))

    op.execute("UPDATE events SET event_kind = event_type, period_number = 1, period_second = match_second")

    op.create_index(op.f("ix_events_event_kind"), "events", ["event_kind"], unique=False)
    op.drop_index(op.f("ix_events_event_type"), table_name="events")

    op.create_check_constraint(
        "ck_events_x_pct_range",
        "events",
        "x_pct IS NULL OR (x_pct >= 0 AND x_pct <= 100)",
    )
    op.create_check_constraint(
        "ck_events_y_pct_range",
        "events",
        "y_pct IS NULL OR (y_pct >= 0 AND y_pct <= 100)",
    )
    op.create_check_constraint(
        "ck_events_end_x_pct_range",
        "events",
        "end_x_pct IS NULL OR (end_x_pct >= 0 AND end_x_pct <= 100)",
    )
    op.create_check_constraint(
        "ck_events_end_y_pct_range",
        "events",
        "end_y_pct IS NULL OR (end_y_pct >= 0 AND end_y_pct <= 100)",
    )
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

    op.drop_column("events", "event_type")
    op.drop_column("events", "match_second")


def downgrade() -> None:
    op.add_column(
        "events",
        sa.Column("event_type", sa.String(length=50), nullable=False, server_default=sa.text("'unknown'")),
    )
    op.add_column(
        "events",
        sa.Column("match_second", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    op.execute("UPDATE events SET event_type = event_kind, match_second = period_second")

    op.create_index(op.f("ix_events_event_type"), "events", ["event_type"], unique=False)
    op.drop_index(op.f("ix_events_event_kind"), table_name="events")

    op.drop_constraint("ck_events_goal_mouth_z_range", "events", type_="check")
    op.drop_constraint("ck_events_goal_mouth_y_range", "events", type_="check")
    op.drop_constraint("ck_events_end_y_pct_range", "events", type_="check")
    op.drop_constraint("ck_events_end_x_pct_range", "events", type_="check")
    op.drop_constraint("ck_events_y_pct_range", "events", type_="check")
    op.drop_constraint("ck_events_x_pct_range", "events", type_="check")

    op.drop_column("events", "goal_mouth_z")
    op.drop_column("events", "goal_mouth_y")
    op.drop_column("events", "end_y_pct")
    op.drop_column("events", "end_x_pct")
    op.drop_column("events", "y_pct")
    op.drop_column("events", "x_pct")
    op.drop_column("events", "period_second")
    op.drop_column("events", "period_number")
    op.drop_column("events", "event_kind")
