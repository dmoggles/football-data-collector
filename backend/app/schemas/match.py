from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.match import MatchFormat, MatchPeriodFormat


class MatchCreateRequest(BaseModel):
    home_team_id: str | None = Field(default=None, min_length=1, max_length=36)
    away_team_id: str | None = Field(default=None, min_length=1, max_length=36)
    home_team_name: str | None = Field(default=None, min_length=1, max_length=120)
    away_team_name: str | None = Field(default=None, min_length=1, max_length=120)
    format: MatchFormat
    period_format: MatchPeriodFormat
    period_length_minutes: int = Field(ge=1, le=120)
    kickoff_at: datetime | None = None
    status: str = Field(default="scheduled", min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_team_references(self) -> "MatchCreateRequest":
        if (self.home_team_id is None) == (self.home_team_name is None):
            raise ValueError("Provide exactly one home team ID or name")
        if (self.away_team_id is None) == (self.away_team_name is None):
            raise ValueError("Provide exactly one away team ID or name")
        if self.home_team_name is not None and self.away_team_name is not None:
            raise ValueError("Only the opposition team may be provided by name")
        return self


class MatchUpdateRequest(MatchCreateRequest):
    format: MatchFormat
    period_format: MatchPeriodFormat
    period_length_minutes: int = Field(ge=1, le=120)
    kickoff_at: datetime | None = None


class MatchResponse(BaseModel):
    id: str
    home_team_id: str
    home_team_name: str
    home_club_name: str
    away_team_id: str
    away_team_name: str
    away_club_name: str
    format: str
    period_format: str
    period_length_minutes: int
    kickoff_at: datetime | None
    status: str
    can_manage: bool
