from uuid import UUID
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, model_validator, Field
from typing import Literal
from app.schemas.common import InputModel, Name
from datetime import date, datetime


# Represents a single item in the shopping cart
class CartItem(InputModel):
    variant_id: UUID
    quantity: int = Field(strict=True, ge=1, le=100)


class AddressSchema(InputModel):
    full_name: Name
    address_line1: Name
    address_line2: Optional[str] = Field(default=None, max_length=255)
    city: Name
    province: Name
    postal_code: Name
    country: Name


# What the frontend sends when they click "Checkout"
class OrderCreate(InputModel):
    customer_name: Name
    customer_email: EmailStr
    shipping_address: AddressSchema
    items: List[CartItem] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def unique_variants(self):
        if len({i.variant_id for i in self.items}) != len(self.items):
            raise ValueError("Duplicate variants are not allowed; combine quantities.")
        return self

    discount_code: Optional[str] = Field(default=None, min_length=1, max_length=50)


class OrderResponse(BaseModel):
    id: UUID
    customer_name: Name
    customer_email: EmailStr
    subtotal_cents: int
    shipping_cents: int
    discount_cents: int
    tax_cents: int = 0
    total_cents: int
    status: str

    model_config = {"from_attributes": True}


class CheckoutResponse(BaseModel):
    checkout_url: str
    order_id: UUID


class OrderCreateResponse(BaseModel):
    """Phase 2 response — no Stripe checkout URL required."""

    id: UUID
    subtotal_cents: int
    shipping_cents: int
    discount_cents: int
    total_cents: int
    status: str

    model_config = {"from_attributes": True}


class OrderCheckoutResponse(BaseModel):
    """Phase 9: Stripe Checkout Session created — redirect the customer to checkout_url."""

    order_id: UUID
    checkout_url: str
    confirmation_token: str
    total_cents: int
    status: str


class BlockedDateCreate(BaseModel):
    date: date
    reason: Optional[str] = None


class BlockedDateResponse(BaseModel):
    id: UUID
    date: date
    reason: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderItemResponse(BaseModel):
    id: UUID
    product_name: str
    variant_label: Optional[str] = None
    quantity: int = Field(strict=True, ge=1, le=100)
    unit_price_cents: int

    model_config = {"from_attributes": True}


class AdminOrderResponse(BaseModel):
    id: UUID
    order_number: str
    customer_name: Name
    customer_email: str
    shipping_address: Any
    subtotal_cents: int
    shipping_cents: int
    discount_cents: int
    tax_cents: int = 0
    total_cents: int
    status: str
    created_at: datetime
    items: List[OrderItemResponse]

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "order_number": f"PN-{str(data.id)[:8].upper()}",
            "customer_name": data.customer_name,
            "customer_email": data.customer_email,
            "shipping_address": data.shipping_address or {},
            "subtotal_cents": data.subtotal_cents,
            "shipping_cents": data.shipping_cents,
            "discount_cents": data.discount_cents,
            "tax_cents": data.tax_cents,
            "total_cents": data.total_cents,
            "status": data.status,
            "created_at": data.created_at,
            "items": [
                {
                    "id": item.id,
                    "product_name": item.product_name,
                    "variant_label": item.variant_label,
                    "quantity": item.quantity,
                    "unit_price_cents": item.unit_price_cents,
                }
                for item in data.items
            ],
        }


# ----- ORDERS -----
class OrderStatusUpdate(BaseModel):
    status: Literal["confirmed", "processing", "shipped", "delivered", "cancelled"]
