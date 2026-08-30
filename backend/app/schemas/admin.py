from datetime import datetime

from pydantic import BaseModel, Field

from app.models.global_role import GlobalRoleType


class ClubCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ClubUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class AssignTeamAdminRequest(BaseModel):
    user_email: str = Field(min_length=5, max_length=255)


class AdminTeamCreateRequest(BaseModel):
    club_id: str = Field(min_length=1, max_length=36)
    team_name: str = Field(min_length=1, max_length=120)


class AdminTeamUpdateRequest(BaseModel):
    club_id: str = Field(min_length=1, max_length=36)
    team_name: str = Field(min_length=1, max_length=120)


class AdminUserOverview(BaseModel):
    id: str
    email: str
    global_roles: list[str]


class AdminClubOverview(BaseModel):
    id: str
    name: str
    logo_url: str | None = None


class AdminTeamOwnerOverview(BaseModel):
    user_id: str
    user_email: str
    role: str


class AdminTeamOverview(BaseModel):
    id: str
    club_id: str | None
    club_name: str | None
    team_name: str
    is_unclaimed: bool
    owners: list[AdminTeamOwnerOverview]


class AdminTeamClaimRequest(BaseModel):
    team_name: str = Field(min_length=1, max_length=120)
    club_id: str | None = Field(default=None, min_length=1, max_length=36)
    new_club_name: str | None = Field(default=None, min_length=1, max_length=120)


class AdminTeamMergeRequest(BaseModel):
    target_team_id: str = Field(min_length=1, max_length=36)


class AdminTeamMergeCandidate(BaseModel):
    team_id: str
    display_name: str
    score: float


class AdminOverviewResponse(BaseModel):
    users: list[AdminUserOverview]
    clubs: list[AdminClubOverview]
    teams: list[AdminTeamOverview]


class GlobalRoleAssignRequest(BaseModel):
    role: GlobalRoleType


class AdminAuditLogEntry(BaseModel):
    id: str
    actor_user_id: str
    actor_user_email: str
    action: str
    target_type: str
    target_id: str
    metadata_json: dict | None
    created_at: datetime
