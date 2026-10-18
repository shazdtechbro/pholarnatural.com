from pydantic import Field
from app.schemas.common import InputModel
from uuid import UUID

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from pydantic import model_validator
from typing import Literal


class DiscountCreate(InputModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    discount_type: Literal["percentage", "fixed"]
    value: int = Field(default=..., strict=True, ge=1, le=10000000)
    max_uses: Optional[int] = Field(default=None, strict=True, ge=1, le=10000000)
    min_order_cents: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    expires_at: Optional[datetime] = None
    is_active: bool = True

    @model_validator(mode="after")
    def percentage_limit(self):
        if self.discount_type == "percentage" and self.value > 100:
            raise ValueError("Percentage discount cannot exceed 100%.")
        return self


class DiscountUpdate(InputModel):
    code: Optional[str] = Field(
        default=None, min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$"
    )
    discount_type: Optional[Literal["percentage", "fixed"]] = None
    value: Optional[int] = Field(default=None, strict=True, ge=1, le=10000000)
    max_uses: Optional[int] = Field(default=None, strict=True, ge=1, le=10000000)
    min_order_cents: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class DiscountResponse(BaseModel):
    code: str
    discount_type: str
    value: int
    max_uses: Optional[int] = None
    min_order_cents: Optional[int] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    id: UUID
    used_count: int

    model_config = {"from_attributes": True}


class DiscountValidateRequest(InputModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    subtotal_cents: int = Field(default=..., strict=True, ge=0, le=10000000)


class DiscountValidateResponse(BaseModel):
    valid: bool
    code: str
    discount_type: str
    value: int
    discount_cents: int
    message: str
