from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import or_, and_
from sqlalchemy.orm import joinedload
from app.models.booking import Booking, BlockedDate
from app.models.service import Service
from app.core.config import settings
from app.core.transactions import transaction_lock
from app.services.email import (
    queue_booking_confirmed,
    queue_booking_cancelled,
    queue_payment_failed,
)

SLOT_TIMES = [f"{h:02}:00" for h in range(10, 17)]
CLOSE_TIME = time(17)
DEPOSIT_RATE = 0.1
HOLD_MINUTES = 30


def studio_now():
    return datetime.now(ZoneInfo(settings.BUSINESS_TIMEZONE))


def active_bookings(db, target):
    return db.query(Booking).filter(
        Booking.booking_date == target,
        or_(
            Booking.status == "confirmed",
            and_(
                Booking.status == "pending",
                Booking.created_at
                > datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES),
            ),
        ),
    )


def get_bookings(db, filter_date=None, status=None):
    q = db.query(Booking).options(joinedload(Booking.service))
    if filter_date:
        q = q.filter(Booking.booking_date == filter_date)
    if status:
        q = q.filter(Booking.status == status)
    return q.order_by(Booking.booking_date.desc(), Booking.start_time).all()


def get_blocked_dates(db):
    return db.query(BlockedDate).filter(BlockedDate.date >= studio_now().date()).all()


def check_availability(db, booking_date, start_time, duration_minutes, exclude_id=None):
    now = studio_now()
    if booking_date < now.date() or booking_date > now.date() + timedelta(days=90):
        raise HTTPException(400, "Choose a date within the next 90 days.")
    if booking_date.weekday() == 6:
        raise HTTPException(400, "We are closed on Sundays.")
    if (
        start_time.strftime("%H:%M") not in SLOT_TIMES
        or start_time.second
        or start_time.microsecond
        or start_time.tzinfo
    ):
        raise HTTPException(400, "Invalid appointment start time.")
    start = datetime.combine(
        booking_date, start_time, tzinfo=ZoneInfo(settings.BUSINESS_TIMEZONE)
    )
    end = start + timedelta(minutes=duration_minutes)
    if (
        start <= now
        or end.date() != booking_date
        or end.time() > CLOSE_TIME
        or duration_minutes <= 0
    ):
        raise HTTPException(
            400, "Appointment must start in the future and finish by 17:00."
        )
    if db.query(BlockedDate).filter(BlockedDate.date == booking_date).first():
        raise HTTPException(409, "The studio is closed on this date.")
    q = active_bookings(db, booking_date).filter(
        Booking.start_time < end.time(), Booking.end_time > start_time
    )
    if exclude_id:
        q = q.filter(Booking.id != exclude_id)
    if q.first():
        raise HTTPException(409, "This time is no longer available.")
    return end.time()


def get_available_slots(db, target_date, service_id=None):
    duration = 60
    if service_id:
        svc = (
            db.query(Service)
            .filter(Service.id == service_id, Service.is_active == True)
            .first()
        )
        if not svc:
            raise HTTPException(404, "Service not found.")
        duration = svc.duration_minutes
    result = []
    for label in SLOT_TIMES:
        try:
            check_availability(db, target_date, time.fromisoformat(label), duration)
            available = True
        except HTTPException:
            available = False
        result.append({"time": label, "available": available})
    return result


def create_booking_with_payment_intent(db, booking_in, payment_gateway):
    transaction_lock(db, 903)
    svc = (
        db.query(Service)
        .filter(Service.id == booking_in.service_id, Service.is_active == True)
        .first()
    )
    if not svc:
        raise HTTPException(404, "Service not found.")
    end = check_availability(
        db, booking_in.booking_date, booking_in.start_time, svc.duration_minutes
    )
    deposit = (svc.price_cents + 5) // 10
    if deposit < 50:
        raise HTTPException(
            400, "Service deposit is below the supported payment minimum."
        )
    booking = Booking(
        **booking_in.model_dump(), end_time=end, status="pending", deposit_cents=deposit
    )
    db.add(booking)
    db.flush()
    try:
        result = payment_gateway.create_payment_intent(
            amount_cents=deposit,
            currency="cad",
            metadata={"type": "booking_deposit", "booking_id": str(booking.id)},
            customer_email=str(booking_in.customer_email),
        )
    except Exception:
        db.rollback()
        raise HTTPException(502, "Deposit setup unavailable. Please retry.")
    booking.stripe_payment_intent_id = result["payment_intent_id"]
    db.commit()
    db.refresh(booking)
    return booking, result["client_secret"]


def confirm_booking_payment_intent(db, payment_intent_id, payment_gateway=None):
    transaction_lock(db, 903)
    booking = (
        db.query(Booking)
        .options(joinedload(Booking.service))
        .filter(Booking.stripe_payment_intent_id == payment_intent_id)
        .first()
    )
    if not booking or booking.status in (
        "confirmed",
        "completed",
        "refunded",
        "refund_pending",
    ):
        return None
    try:
        if booking.status == "cancelled":
            raise HTTPException(409, "Cancelled")
        check_availability(
            db,
            booking.booking_date,
            booking.start_time,
            booking.service.duration_minutes,
            booking.id,
        )
    except HTTPException:
        if not payment_gateway:
            raise
        refund = payment_gateway.create_refund(payment_intent_id)
        if refund.get("status") not in ("pending", "succeeded"):
            raise HTTPException(502, "Late payment requires reconciliation.")
        booking.status = (
            "refunded" if refund["status"] == "succeeded" else "refund_pending"
        )
        queue_booking_cancelled(
            db,
            booking,
            "Your payment arrived after the reservation was no longer available. A full refund has been requested.",
        )
        db.commit()
        return None
    booking.status = "confirmed"
    queue_booking_confirmed(db, booking)
    db.commit()
    from app.services.whatsapp import notify, NotificationEvent

    notify(
        NotificationEvent.NEW_BOOKING,
        f"New booking PN-{str(booking.id)[:8].upper()}: {booking.booking_date} {booking.start_time}",
        db,
    )
    db.refresh(booking)
    return booking


def fail_booking_payment(db, payment_intent_id):
    transaction_lock(db, 903)
    booking = (
        db.query(Booking)
        .filter(Booking.stripe_payment_intent_id == payment_intent_id)
        .first()
    )
    if booking and booking.status == "pending":
        # A failed attempt can be retried on the same PaymentIntent until the hold expires.
        from app.models.notification import EmailDelivery

        first_failure = (
            not db.query(EmailDelivery)
            .filter(EmailDelivery.event_key == f"booking:{booking.id}:payment_failed")
            .first()
        )
        queue_payment_failed(db, booking, "booking")
        db.commit()
        if first_failure:
            from app.services.whatsapp import notify, NotificationEvent

            notify(
                NotificationEvent.PAYMENT_FAILED,
                f"Deposit payment failed for PN-{str(booking.id)[:8].upper()}",
                db,
            )
        return booking
    return None


def update_booking_status(db, booking_id, new_status):
    transaction_lock(db, 903)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found.")
    if new_status == "confirmed" and booking.status == "confirmed":
        return booking
    # Never let a manual confirm button turn an unpaid deposit into a paid booking.
    raise HTTPException(
        409, "Only a verified deposit payment can confirm an appointment."
    )


def cancel_booking(
    db, booking_id, cancellation_reason=None, payment_gateway=None, admin=False
):
    transaction_lock(db, 903)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found.")
    if booking.status in ("cancelled", "refunded", "refund_pending"):
        return (
            booking,
            booking.status == "refunded",
            "This appointment has already been cancelled.",
        )
    if booking.status == "completed":
        raise HTTPException(409, "Completed appointments cannot be cancelled.")
    was_paid = booking.status == "confirmed"
    refunded = False
    message = "No confirmed deposit payment was recorded."
    created = (
        booking.created_at.replace(tzinfo=timezone.utc)
        if booking.created_at.tzinfo is None
        else booking.created_at
    )
    if was_paid:
        grace = datetime.now(timezone.utc) - created <= timedelta(minutes=30)
        if grace or admin:
            if not payment_gateway:
                raise HTTPException(409, "Refund service required.")
            try:
                result = payment_gateway.create_refund(booking.stripe_payment_intent_id)
            except Exception:
                raise HTTPException(
                    502, "Refund request failed. Booking has not been cancelled."
                )
            if result.get("status") not in ("pending", "succeeded"):
                raise HTTPException(502, "Refund was not accepted.")
            refunded = result["status"] == "succeeded"
            message = (
                "Your full deposit refund was completed; your bank may take 5–10 business days."
                if refunded
                else "Your full deposit refund has been requested and is processing."
            )
            booking.status = "refunded" if refunded else "refund_pending"
        else:
            start = datetime.combine(
                booking.booking_date,
                booking.start_time,
                tzinfo=ZoneInfo(settings.BUSINESS_TIMEZONE),
            )
            message = (
                "The deposit is forfeited for cancellations within 24 hours of the appointment."
                if start - studio_now() <= timedelta(hours=24)
                else "The studio will review your refund eligibility under the cancellation policy."
            )
    if booking.status not in ("refunded", "refund_pending"):
        booking.status = "cancelled"
    booking.cancellation_reason = cancellation_reason
    queue_booking_cancelled(db, booking, message)
    db.commit()
    from app.services.whatsapp import notify, NotificationEvent

    notify(
        NotificationEvent.BOOKING_CANCELLED,
        f"Booking PN-{str(booking.id)[:8].upper()} cancelled. {message}",
        db,
    )
    db.refresh(booking)
    return booking, refunded, message


def block_date(db, block_in):
    transaction_lock(db, 903)
    if block_in.date < studio_now().date():
        raise HTTPException(400, "Cannot block a past date.")
    if db.query(BlockedDate).filter(BlockedDate.date == block_in.date).first():
        raise HTTPException(409, "Date already blocked.")
    if active_bookings(db, block_in.date).first():
        raise HTTPException(
            409, "Cancel existing reservations before closing this date."
        )
    row = BlockedDate(**block_in.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def unblock_date(db, blocked_id):
    transaction_lock(db, 903)
    row = db.query(BlockedDate).filter(BlockedDate.id == blocked_id).first()
    if not row:
        raise HTTPException(404, "Blocked date not found.")
    db.delete(row)
    db.commit()
