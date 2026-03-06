from pydantic import BaseModel, ConfigDict, Field


class PlayerCreateRequest(BaseModel):
    team_id: str
    display_name: str = Field(min_length=1, max_length=120)
    shirt_number: int | None = Field(default=None, ge=1, le=99)
    position: str | None = Field(default=None, max_length=50)


class PlayerUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    shirt_number: int | None = Field(default=None, ge=1, le=99)
    position: str | None = Field(default=None, max_length=50)


class PlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    display_name: str
    shirt_number: int | None
    position: str | None
