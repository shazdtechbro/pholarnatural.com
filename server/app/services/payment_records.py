"""Checkout recovery and refunds use the provider recorded on the purchase."""
import hashlib
import json
from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import HTTPException
from app.core.config import settings
from app.models.order import Order
from app.models.booking import Booking


def request_identity(body, key):
    if key:
        try:
            key = str(UUID(key))
        except (ValueError, TypeError):
            raise HTTPException(422, "Checkout request key must be a UUID.")
    fingerprint = hashlib.sha256(json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return key, fingerprint


def existing_request(db, model, key, fingerprint):
    if not key:
        return None
    record = db.query(model).filter_by(payment_request_key=key).with_for_update().first()
    if record and record.payment_request_hash != fingerprint:
        raise HTTPException(409, "This checkout request belongs to different details. Start a new checkout.")
    return record


def initialize(record, key, fingerprint):
    record.payment_provider = settings.PAYMENT_PROVIDER
    record.payment_environment = settings.BACHS_ENVIRONMENT if settings.PAYMENT_PROVIDER == "bachs" else "legacy"
    record.currency = settings.PRICING_CURRENCY
    record.payment_request_key = key
    record.payment_request_hash = fingerprint


def resume_bachs(db, record, gateway):
    if record.payment_provider != "bachs" or record.payment_environment != gateway.environment:
        raise HTTPException(409, "Payment environment does not match this purchase.")
    if record.status != "pending":
        raise HTTPException(409, "This checkout is no longer open. Check your confirmation page.")
    if record.created_at and datetime.now(timezone.utc)-record.created_at.replace(tzinfo=timezone.utc) > timedelta(minutes=30):
        raise HTTPException(409, "This checkout has expired. Start a new checkout.")
    if record.payment_checkout_url:
        return record.payment_checkout_url
    from app.core.security import customer_token
    kind = "order" if isinstance(record, Order) else "booking"
    token = customer_token(kind, record.id)
    amount = record.total_cents if kind == "order" else record.deposit_cents
    metadata = {kind+"_id": str(record.id), "type": "product_order" if kind == "order" else "booking_deposit"}
    success_url = f"{settings.DOMAIN}/{'checkout/success' if kind == 'order' else 'book/confirmation'}?id={record.id}&token={token}"
    cancel_url = settings.DOMAIN+("/cart" if kind == "order" else "/book")
    methods = None if kind == "order" else ["USD_CARD", "NGN_CARD", "MOMO_GHS", "MOMO_KES", "MOMO_TZS", "MOMO_UGX", "MOMO_XAF", "MOMO_XOF", "MOMO_RWF", "MOMO_MWK", "MOMO_ZMW"]
    if not record.payment_request_payload:
        record.payment_request_payload = gateway.checkout_payload(amount, metadata, record.customer_email, success_url, cancel_url, methods)
    # Freeze the exact request, including signed return links, before an uncertain write.
    db.commit()
    try:
        result = gateway.checkout(amount, metadata, record.customer_email, success_url, cancel_url, methods, frozen_body=record.payment_request_payload)
    except Exception:
        raise HTTPException(502, "Payment setup could not be confirmed. Retry this checkout; your reservation and request reference are preserved.") from None
    record.payment_checkout_id = result["session_id"]
    record.payment_checkout_url = result["url"]
    db.commit()
    return result["url"]


def refund_record(db, record, fallback=None):
    if record.payment_provider == "bachs":
        from app.services.bachs_gateway import BachsGateway
        gateway = BachsGateway()
        if record.payment_environment != gateway.environment or not record.payment_charge_id:
            raise HTTPException(409, "Payment requires reconciliation before refunding.")
        result = gateway.create_refund(record.payment_charge_id)
        record.payment_refund_id = result["refund_id"]
        return result
    from app.services.stripe_gateway import StripeGateway
    gateway = fallback if fallback and getattr(fallback, "provider", "stripe") == "stripe" else StripeGateway()
    return gateway.create_refund(record.stripe_payment_intent_id)
