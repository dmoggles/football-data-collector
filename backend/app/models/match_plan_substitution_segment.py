from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MatchPlanSubstitutionSegment(Base):
    __tablename__ = "match_plan_substitution_segments"
    __table_args__ = (
        UniqueConstraint(
            "match_plan_id",
            "segment_order",
            name="uq_match_plan_sub_segments_plan_order",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    match_plan_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("match_plans.id"),
        nullable=False,
        index=True,
    )
    segment_order: Mapped[int] = mapped_column(Integer, nullable=False)
    end_minute: Mapped[int] = mapped_column(Integer, nullable=False)
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
