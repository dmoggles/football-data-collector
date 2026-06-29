from datetime import datetime
from typing import Literal

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


class CollectionEventCreateRequest(BaseModel):
    team_id: str = Field(min_length=1, max_length=36)
    event_kind: Literal["shot", "tackle", "interception", "shot_against"] = "shot"
    player_id: str | None = Field(default=None, min_length=1, max_length=36)
    x_pct: float = Field(ge=0, le=100)
    y_pct: float = Field(ge=0, le=100)
    goal_mouth_y: float | None = Field(default=None, ge=0, le=100)
    goal_mouth_z: float | None = Field(default=None, ge=0, le=20)
    shot_outcome: Literal["miss", "post", "save", "goal"] | None = None


class CollectionEventResponse(BaseModel):
    id: str
    session_id: str
    match_id: str
    team_id: str
    player_id: str | None
    event_kind: str
    period_number: int
    period_second: int
    x_pct: float
    y_pct: float
    end_x_pct: float | None = None
    end_y_pct: float | None = None
    goal_mouth_y: float | None = None
    goal_mouth_z: float | None = None
    shot_outcome: str | None = None
    receiving_player_id: str | None = None
    pass_completed: bool | None = None
    created_at: datetime
