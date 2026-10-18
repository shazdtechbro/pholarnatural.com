from pydantic import Field
from typing import Annotated
from app.schemas.common import InputModel
from uuid import UUID

from pydantic import BaseModel
from typing import Optional


class ServiceBase(BaseModel):
    long_description: str = Field(default="", max_length=10000)
    what_to_expect: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=20
    )
    name: str
    slug: str
    description: Optional[str] = None
    duration_minutes: int
    price_cents: int
    image_url: Optional[str] = None
    is_active: bool = True


class ServiceResponse(ServiceBase):
    id: UUID

    # This tells Pydantic to read the data from SQLAlchemy models
    model_config = {"from_attributes": True}


class ServiceCreate(InputModel):
    long_description: str = Field(default="", max_length=10000)
    what_to_expect: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=20
    )
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=10000)
    duration_minutes: int = Field(default=..., strict=True, ge=1, le=420)
    price_cents: int = Field(default=..., strict=True, ge=0, le=10000000)
    image_url: Optional[str] = None
    is_active: bool = True


class ServiceUpdate(InputModel):
    long_description: str = Field(default="", max_length=10000)
    what_to_expect: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list, max_length=20
    )
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    description: Optional[str] = Field(default=None, max_length=10000)
    duration_minutes: Optional[int] = Field(default=None, strict=True, ge=1, le=420)
    price_cents: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
