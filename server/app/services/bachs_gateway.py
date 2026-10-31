"""Bachs hosted checkout. Secrets and provider bodies are never logged."""
import hashlib
import hmac
import json
import re
import time
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse, urlencode
import httpx
from app.core.config import settings
from app.services.payment_gateway import PaymentGateway


class BachsError(Exception):
    def __init__(self, code="PROVIDER_UNAVAILABLE"):
        self.code = code if re.fullmatch(r"[A-Z_]{1,80}", str(code)) else "PROVIDER_UNAVAILABLE"
        super().__init__(self.code)


def cents(value):
    if not isinstance(value, str):
        raise BachsError("INVALID_AMOUNT")
    try:
        number = Decimal(value)
        scaled = number * 100
        if not number.is_finite() or number < 0 or scaled != scaled.to_integral_value():
            raise ValueError()
        return int(scaled)
    except (ValueError, InvalidOperation):
        raise BachsError("INVALID_AMOUNT")


def resource_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{3,255}", value):
        raise BachsError("INVALID_RESOURCE")
    return value


class BachsGateway(PaymentGateway):
    provider = "bachs"

    def __init__(self):
        self.environment = settings.BACHS_ENVIRONMENT
        self.key = settings.BACHS_API_KEY
        expected = "sk_sandbox_" if self.environment == "sandbox" else "sk_live_"
        if not self.key or not self.key.startswith(expected):
            raise BachsError("PAYMENT_NOT_CONFIGURED")
        self.base = "https://sandbox-api.bachs.io" if self.environment == "sandbox" else "https://api.bachs.io"

    def request(self, method, path, body=None, key=None):
        headers = {"Authorization": "Bearer "+self.key, "User-Agent": "PholarNatural/1.0"}
        if key:
            headers["Idempotency-Key"] = key
        try:
            with httpx.Client(timeout=12, follow_redirects=False) as client:
                response = client.request(method, self.base+path, json=body, headers=headers)
            data = response.json()
        except (httpx.HTTPError, ValueError):
            raise BachsError() from None
        if not response.is_success:
            raise BachsError(data.get("error_code", "PROVIDER_UNAVAILABLE"))
        if not isinstance(data, dict):
            raise BachsError("INVALID_RESPONSE")
        return data

    def checkout_payload(self, amount_cents, metadata, customer_email, success_url, cancel_url, methods=None):
        if not isinstance(amount_cents, int) or amount_cents <= 0:
            raise BachsError("INVALID_AMOUNT")
        kind = "order" if "order_id" in metadata else "booking"
        record_id = metadata[kind+"_id"]
        if settings.PAYMENT_SANDBOX_INSTANCE:
            from app.core.security import customer_token
            params = urlencode({"kind": kind, "id": record_id, "token": customer_token(kind, record_id)})
            success_url = settings.DOMAIN.rstrip('/')+"/payment-sandbox?"+params
            cancel_url = settings.DOMAIN.rstrip('/')+"/payment-sandbox?cancelled=1"
        body = {
            "pricing": {"currency": "USD", "amount": f"{Decimal(amount_cents)/100:.2f}"},
            "customer": {"email": customer_email},
            "metadata": metadata, "reference": kind+"-"+record_id,
            "success_url": success_url, "cancel_url": cancel_url,
            "expires_in_minutes": 30,
        }
        if methods:
            body["payment_method_types"] = methods
        return body

    def checkout(self, amount_cents, metadata, customer_email, success_url, cancel_url, methods=None, frozen_body=None):
        body = frozen_body or self.checkout_payload(amount_cents, metadata, customer_email, success_url, cancel_url, methods)
        result = self.request("POST", "/v1/checkout-sessions", body, key=body["reference"])
        url = urlparse(result.get("checkout_url", ""))
        expected_host = "sandbox-checkout.bachs.io" if self.environment == "sandbox" else "checkout.bachs.io"
        if url.scheme != "https" or url.hostname != expected_host or url.username or url.password:
            raise BachsError("INVALID_CHECKOUT_URL")
        return {"session_id": resource_id(result.get("checkout_id")), "url": result["checkout_url"]}

    def create_checkout_session(self, line_items, success_url, cancel_url, metadata, customer_email=None):
        amount = sum(item["price_data"]["unit_amount"]*item["quantity"] for item in line_items)
        return self.checkout(amount, metadata, customer_email, success_url, cancel_url)

    def create_payment_intent(self, amount_cents, currency, metadata, customer_email=None):
        # Booking deposits use hosted checkout, with refundable card/mobile-money methods.
        result = self.checkout(amount_cents, metadata, customer_email, settings.DOMAIN, settings.DOMAIN,
            methods=["USD_CARD", "NGN_CARD", "MOMO_GHS", "MOMO_KES", "MOMO_TZS", "MOMO_UGX", "MOMO_XAF", "MOMO_XOF", "MOMO_RWF", "MOMO_MWK", "MOMO_ZMW"])
        return {**result, "payment_intent_id": None, "client_secret": None}

    def create_refund(self, payment_intent_id, amount_cents=None):
        charge = resource_id(payment_intent_id)
        payment = self.request("GET", "/v1/payments/"+charge)
        if payment.get("is_refundable") is not True:
            # Recover an accepted/uncertain previous refund before attempting a new write.
            row = self.request("GET", "/v1/refunds/by-charge/"+charge)
            if row.get("status") in ("processing", "pending", "success") and (row.get("reference") == "pholar-full-"+charge or payment.get("status") in ("refunded", "auto_refunded")):
                return {"refund_id": resource_id(row.get("refund_id")), "status": "succeeded" if row.get("status") == "success" else "pending"}
            raise BachsError("REFUND_REQUIRES_REVIEW")
        body = {"charge_id": charge, "reference": "pholar-full-"+charge, "reason": "Customer cancellation"}
        if self.environment == "sandbox":
            body["simulated_outcome"] = "success"
        if amount_cents is not None:
            body["amount"] = f"{Decimal(amount_cents)/100:.2f}"
        result = self.request("POST", "/v1/refunds", body, key="pholar-full-"+charge)
        return {"refund_id": resource_id(result.get("refund_id")), "status": {"success": "succeeded", "failed": "failed"}.get(result.get("status"), "pending")}

    def verify_webhook_signature(self, payload, signature):
        secret = settings.BACHS_WEBHOOK_SECRET
        if not secret:
            raise BachsError("WEBHOOK_NOT_CONFIGURED")
        try:
            parts = [part.strip().split("=", 1) for part in signature.split(",")]
            timestamp = next(value for key, value in parts if key == "t")
            if abs(time.time()-int(timestamp)) > 300:
                raise ValueError()
            expected = hmac.new(secret.encode(), timestamp.encode()+b"."+payload, hashlib.sha256).hexdigest()
            if not any(hmac.compare_digest(value, expected) for key, value in parts if key == "v1"):
                raise ValueError()
            event = json.loads(payload)
            if not isinstance(event, dict) or not re.fullmatch(r"evt_[A-Za-z0-9_-]{1,240}", event.get("id", "")) or not isinstance(event.get("data"), dict) or not isinstance(event.get("type"), str):
                raise ValueError()
            return event
        except (ValueError, TypeError, AttributeError, StopIteration):
            raise BachsError("INVALID_SIGNATURE") from None
