from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MatchPlanSubstitution(Base):
    __tablename__ = "match_plan_substitutions"
    __table_args__ = (
        UniqueConstraint(
            "segment_id",
            "player_out_id",
            name="uq_match_plan_subs_segment_player_out",
        ),
        UniqueConstraint(
            "segment_id",
            "player_in_id",
            name="uq_match_plan_subs_segment_player_in",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    segment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("match_plan_substitution_segments.id"),
        nullable=False,
        index=True,
    )
    player_out_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("players.id"),
        nullable=False,
        index=True,
    )
    player_in_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("players.id"),
        nullable=False,
        index=True,
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
