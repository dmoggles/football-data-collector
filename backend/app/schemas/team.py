from pydantic import BaseModel, ConfigDict, Field

from app.models.team_membership import TeamRole


class TeamCreateRequest(BaseModel):
    club_name: str = Field(min_length=1, max_length=120)
    team_name: str = Field(min_length=1, max_length=120)


class TeamUpdateRequest(BaseModel):
    club_name: str = Field(min_length=1, max_length=120)
    team_name: str = Field(min_length=1, max_length=120)


class TeamMemberCreateRequest(BaseModel):
    user_email: str = Field(min_length=5, max_length=255)
    role: TeamRole


class TeamMemberUpdateRequest(BaseModel):
    role: TeamRole


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    user_id: str
    user_email: str
    role: str


class TeamResponse(BaseModel):
    id: str
    club_id: str
    club_name: str
    club_logo_url: str | None = None
    team_name: str
    my_role: str


class TeamDirectoryResponse(BaseModel):
    id: str
    club_id: str
    club_name: str
    club_logo_url: str | None = None
    team_name: str
