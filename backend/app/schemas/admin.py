from pydantic import BaseModel, Field


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


class AdminTeamOwnerOverview(BaseModel):
    user_id: str
    user_email: str
    role: str


class AdminTeamOverview(BaseModel):
    id: str
    club_id: str
    club_name: str
    team_name: str
    owners: list[AdminTeamOwnerOverview]


class AdminOverviewResponse(BaseModel):
    users: list[AdminUserOverview]
    clubs: list[AdminClubOverview]
    teams: list[AdminTeamOverview]
