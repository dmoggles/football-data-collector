from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("x_pct IS NULL OR (x_pct >= 0 AND x_pct <= 100)", name="ck_events_x_pct_range"),
        CheckConstraint("y_pct IS NULL OR (y_pct >= 0 AND y_pct <= 100)", name="ck_events_y_pct_range"),
        CheckConstraint(
            "end_x_pct IS NULL OR (end_x_pct >= 0 AND end_x_pct <= 100)",
            name="ck_events_end_x_pct_range",
        ),
        CheckConstraint(
            "end_y_pct IS NULL OR (end_y_pct >= 0 AND end_y_pct <= 100)",
            name="ck_events_end_y_pct_range",
        ),
        CheckConstraint(
            "goal_mouth_y IS NULL OR (goal_mouth_y >= 0 AND goal_mouth_y <= 100)",
            name="ck_events_goal_mouth_y_range",
        ),
        CheckConstraint(
            "goal_mouth_z IS NULL OR (goal_mouth_z >= 0 AND goal_mouth_z <= 20)",
            name="ck_events_goal_mouth_z_range",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("teams.id"),
        nullable=False,
        index=True,
    )
    player_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("players.id"),
        nullable=True,
        index=True,
    )
    event_kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    period_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    period_second: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    x_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    y_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    end_x_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    end_y_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    goal_mouth_y: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    goal_mouth_z: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
