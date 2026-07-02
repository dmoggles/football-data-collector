from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CollectionSession(Base):
    __tablename__ = "collection_sessions"
    __table_args__ = (
        UniqueConstraint("match_id", "team_id", name="uq_collection_sessions_match_team"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("teams.id"),
        nullable=False,
        index=True,
    )
    started_by_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="live",
        server_default=text("'live'"),
    )
    period_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    period_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    elapsed_seconds_before_period: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
