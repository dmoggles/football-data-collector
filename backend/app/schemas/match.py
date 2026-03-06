from datetime import datetime

from pydantic import BaseModel, Field

from app.models.match import MatchFormat


class MatchCreateRequest(BaseModel):
    home_team_id: str = Field(min_length=1, max_length=36)
    away_team_id: str = Field(min_length=1, max_length=36)
    format: MatchFormat
    kickoff_at: datetime | None = None
    status: str = Field(default="scheduled", min_length=1, max_length=30)


class MatchUpdateRequest(BaseModel):
    home_team_id: str = Field(min_length=1, max_length=36)
    away_team_id: str = Field(min_length=1, max_length=36)
    format: MatchFormat
    kickoff_at: datetime | None = None
    status: str = Field(default="scheduled", min_length=1, max_length=30)


class MatchResponse(BaseModel):
    id: str
    home_team_id: str
    home_team_name: str
    home_club_name: str
    away_team_id: str
    away_team_name: str
    away_club_name: str
    format: str
    kickoff_at: datetime | None
    status: str
    can_manage: bool
