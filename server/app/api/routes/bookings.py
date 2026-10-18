from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_payment_gateway
from app.core.config import settings
from app.schemas.booking import (
    BlockedDateResponse,
    BookingCreate,
    BookingCancelRequest,
    BookingCancelResponse,
    BookingDepositResponse,
    SlotsResponse,
    SlotInfo,
)
from app.services import booking_service
from app.services.payment_gateway import PaymentGateway
from app.services.whatsapp import notify, NotificationEvent

router = APIRouter()


@router.get("/blocked-dates", response_model=List[BlockedDateResponse])
def list_blocked_dates(db: Session = Depends(get_db)):
    """Get all dates that are blocked from booking."""
    return booking_service.get_blocked_dates(db)


@router.get("/slots", response_model=SlotsResponse)
def get_slots(
    date: date = Query(..., description="Date to check (YYYY-MM-DD)"),
    service_id: Optional[UUID] = Query(
        None, description="Service UUID — used to compute duration"
    ),
    db: Session = Depends(get_db),
):
    """Return all 7 fixed slots (10:00–16:00) with availability for the given date."""
    raw = booking_service.get_available_slots(
        db, target_date=date, service_id=service_id
    )
    return SlotsResponse(
        date=date,
        slots=[SlotInfo(time=s["time"], available=s["available"]) for s in raw],
    )


@router.post("/", response_model=BookingDepositResponse, status_code=201)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    payment_gateway: PaymentGateway = Depends(get_payment_gateway),
):
    """
    Validate availability, create a pending booking, and open a Stripe Payment Intent
    for the 10% deposit. Mount the Payment Element on the client using client_secret.
    WhatsApp new_booking alert fires after the payment_intent.succeeded webhook arrives.
    """
    from fastapi import HTTPException

    key = settings.STRIPE_PUBLISHABLE_KEY
    if not key.startswith(("pk_test_", "pk_live_")):
        raise HTTPException(
            503, "Deposit payment is not configured yet. Please contact the studio."
        )
    secret = settings.STRIPE_SECRET_KEY
    if (secret.startswith("sk_test_") and not key.startswith("pk_test_")) or (
        secret.startswith("sk_live_") and not key.startswith("pk_live_")
    ):
        raise HTTPException(503, "Deposit payment configuration needs attention.")
    db_booking, client_secret = booking_service.create_booking_with_payment_intent(
        db=db,
        booking_in=booking_in,
        payment_gateway=payment_gateway,
    )
    return BookingDepositResponse(
        booking_id=db_booking.id,
        client_secret=client_secret,
        confirmation_token=__import__(
            "app.core.security", fromlist=["customer_token"]
        ).customer_token("booking", db_booking.id),
        reference=f"PN-{str(db_booking.id)[:8].upper()}",
        publishable_key=settings.STRIPE_PUBLISHABLE_KEY,
        amount_cents=db_booking.deposit_cents,
        booking_date=db_booking.booking_date,
        start_time=db_booking.start_time,
        end_time=db_booking.end_time,
        status=db_booking.status,
    )


@router.post("/{booking_id}/cancel", response_model=BookingCancelResponse)
def cancel_booking(
    booking_id: UUID,
    cancel_in: BookingCancelRequest,
    x_confirmation_token: str = Header(...),
    db: Session = Depends(get_db),
    payment_gateway: PaymentGateway = Depends(get_payment_gateway),
):
    """
    Cancel a booking.
    - Within 30 minutes of creation: full Stripe refund of the deposit.
    - Outside 30 minutes: cancelled without refund.
    Response includes refunded (bool) and a plain-English refund_policy_message.
    """
    from app.core.security import verify_customer_token

    verify_customer_token(x_confirmation_token, "booking", booking_id)
    booking, refunded, refund_message = booking_service.cancel_booking(
        db=db,
        booking_id=booking_id,
        cancellation_reason=cancel_in.cancellation_reason,
        payment_gateway=payment_gateway,
    )

    return BookingCancelResponse(
        id=booking.id,
        status=booking.status,
        cancellation_reason=booking.cancellation_reason,
        refunded=refunded,
        refund_policy_message=refund_message,
    )


@router.get("/{booking_id}")
def booking_confirmation(
    booking_id: UUID,
    x_confirmation_token: str = Header(...),
    db: Session = Depends(get_db),
):
    from app.core.security import verify_customer_token
    from app.models.booking import Booking
    from fastapi import HTTPException

    verify_customer_token(x_confirmation_token, "booking", booking_id)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found.")
    return {
        "id": str(booking.id),
        "reference": f"PN-{str(booking.id)[:8].upper()}",
        "service_name": booking.service.name,
        "service_id": str(booking.service_id),
        "customer_name": booking.customer_name,
        "customer_email": booking.customer_email,
        "customer_phone": booking.customer_phone,
        "booking_date": booking.booking_date,
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "status": booking.status,
        "deposit_cents": booking.deposit_cents,
        "cancellation_reason": booking.cancellation_reason,
        "created_at": booking.created_at,
    }
