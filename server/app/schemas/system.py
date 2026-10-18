from uuid import UUID

from pydantic import BaseModel, EmailStr, Field
from app.schemas.common import InputModel, Name
from typing import List, Optional
from datetime import datetime


# ----- CONTACT MESSAGES -----
class ContactCreate(InputModel):
    name: Name
    email: EmailStr
    subject: Optional[str] = Field(default=None, max_length=255)
    message: str = Field(min_length=1, max_length=5000)


class ContactResponse(ContactCreate):
    id: UUID
    is_read: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ----- SETTINGS -----
class SettingItem(BaseModel):
    key: str
    value: str
    model_config = {"from_attributes": True}


class TestMessage(BaseModel):
    target: str  # email address or phone number
    message: str = Field(min_length=1, max_length=5000)


# ----- DASHBOARD -----


class DashboardOrder(BaseModel):
    id: str
    order_number: str
    customer_name: str
    total_cents: int
    status: str
    created_at: str


class DashboardBooking(BaseModel):
    id: str
    customer_name: str
    service_id: str
    service_name: str
    booking_date: str
    start_time: str
    status: str


class DashboardStats(BaseModel):
    orders_today: int
    revenue_today_cents: int
    revenue_total_cents: int
    bookings_today: int
    recent_orders: List[DashboardOrder]
    upcoming_bookings: List[DashboardBooking]
