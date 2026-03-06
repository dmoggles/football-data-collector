from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MatchSquad(Base):
    __tablename__ = "match_squads"
    __table_args__ = (
        UniqueConstraint("match_id", "player_id", name="uq_match_squads_match_player"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    match_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("matches.id"),
        nullable=False,
        index=True,
    )
    player_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("players.id"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("teams.id"),
        nullable=False,
        index=True,
    )
    is_starting: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
