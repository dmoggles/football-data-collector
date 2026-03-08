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


class MatchPrepSubstitutionSwap(BaseModel):
    player_out_id: str = Field(min_length=1, max_length=36)
    player_in_id: str = Field(min_length=1, max_length=36)


class MatchPrepSubstitutionSwapResponse(BaseModel):
    player_out_id: str
    player_out_name: str
    player_out_shirt_number: int | None
    player_in_id: str
    player_in_name: str
    player_in_shirt_number: int | None


class MatchPrepSubstitutionSegment(BaseModel):
    end_minute: int = Field(ge=1, le=300)
    substitutions: list[MatchPrepSubstitutionSwap] = Field(default_factory=list)


class MatchPrepSubstitutionSegmentResponse(BaseModel):
    segment_index: int
    end_minute: int
    substitutions: list[MatchPrepSubstitutionSwapResponse]


class MatchPrepPlanUpsertRequest(BaseModel):
    match_id: str = Field(min_length=1, max_length=36)
    team_id: str = Field(min_length=1, max_length=36)
    formation: str = Field(min_length=1, max_length=30)
    players: list[MatchPrepPlayerSelection]
    substitution_segments: list[MatchPrepSubstitutionSegment] = Field(default_factory=list)


class MatchPrepPlanResponse(BaseModel):
    match_id: str
    team_id: str
    formation: str
    format: str
    total_match_minutes: int
    required_starting_count: int
    formation_options: list[str]
    players: list[MatchPrepPlayerSelectionResponse]
    substitution_segments: list[MatchPrepSubstitutionSegmentResponse]


class MatchPrepPlanValidationResponse(BaseModel):
    match_id: str
    team_id: str
    valid: bool
    errors: list[str]
    warnings: list[str]


class CoachingNoteCreateRequest(BaseModel):
    match_id: str = Field(min_length=1, max_length=36)
    team_id: str = Field(min_length=1, max_length=36)
    player_id: str | None = Field(default=None, min_length=1, max_length=36)
    note_text: str = Field(min_length=1, max_length=2000)


class CoachingNoteResponse(BaseModel):
    id: str
    match_id: str
    team_id: str
    player_id: str | None
    player_name: str | None
    note_text: str
    created_at: datetime
