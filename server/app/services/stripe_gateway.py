import stripe
import time
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.payment_gateway import PaymentGateway


class StripeGateway(PaymentGateway):
    def __init__(self) -> None:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        stripe.max_network_retries = 2
        stripe.default_http_client = stripe.RequestsClient(timeout=15)
        self.webhook_secret = settings.STRIPE_WEBHOOK_SECRET

    def create_checkout_session(
        self,
        line_items: list[Dict[str, Any]],
        success_url: str,
        cancel_url: str,
        metadata: Dict[str, str],
        customer_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "payment_method_types": ["card"],
            "line_items": line_items,
            "mode": "payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": metadata,
        }
        if customer_email:
            params["customer_email"] = customer_email

        params["expires_at"] = int(time.time()) + 1800
        session = stripe.checkout.Session.create(
            **params, idempotency_key="checkout-" + metadata["order_id"]
        )
        return {"session_id": session.id, "url": session.url}

    def create_payment_intent(
        self,
        amount_cents: int,
        currency: str,
        metadata: Dict[str, str],
        customer_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "amount": amount_cents,
            "currency": currency,
            "metadata": metadata,
            "automatic_payment_methods": {"enabled": True, "allow_redirects": "never"},
        }
        if customer_email:
            params["receipt_email"] = customer_email

        pi = stripe.PaymentIntent.create(
            **params, idempotency_key="booking-" + metadata["booking_id"]
        )
        return {"payment_intent_id": pi.id, "client_secret": pi.client_secret}

    def create_refund(
        self,
        payment_intent_id: str,
        amount_cents: Optional[int] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"payment_intent": payment_intent_id}
        if amount_cents is not None:
            params["amount"] = amount_cents

        refund = stripe.Refund.create(
            **params, idempotency_key="full-refund-" + payment_intent_id
        )
        return {"refund_id": refund.id, "status": refund.status}

    def verify_webhook_signature(
        self, payload: bytes, signature: str
    ) -> Dict[str, Any]:
        """Raises stripe.error.SignatureVerificationError if the signature is invalid."""
        if not self.webhook_secret or not self.webhook_secret.startswith("whsec_"):
            raise RuntimeError("Webhook verification is not configured.")
        return stripe.Webhook.construct_event(
            payload, signature, self.webhook_secret
        ).to_dict()
