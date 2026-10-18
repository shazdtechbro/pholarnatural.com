from uuid import UUID
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, model_validator, Field
from app.schemas.common import InputModel, Name
from datetime import date, time, datetime


class BookingCreate(InputModel):
    service_id: UUID
    customer_name: Name
    customer_email: EmailStr
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    booking_date: date
    start_time: time


class BookingResponse(BaseModel):
    id: UUID
    service_id: UUID
    customer_name: Name
    customer_email: EmailStr
    booking_date: date
    start_time: time
    end_time: time
    status: str
    deposit_cents: int

    model_config = {"from_attributes": True}


class BookingCreateResponse(BaseModel):
    """Phase 2 response — no Stripe checkout URL required."""

    id: UUID
    booking_date: date
    start_time: time
    end_time: time
    status: str
    deposit_cents: int

    model_config = {"from_attributes": True}


class CheckoutResponse(BaseModel):
    checkout_url: str
    booking_id: UUID


# ----- SLOTS -----


class SlotInfo(BaseModel):
    time: str
    available: bool


class SlotsResponse(BaseModel):
    date: date
    slots: List[SlotInfo]


# ----- BLOCKED DATES -----
class BlockedDateCreate(BaseModel):
    date: date
    reason: Optional[str] = None


class BlockedDateResponse(BaseModel):
    id: UUID
    date: date
    reason: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ----- CANCELLATION -----
class BookingCancelRequest(BaseModel):
    cancellation_reason: Optional[str] = Field(default=None, max_length=255)


class BookingDepositResponse(BaseModel):
    """Phase 9: Payment Intent created — mount Payment Element using client_secret."""

    booking_id: UUID
    client_secret: str
    confirmation_token: str
    reference: str
    publishable_key: str
    amount_cents: int
    booking_date: date
    start_time: time
    end_time: time
    status: str


class BookingCancelResponse(BaseModel):
    id: UUID
    status: str
    cancellation_reason: Optional[str]
    refunded: bool = False
    refund_policy_message: str = ""

    model_config = {"from_attributes": True}


class AdminBookingResponse(BaseModel):
    id: UUID
    service_id: UUID
    service_name: str
    customer_name: Name
    customer_email: str
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    booking_date: date
    start_time: time
    end_time: time
    status: str
    deposit_cents: int
    cancellation_reason: Optional[str] = Field(default=None, max_length=255)
    reference: str

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        svc = getattr(data, "service", None)
        return {
            "id": data.id,
            "service_id": data.service_id,
            "service_name": svc.name if svc else "—",
            "customer_name": data.customer_name,
            "customer_email": data.customer_email,
            "customer_phone": getattr(data, "customer_phone", None),
            "booking_date": data.booking_date,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "status": data.status,
            "deposit_cents": data.deposit_cents,
            "cancellation_reason": getattr(data, "cancellation_reason", None),
            "reference": f"PN-{str(data.id)[:8].upper()}",
        }


# ----- ORDERS -----
class OrderStatusUpdate(BaseModel):
    status: str  # e.g., "shipped", "delivered", "cancelled"
