from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
from app.schemas.common import InputModel


class AdminCreate(InputModel):
    model_config = ConfigDict(str_strip_whitespace=False, extra="forbid")
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)
    secret_key: str = Field(min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def bcrypt_limit(cls, value):
        if len(value.encode()) > 72:
            raise ValueError("Password must be at most 72 bytes.")
        return value


class AdminResponse(BaseModel):
    id: UUID
    email: EmailStr
    is_active: bool

    model_config = {"from_attributes": True}
