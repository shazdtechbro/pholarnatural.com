from pydantic import Field
from app.schemas.common import InputModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ProductImageBase(BaseModel):
    id: UUID
    url: str
    alt: Optional[str] = None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ProductVariantBase(BaseModel):
    id: UUID
    weight_grams: Optional[int] = None
    weight_label: Optional[str] = Field(default=None, max_length=50)
    price_cents: int
    stock_count: int
    sku: Optional[str] = Field(default=None, max_length=100)
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class ProductResponse(BaseModel):
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    is_bestseller: bool = False
    """
    This is the exact JSON structure the frontend will receive.
    Notice how it nests the images and variants automatically.
    """

    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    tagline: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    images: List[ProductImageBase] = []
    variants: List[ProductVariantBase] = []

    model_config = ConfigDict(from_attributes=True)


# ----- VARIANTS -----
class VariantCreate(InputModel):
    weight_grams: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    weight_label: Optional[str] = Field(default=None, max_length=50)
    price_cents: int = Field(default=..., strict=True, ge=0, le=10000000)
    stock_count: int = Field(default=0, strict=True, ge=0, le=10000000)
    sku: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True


class VariantUpdate(InputModel):
    weight_grams: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    weight_label: Optional[str] = Field(default=None, max_length=50)
    price_cents: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    stock_count: Optional[int] = Field(default=None, strict=True, ge=0, le=10000000)
    sku: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None


# ----- PRODUCTS -----
class ProductCreate(InputModel):
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    is_bestseller: bool = False
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=10000)
    tagline: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True
    # Allow creating variants at the same time as the product
    variants: List[VariantCreate] = Field(default_factory=list, max_length=100)


class ProductUpdate(InputModel):
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = Field(default=None, max_length=500)
    is_bestseller: Optional[bool] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    description: Optional[str] = Field(default=None, max_length=10000)
    tagline: Optional[str] = Field(default=None, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None
