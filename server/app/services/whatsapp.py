"""
WhatsApp notification service using Evolution API instance "pholar-notifier".

Public API:
  notify(event, message, db)              fire-and-forget alert, never raises
  get_whatsapp_connection_status()        check connection health
  get_whatsapp_qr()                       fetch QR for pairing
  logout_whatsapp()                       disconnect instance (raises on failure)
  send_whatsapp_notification(number, msg) low-level send (use notify() instead)

Never call send_whatsapp_notification() directly from route handlers.
"""

import json
import logging
import threading
import urllib.request
import urllib.error
from enum import Enum

from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

INSTANCE_NAME = "pholar-notifier"


class NotificationEvent(str, Enum):
    NEW_ORDER = "new_order"
    NEW_BOOKING = "new_booking"
    BOOKING_CANCELLED = "booking_cancelled"
    PAYMENT_FAILED = "payment_failed"
    NEW_CONTACT_MESSAGE = "new_contact_message"
    LOW_STOCK = "low_stock"
    DISCOUNT_MAXED_OUT = "discount_maxed_out"


_TOGGLE_KEY: dict[NotificationEvent, str] = {
    NotificationEvent.NEW_ORDER: "notify_new_order",
    NotificationEvent.NEW_BOOKING: "notify_new_booking",
    NotificationEvent.BOOKING_CANCELLED: "notify_booking_cancelled",
    NotificationEvent.PAYMENT_FAILED: "notify_payment_failed",
    NotificationEvent.NEW_CONTACT_MESSAGE: "notify_new_contact_message",
    NotificationEvent.LOW_STOCK: "notify_low_stock",
    NotificationEvent.DISCOUNT_MAXED_OUT: "notify_discount_maxed_out",
}

# Default when the key has never been saved to admin_settings.
#   ON  — new_order, new_booking, booking_cancelled, new_contact_message, low_stock, payment_failed
#   OFF — discount_maxed_out
_DEFAULT_ON: dict[NotificationEvent, bool] = {
    NotificationEvent.NEW_ORDER: True,
    NotificationEvent.NEW_BOOKING: True,
    NotificationEvent.BOOKING_CANCELLED: True,
    NotificationEvent.PAYMENT_FAILED: True,  # Phase 9: Stripe live — default flipped ON
    NotificationEvent.NEW_CONTACT_MESSAGE: True,
    NotificationEvent.LOW_STOCK: True,
    NotificationEvent.DISCOUNT_MAXED_OUT: False,
}


def _base() -> str:
    return (settings.EVOLUTION_API_URL or "http://evolution-api:8080").rstrip("/")


def _headers() -> dict:
    return {"apikey": settings.EVOLUTION_API_KEY or ""}


# ─── Low-level HTTP helpers ───────────────────────────────────────────────────


def _get(path: str, timeout: int = 5) -> dict:
    req = urllib.request.Request(f"{_base()}{path}", headers=_headers())
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _post(path: str, body: dict | None = None, timeout: int = 10) -> dict:
    data = json.dumps(body or {}).encode() if body is not None else None
    req = urllib.request.Request(
        f"{_base()}{path}",
        data=data,
        headers={**_headers(), "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _delete(path: str, timeout: int = 10) -> dict:
    req = urllib.request.Request(
        f"{_base()}{path}",
        headers=_headers(),
        method="DELETE",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# ─── Public service functions ─────────────────────────────────────────────────


def get_whatsapp_connection_status() -> dict:
    """
    GET /instance/connectionState/pholar-notifier.
    Returns {"connected": bool, "state": str, "phone": str | None}.
    Never raises — returns error state on failure.
    """
    if not settings.EVOLUTION_API_KEY:
        return {"connected": False, "state": "unconfigured", "phone": None}
    try:
        data = _get(f"/instance/connectionState/{INSTANCE_NAME}")
        instance_data = data.get("instance", {})
        state = instance_data.get("state", "unknown")
        # Some Evolution API versions include the linked user inside the state response
        user = instance_data.get("user") or {}
        raw_id = user.get("id", "")
        phone = raw_id.split("@")[0] if raw_id else None
        return {"connected": state == "open", "state": state, "phone": phone}
    except Exception as exc:
        logger.error("WhatsApp status check failed: %s", type(exc).__name__)
        return {"connected": False, "state": "error", "phone": None}


def get_whatsapp_qr() -> dict:
    """
    GET /instance/connect/pholar-notifier — returns a fresh QR code for pairing.
    Returns {"base64": str | None, "code": str | None}.
    base64 is a full data URI (data:image/png;base64,...) ready for an <img src>.
    Never raises — returns nulls with an "error" key on failure.
    """
    if not settings.EVOLUTION_API_KEY:
        return {
            "base64": None,
            "code": None,
            "error": "EVOLUTION_API_KEY not configured",
        }
    try:
        data = _get(f"/instance/connect/{INSTANCE_NAME}", timeout=15)
        # Evolution API v2: {"pairingCode": null, "code": "...", "base64": "data:image/png;..."}
        # Some versions nest under "qrcode": {"base64": "..."}
        qr_block = data.get("qrcode") or {}
        base64_val = data.get("base64") or qr_block.get("base64")
        code_val = data.get("code") or qr_block.get("code")
        return {"base64": base64_val, "code": code_val}
    except urllib.error.HTTPError as exc:
        body: dict = {}
        try:
            body = json.loads(exc.read())
        except Exception:
            pass
        logger.warning("WhatsApp QR returned HTTP %s", exc.code)
        return {
            "base64": None,
            "code": None,
            "error": f"WhatsApp provider returned HTTP {exc.code}",
        }
    except Exception as exc:
        logger.error("WhatsApp QR fetch failed: %s", type(exc).__name__)
        return {
            "base64": None,
            "code": None,
            "error": "WhatsApp connection unavailable",
        }


def logout_whatsapp() -> None:
    """
    DELETE /instance/logout/pholar-notifier — disconnect the linked WhatsApp account.
    Raises on failure so the caller can surface the error to the admin.
    """
    if not settings.EVOLUTION_API_KEY:
        raise RuntimeError("EVOLUTION_API_KEY is not configured.")
    _delete(f"/instance/logout/{INSTANCE_NAME}")


def send_whatsapp_notification(number: str, message: str) -> None:
    """
    POST /message/sendText/pholar-notifier — send a text message.
    Raises urllib.error.URLError / RuntimeError on failure.
    Use notify() from route handlers, not this function directly.
    """
    if not settings.EVOLUTION_API_KEY:
        raise RuntimeError("EVOLUTION_API_KEY is not configured.")
    _post(f"/message/sendText/{INSTANCE_NAME}", {"number": number, "text": message})


def notify(event: NotificationEvent, message: str, db: Session) -> None:
    """
    Fire-and-forget WhatsApp notification — the sole entry point for alerts.

    Reads the per-event toggle and notifier number from admin_settings
    synchronously (fast DB lookup), then spawns a daemon thread for the
    HTTP call so it never delays the HTTP response. Never raises.
    """
    from app.services.settings_service import get_setting  # noqa: PLC0415

    try:
        default = "true" if _DEFAULT_ON[event] else "false"
        if get_setting(db, _TOGGLE_KEY[event], default) != "true":
            return
        number = get_setting(db, "notifier_whatsapp_number", "")
        if not number:
            return
    except Exception as exc:
        logger.error(
            "notify: failed reading settings for %s: %s", event, type(exc).__name__
        )
        return

    def _send() -> None:
        try:
            send_whatsapp_notification(number=number, message=message)
            logger.debug("WhatsApp sent for %s", event)
        except Exception as exc:
            logger.error("WhatsApp send failed for %s: %s", event, type(exc).__name__)

    threading.Thread(target=_send, daemon=True).start()
