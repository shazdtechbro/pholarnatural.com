from typing import Dict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_admin
from app.models.admin import AdminUser
from app.services import settings_service
from app.services import whatsapp

router = APIRouter()

# ── Public (no auth) ──────────────────────────────────────────────────────────

_PUBLIC_KEYS = [
    "shipping_rate_domestic_cents",
    "shipping_rate_us_cents",
    "shipping_rate_uk_cents",
    "shipping_rate_international_cents",
    "low_stock_threshold",
    "tax_rate_percent",
    "free_shipping_threshold_cents",
    "instagram_url",
    "facebook_url",
    "tiktok_url",
    "featured_product_ids",
    "featured_service_ids",
    "hero_image_url",
    "featured_image_url",
]

_PUBLIC_DEFAULTS = {
    "shipping_rate_domestic_cents": "995",
    "shipping_rate_us_cents": "1499",
    "shipping_rate_uk_cents": "1999",
    "shipping_rate_international_cents": "2499",
    "low_stock_threshold": "5",
    "tax_rate_percent": "13",
    "free_shipping_threshold_cents": "5000",
    "instagram_url": "",
    "facebook_url": "",
    "tiktok_url": "",
    "featured_product_ids": "",
    "featured_service_ids": "",
    "hero_image_url": "",
    "featured_image_url": "",
}


@router.get("/settings/public")
def get_public_settings(db: Session = Depends(get_db)):
    """Public settings — no auth required. Returns shipping rates, tax rate, social links."""
    all_s = settings_service.get_all_settings(db)
    return {k: all_s.get(k, _PUBLIC_DEFAULTS.get(k, "")) for k in _PUBLIC_KEYS}


# ── Admin (auth required) ─────────────────────────────────────────────────────


@router.post("/settings/upload-image")
async def upload_settings_image(
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Upload a hero or featured image to Cloudinary. Returns {url: str}."""
    from app.services.storage_service import CloudinaryStorageService  # noqa: PLC0415

    try:
        storage = CloudinaryStorageService()
        contents = await file.read()
        url = storage.upload_image(contents, folder="settings")
        return {"url": url}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Image upload unavailable.")


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Return all admin_settings key/value pairs."""
    return settings_service.get_all_settings(db)


@router.put("/settings")
def update_settings(
    updates: Dict[str, str],
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Batch-upsert admin_settings. Send only the keys you want to change."""
    settings_service.upsert_settings(db, updates)
    return {"ok": True}


@router.get("/whatsapp/status")
def whatsapp_status(
    current_admin: AdminUser = Depends(get_current_admin),
):
    """
    Check whether the Evolution API instance is connected.
    Returns {connected: bool, state: str, phone: str | None}.
    """
    return whatsapp.get_whatsapp_connection_status()


@router.get("/whatsapp/qr")
def whatsapp_qr(
    current_admin: AdminUser = Depends(get_current_admin),
):
    """
    Fetch a fresh QR code from Evolution API for pairing a WhatsApp account.
    Returns {base64: str | None, code: str | None}.
    base64 is a full data URI ready for <img src>.
    """
    return whatsapp.get_whatsapp_qr()


@router.post("/whatsapp/logout")
def whatsapp_logout(
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Disconnect the linked WhatsApp account so a new number can be paired."""
    try:
        whatsapp.logout_whatsapp()
        return {"ok": True}
    except Exception:
        raise HTTPException(status_code=502, detail="Could not disconnect WhatsApp.")


@router.post("/whatsapp/test")
def whatsapp_test(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Send a test WhatsApp message to the configured notifier number."""
    number = settings_service.get_setting(db, "notifier_whatsapp_number", "")
    if not number:
        raise HTTPException(
            status_code=400,
            detail="No notifier number configured. Enter a number in Settings and save first.",
        )
    try:
        whatsapp.send_whatsapp_notification(
            number=number,
            message=(
                "🧪 Test from Pholar Natural admin panel.\n"
                "If you see this, WhatsApp alerts are working correctly."
            ),
        )
        return {"ok": True}
    except Exception:
        raise HTTPException(
            status_code=502, detail="WhatsApp test could not be delivered."
        )


@router.get("/email/status")
def email_status(
    db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)
):
    from app.core.config import settings
    from app.models.notification import EmailDelivery

    return {
        "configured": bool(settings.RESEND_API_KEY),
        "admin_recipient_configured": bool(settings.ADMIN_EMAIL),
        "queued": db.query(EmailDelivery)
        .filter(EmailDelivery.status == "queued")
        .count(),
        "sent": db.query(EmailDelivery).filter(EmailDelivery.status.in_(["sent", "accepted", "delivered"])).count(),
        "delivered": db.query(EmailDelivery).filter_by(status="delivered").count(),
        "needs_attention": db.query(EmailDelivery).filter(EmailDelivery.status.in_(["needs_review", "bounced", "complained", "suppressed", "failed"])).count(),
        "retrying": db.query(EmailDelivery)
        .filter(EmailDelivery.status == "queued", EmailDelivery.attempts > 0)
        .count(),
    }


@router.post("/email/test", status_code=202)
def email_test(
    db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)
):
    from app.core.config import settings
    from app.services.email import queue_email, message
    from uuid import uuid4

    if not settings.RESEND_API_KEY:
        raise HTTPException(409, "Email provider has not been configured.")
    queue_email(
        db,
        "test:" + str(uuid4()),
        current_admin.email,
        *message(
            "Email delivery test",
            ["This test was requested from the Pholar Natural administration panel."],
        ),
    )
    db.commit()
    return {"queued": True}


@router.get("/email/deliveries")
def email_deliveries(db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    from app.models.notification import EmailDelivery
    return [{"id": r.id, "event": r.event_key, "status": r.status, "attempts": r.attempts, "provider_id": r.provider_id, "last_error": r.last_error} for r in db.query(EmailDelivery).order_by(EmailDelivery.created_at.desc()).limit(100).all()]


@router.post("/email/deliveries/{delivery_id}/retry", status_code=202)
def retry_email(delivery_id: str, db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    from uuid import UUID
    from datetime import timedelta, timezone
    from app.models.notification import EmailDelivery
    from app.services.mail_delivery import utcnow
    try:
        parsed = UUID(delivery_id)
    except ValueError:
        raise HTTPException(400, "Invalid delivery ID.")
    row = db.query(EmailDelivery).filter_by(id=parsed).with_for_update().first()
    if not row:
        raise HTTPException(404, "Delivery not found.")
    if row.status not in ("needs_review", "queued"):
        raise HTTPException(409, "This delivery cannot be retried.")
    if not row.provider_id and row.first_attempt_at and utcnow()-row.first_attempt_at.replace(tzinfo=timezone.utc) >= timedelta(hours=23):
        raise HTTPException(409, "Review Resend history before manually reissuing this message; its duplicate-prevention window expired.")
    row.status = "accepted" if row.provider_id else "queued"
    row.next_attempt_at = utcnow()
    row.last_error = None
    db.commit()
    return {"queued": True}
