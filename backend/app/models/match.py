from datetime import datetime
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MatchFormat(StrEnum):
    FIVE_ASIDE = "5_aside"
    SEVEN_ASIDE = "7_aside"
    NINE_ASIDE = "9_aside"
    ELEVEN_ASIDE = "11_aside"


class MatchPeriodFormat(StrEnum):
    HALVES = "halves"
    QUARTERS = "quarters"
    NON_STOP = "non_stop"


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    home_team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    away_team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    format: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=MatchFormat.ELEVEN_ASIDE.value,
        server_default=text("'11_aside'"),
    )
    period_format: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=MatchPeriodFormat.HALVES.value,
        server_default=text("'halves'"),
    )
    period_length_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=35,
        server_default=text("35"),
    )
    kickoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="scheduled")
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
