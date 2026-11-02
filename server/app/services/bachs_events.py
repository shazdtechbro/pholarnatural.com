"""Process the durable Bachs inbox. Never fulfil from a browser redirect."""
from datetime import timedelta, timezone
from uuid import UUID
from app.core.config import settings
from app.core.transactions import transaction_lock
from app.models.payment import PaymentEvent
from app.models.order import Order
from app.models.booking import Booking
from app.models.product import ProductVariant
from app.services.bachs_gateway import BachsGateway, BachsError, cents, resource_id
from app.services.mail_delivery import utcnow
from app.services import order_service, booking_service
from app.services.email import queue_email, queue_admin, message, queue_order_status, queue_booking_cancelled, queue_payment_failed


def record_for(db, field, value):
    if not value:
        return None
    for model in (Order, Booking):
        record = db.query(model).filter(getattr(model, field) == value, model.payment_provider == "bachs", model.payment_environment == settings.BACHS_ENVIRONMENT).populate_existing().first()
        if record:
            return record


def alert(db, event, title, detail):
    queue_admin(db, "bachs:"+event.id, message(title, [detail]), force=True)


def verify_collection(db, event, gateway):
    data = event.payload["data"]
    checkout_id = data.get("checkout_id")
    if not checkout_id:
        alert(db, event, "Unmatched payment needs review", "A payment arrived without an application checkout. No order was fulfilled.")
        return None
    checkout = gateway.request("GET", "/v1/checkout-sessions/"+resource_id(checkout_id))
    record = record_for(db, "payment_checkout_id", checkout_id)
    if not record:
        metadata = checkout.get("metadata") or {}
        for model, key in ((Order, "order_id"), (Booking, "booking_id")):
            try:
                candidate = db.get(model, UUID(metadata.get(key, "")))
            except (ValueError, TypeError):
                candidate = None
            if candidate and candidate.payment_provider == "bachs" and candidate.payment_environment == gateway.environment and not candidate.payment_checkout_id:
                record = candidate
                break
    if not record:
        alert(db, event, "Unmatched payment needs review", "The checkout has no matching application purchase. No fulfilment was attempted.")
        return None
    amount = record.total_cents if isinstance(record, Order) else record.deposit_cents
    kind = "order" if isinstance(record, Order) else "booking"
    if (checkout.get("checkout_id") != checkout_id or checkout.get("currency") != record.currency
            or cents(checkout.get("amount")) != amount
            or checkout.get("reference") != kind+"-"+str(record.id)
            or (checkout.get("metadata") or {}).get(kind+"_id") != str(record.id)):
        raise BachsError("CHECKOUT_MISMATCH")
    charge_id = resource_id(data.get("charge_id"))
    payment = gateway.request("GET", "/v1/payments/"+charge_id)
    linked_charge = checkout.get("charge") or {}
    if (payment.get("payment_id") != charge_id or payment.get("checkout_id") != checkout_id
            or linked_charge.get("payment_id") != charge_id
            or checkout.get("payment_status") != "succeeded"
            or payment.get("status") not in ("succeeded", "overpaid")
            or data.get("currency") != payment.get("currency")
            or cents(data.get("amount")) != cents(payment.get("amount"))
            or cents(payment.get("amount_paid", payment.get("amount"))) < cents(payment.get("amount"))
            or cents(payment.get("amount_remaining", "0.00")) != 0):
        raise BachsError("PAYMENT_MISMATCH")
    record.payment_checkout_id = checkout_id
    record.payment_charge_id = charge_id
    db.commit()
    return record


def handle(db, event, gateway):
    transaction_lock(db, 902)
    transaction_lock(db, 903)
    data = event.payload["data"]
    if event.kind == "collection.succeeded":
        record = verify_collection(db, event, gateway)
        if not record:
            return
        if isinstance(record, Booking):
            booking_service.confirm_booking_payment_intent(db, record.payment_charge_id, gateway, provider="bachs")
        else:
            try:
                order_service.confirm_order_payment(db, record.payment_checkout_id, record.payment_charge_id, provider="bachs")
            except __import__('fastapi').HTTPException as error:
                if error.status_code != 409:
                    raise
                from app.services.payment_records import refund_record
                result = refund_record(db, record, gateway)
                if result["status"] not in ("succeeded", "pending"):
                    raise BachsError("REFUND_REQUIRES_REVIEW")
                record.status = "refunded" if result["status"] == "succeeded" else "refund_pending"
                queue_order_status(db, record)
                db.commit()
    elif event.kind.startswith("refund."):
        charge_id = data.get("charge_id")
        record = record_for(db, "payment_charge_id", charge_id)
        if not record:
            raise BachsError("REFUND_PURCHASE_NOT_FOUND")
        refund_id = resource_id(data.get("refund_id"))
        refund = gateway.request("GET", "/v1/refunds/"+refund_id)
        if refund.get("charge_id") != charge_id or refund.get("refund_id") != refund_id:
            raise BachsError("REFUND_MISMATCH")
        record.payment_refund_id = refund_id
        state = refund.get("status")
        if state == "success":
            # One successful refund per payment. Duplicate deliveries cannot restock twice.
            payment = gateway.request("GET", "/v1/payments/"+resource_id(charge_id))
            full = payment.get("status") in ("refunded", "auto_refunded")
            if record.refunded_cents:
                return
            amount = record.total_cents if isinstance(record, Order) else record.deposit_cents
            if full:
                if isinstance(record, Order) and record.payment_fulfilled:
                    for item in record.items:
                        variant = db.query(ProductVariant).filter_by(id=item.product_variant_id).with_for_update().one()
                        variant.stock_count += item.quantity
                    record.payment_fulfilled = False
                record.status = "refunded"
                record.refunded_cents = amount
            else:
                record.refunded_cents = min(amount, cents(refund.get("refunded_amount", "0.00")))
                alert(db, event, "Partial refund needs review", "A partial refund was recorded. Remaining fulfilment requires review.")
            content = message("Refund completed" if full else "Partial refund completed", [f"Reference PN-{str(record.id)[:8].upper()}", "Your refund was sent to the original payment method. Your bank or payment provider determines when it appears."])
            queue_email(db, "bachs-refund:"+refund_id, record.customer_email, *content)
            queue_admin(db, "bachs-refund:"+refund_id, content)
        elif state == "failed":
            if record.status == "refund_pending":
                record.status = "paid" if isinstance(record, Order) else "cancelled"
            alert(db, event, "Refund failed", f"Refund {refund_id} requires review in Bachs.")
        elif record.status not in ("refunded", "completed", "delivered"):
            record.status = "refund_pending"
        db.commit()
    elif event.kind in ("collection.failed", "checkout.expired", "collection.underpaid"):
        record = record_for(db, "payment_checkout_id", data.get("checkout_id"))
        if record and record.status == "pending":
            checkout = gateway.request("GET", "/v1/checkout-sessions/"+resource_id(record.payment_checkout_id))
            if checkout.get("payment_status") == "succeeded":
                return
            if event.kind == "checkout.expired" and checkout.get("status") == "expired":
                record.status = "expired" if isinstance(record, Order) else "cancelled"
            queue_payment_failed(db, record, "order" if isinstance(record, Order) else "booking")
            from app.services.whatsapp import notify, NotificationEvent
            notify(NotificationEvent.PAYMENT_FAILED, f"Payment not completed for PN-{str(record.id)[:8].upper()}", db, transactional=True)
            db.commit()
    elif event.kind.startswith("dispute."):
        alert(db, event, "Payment dispute needs attention", "Review this dispute and its evidence deadline in the Bachs dashboard.")
        db.commit()
    # checkout.completed alone never fulfils a purchase.


def process_one(db, gateway=None):
    now = utcnow()
    row = db.query(PaymentEvent).filter(PaymentEvent.status.in_(["queued", "processing"]), PaymentEvent.next_attempt_at <= now).order_by(PaymentEvent.created_at).with_for_update(skip_locked=True).first()
    if not row:
        db.rollback()
        return False
    row.status = "processing"
    row.attempts += 1
    row.next_attempt_at = now+timedelta(seconds=90)
    event_id = row.id
    db.commit()
    try:
        handle(db, row, gateway or BachsGateway())
        row.status = "processed"
        row.last_error = None
        db.commit()
    except Exception as error:
        db.rollback()
        row = db.get(PaymentEvent, event_id)
        row.status = "needs_review" if row.attempts >= 12 else "queued"
        row.last_error = error.code if isinstance(error, BachsError) else type(error).__name__
        row.next_attempt_at = utcnow()+timedelta(seconds=min(300, 5*2**min(row.attempts, 6)))
        if row.status == "needs_review":
            alert(db, row, "Payment reconciliation needs attention", "A persisted Bachs event exhausted automatic processing retries. No unverified fulfilment was performed.")
        db.commit()
    return True


def main():
    import signal
    import threading
    from app.db.database import SessionLocal
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                busy = process_one(db)
        except Exception:
            busy = False
        stop.wait(1 if busy else 5)


if __name__ == "__main__":
    main()
