from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: UserRole
    active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.CONSULTANT

