from typing import List, Optional
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_admin, get_payment_gateway
from app.models.admin import AdminUser
from app.schemas.booking import (
    AdminBookingResponse,
    BookingCancelRequest,
    BlockedDateCreate,
    BlockedDateResponse,
)
from app.services import booking_service

router = APIRouter()

# ---- BOOKINGS ----


@router.get("/", response_model=List[AdminBookingResponse])
def list_bookings(
    filter_date: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """List all bookings with optional date/status filters (Admin only)."""
    return booking_service.get_bookings(db, filter_date, status)


@router.put("/{booking_id}/confirm")
def confirm_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Manually confirm a pending booking."""
    booking_service.update_booking_status(db, booking_id, "confirmed")
    return {"ok": True}


@router.put("/{booking_id}/cancel")
def admin_cancel_booking(
    booking_id: UUID,
    body: Optional[BookingCancelRequest] = Body(default=None),
    payment_gateway=Depends(get_payment_gateway),
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Cancel a booking with an optional reason."""
    reason = body.cancellation_reason if body else None
    booking, refunded, message = booking_service.cancel_booking(
        db, booking_id, reason, payment_gateway, admin=True
    )
    return {
        "ok": True,
        "status": booking.status,
        "refunded": refunded,
        "refund_policy_message": message,
    }


# ---- BLOCKED DATES ----


@router.get("/blocked-dates", response_model=List[BlockedDateResponse])
def list_blocked_dates_admin(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """List upcoming blocked dates (Admin only)."""
    return booking_service.get_blocked_dates(db)


@router.post(
    "/blocked-dates",
    response_model=BlockedDateResponse,
    status_code=status.HTTP_201_CREATED,
)
def block_a_date(
    block_in: BlockedDateCreate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Block a date from being booked."""
    return booking_service.block_date(db, block_in)


@router.delete("/blocked-dates/{blocked_id}", status_code=status.HTTP_204_NO_CONTENT)
def unblock_a_date(
    blocked_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Unblock a date."""
    booking_service.unblock_date(db, blocked_id)
    return None
