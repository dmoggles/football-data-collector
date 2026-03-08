from datetime import datetime

from pydantic import BaseModel, Field


class CollectionSessionStartRequest(BaseModel):
    match_id: str = Field(min_length=1, max_length=36)
    team_id: str = Field(min_length=1, max_length=36)
    confirm_off_schedule: bool = False


class CollectionSessionActionRequest(BaseModel):
    team_id: str = Field(min_length=1, max_length=36)


class CollectionSessionResponse(BaseModel):
    id: str
    match_id: str
    team_id: str
    fixture_label: str
    kickoff_at: datetime | None
    format: str
    state: str
    period_number: int
    total_periods: int
    period_length_minutes: int
    elapsed_seconds: int
    current_period_elapsed_seconds: int
    is_period_running: bool
    can_end_period: bool
    can_start_next_period: bool
    next_period_available: bool
    off_schedule_warning: str | None = None
