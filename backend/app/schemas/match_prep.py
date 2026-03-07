from datetime import datetime

from pydantic import BaseModel, Field


class MatchPrepFixtureResponse(BaseModel):
    id: str
    team_id: str
    team_name: str
    opponent_team_id: str
    opponent_team_name: str
    kickoff_at: datetime | None
    status: str
    format: str


class MatchPrepPlayerSelection(BaseModel):
    player_id: str = Field(min_length=1, max_length=36)
    is_available: bool
    in_matchday_squad: bool
    is_starting: bool
    lineup_slot: str | None = Field(default=None, max_length=20)


class MatchPrepPlayerSelectionResponse(BaseModel):
    player_id: str
    player_name: str
    shirt_number: int | None
    position: str | None
    is_available: bool
    in_matchday_squad: bool
    is_starting: bool
    lineup_slot: str | None


class MatchPrepPlanUpsertRequest(BaseModel):
    match_id: str = Field(min_length=1, max_length=36)
    team_id: str = Field(min_length=1, max_length=36)
    formation: str = Field(min_length=1, max_length=30)
    players: list[MatchPrepPlayerSelection]


class MatchPrepPlanResponse(BaseModel):
    match_id: str
    team_id: str
    formation: str
    format: str
    required_starting_count: int
    formation_options: list[str]
    players: list[MatchPrepPlayerSelectionResponse]
