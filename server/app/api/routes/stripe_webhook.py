from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.api.dependencies import get_db, get_payment_gateway
from app.models.order import Order
from app.models.booking import Booking
from app.models.product import ProductVariant
from app.services import order_service, booking_service
from app.services.email import (
    queue_order_status,
    queue_booking_cancelled,
    queue_payment_failed,
)
from app.core.transactions import transaction_lock

router = APIRouter()


@router.post("/", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    payment_gateway=Depends(get_payment_gateway),
):
    payload = await request.body()
    if len(payload) > 1_000_000:
        raise HTTPException(413, "Webhook too large.")
    try:
        event = payment_gateway.verify_webhook_signature(
            payload, request.headers.get("stripe-signature")
        )
    except RuntimeError:
        raise HTTPException(503, "Webhook verification is not configured.")
    except Exception:
        raise HTTPException(400, "Invalid webhook signature.")
    kind = event["type"]
    obj = event["data"]["object"]
    metadata = obj.get("metadata") or {}
    if (
        kind
        in ("checkout.session.completed", "checkout.session.async_payment_succeeded")
        and metadata.get("type") == "product_order"
    ):
        transaction_lock(db, 902)
        order = db.query(Order).filter(Order.stripe_session_id == obj["id"]).first()
        if not order:
            raise HTTPException(400, "Unknown checkout session.")
        if (
            str(order.id) != metadata.get("order_id")
            or obj.get("currency") != "cad"
            or obj.get("amount_total") != order.total_cents
        ):
            raise HTTPException(400, "Checkout payment details do not match the order.")
        if obj.get("payment_status") != "paid":
            return {"received": True}
        try:
            order.stripe_payment_intent_id = obj.get("payment_intent")
            order_service.confirm_order_payment(
                db, obj["id"], obj.get("payment_intent")
            )
            db.commit()
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            # A late payment cannot fulfill more stock than exists; refund it safely.
            if not obj.get("payment_intent"):
                raise
            refund = payment_gateway.create_refund(obj["payment_intent"])
            if refund.get("status") not in ("succeeded", "pending"):
                raise HTTPException(502, "Refund reconciliation required.")
            order.stripe_payment_intent_id = obj["payment_intent"]
            order.status = (
                "refunded" if refund["status"] == "succeeded" else "refund_pending"
            )
            queue_order_status(db, order)
            db.commit()
    elif (
        kind in ("payment_intent.succeeded", "payment_intent.payment_failed")
        and metadata.get("type") == "booking_deposit"
    ):
        transaction_lock(db, 903)
        booking = (
            db.query(Booking)
            .filter(Booking.stripe_payment_intent_id == obj["id"])
            .first()
        )
        if not booking:
            raise HTTPException(400, "Unknown booking payment.")
        if (
            str(booking.id) != metadata.get("booking_id")
            or obj.get("currency") != "cad"
            or obj.get("amount") != booking.deposit_cents
        ):
            raise HTTPException(
                400, "Deposit payment details do not match the booking."
            )
        if kind == "payment_intent.succeeded":
            if obj.get("amount_received") != booking.deposit_cents:
                raise HTTPException(400, "Deposit amount mismatch.")
            booking_service.confirm_booking_payment_intent(
                db, obj["id"], payment_gateway
            )
        else:
            booking_service.fail_booking_payment(db, obj["id"])
    elif kind in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        transaction_lock(db, 902)
        order = db.query(Order).filter(Order.stripe_session_id == obj["id"]).first()
        if order and order.status == "pending":
            order.status = "expired"
            if kind.endswith("failed"):
                queue_payment_failed(db, order, "order")
            db.commit()
            if kind.endswith("failed"):
                from app.services.whatsapp import notify, NotificationEvent

                notify(
                    NotificationEvent.PAYMENT_FAILED,
                    f"Payment failed for order PN-{str(order.id)[:8].upper()}",
                    db,
                )
    elif (
        kind in ("refund.created", "refund.updated")
        and obj.get("status") == "succeeded"
    ):
        complete_refund(
            db, obj.get("payment_intent"), obj.get("amount"), str(obj["id"])
        )
    elif kind == "charge.refunded" and obj.get("refunded"):
        refunds = (obj.get("refunds") or {}).get("data") or []
        # A charge may report a refund while the bank transfer is still pending.
        succeeded = sum(
            item.get("amount", 0)
            for item in refunds
            if item.get("status") == "succeeded"
        )
        if succeeded >= obj.get("amount", 0) > 0:
            complete_refund(
                db, obj.get("payment_intent"), obj["amount"], str(obj["id"])
            )
    elif kind in ("refund.failed", "refund.updated") and obj.get("status") == "failed":
        transaction_lock(db, 902)
        transaction_lock(db, 903)
        from app.services.email import queue_email, queue_admin, message

        order = (
            db.query(Order)
            .filter(Order.stripe_payment_intent_id == obj.get("payment_intent"))
            .first()
            if obj.get("payment_intent")
            else None
        )
        booking = (
            db.query(Booking)
            .filter(Booking.stripe_payment_intent_id == obj.get("payment_intent"))
            .first()
            if obj.get("payment_intent")
            else None
        )
        record = order or booking
        if record:
            if order and order.status == "refund_pending":
                order.status = "paid"
            if booking and booking.status == "refund_pending":
                booking.status = "cancelled"
            content = message(
                "Refund needs attention",
                [
                    f"Reference PN-{str(record.id)[:8].upper()}",
                    "The payment provider could not complete your refund. Please contact the studio; we will help resolve it.",
                ],
            )
            key = "refund-failed:" + str(obj["id"])
            queue_email(db, key, record.customer_email, *content)
            queue_admin(db, key, content)
            db.commit()
    return {"received": True}


def complete_refund(db, payment_intent_id, amount, refund_id):
    if not payment_intent_id or not isinstance(amount, int) or amount <= 0:
        return
    transaction_lock(db, 902)
    transaction_lock(db, 903)
    from app.services.email import queue_email, queue_admin, message, cad

    order = (
        db.query(Order)
        .filter(Order.stripe_payment_intent_id == payment_intent_id)
        .first()
    )
    booking = (
        db.query(Booking)
        .filter(Booking.stripe_payment_intent_id == payment_intent_id)
        .first()
    )
    record = order or booking
    if not record:
        return
    full = amount == (order.total_cents if order else booking.deposit_cents)
    if full and record.status == "refunded":
        return
    if full and order:
        if order.status in (*order_service.PAID_STATUSES, "refund_pending"):
            for item in order.items:
                variant = (
                    db.query(ProductVariant)
                    .filter(ProductVariant.id == item.product_variant_id)
                    .with_for_update()
                    .first()
                )
                if variant:
                    variant.stock_count += item.quantity
        order.status = "refunded"
        queue_order_status(db, order)
    else:
        if full:
            booking.status = "refunded"
        key = (
            f"booking:{booking.id}:refunded" if full else "partial-refund:" + refund_id
        )
        content = message(
            "Refund completed",
            [
                f"Reference PN-{str(record.id)[:8].upper()}",
                f"{cad(amount)} has been refunded to the original payment method. Your bank may take 5–10 business days to display it.",
            ],
        )
        queue_email(db, key, record.customer_email, *content)
        queue_admin(db, key, content)
    db.commit()
