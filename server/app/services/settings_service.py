from urllib.parse import urlparse
from uuid import UUID
from fastapi import HTTPException
from app.models.system import AdminSetting

NUMBERS = {
    "shipping_rate_domestic_cents": 100000,
    "shipping_rate_us_cents": 100000,
    "shipping_rate_uk_cents": 100000,
    "shipping_rate_international_cents": 100000,
    "tax_rate_percent": 100,
    "free_shipping_threshold_cents": 10000000,
    "low_stock_threshold": 1000000,
}
BOOLS = {
    "notify_new_order",
    "notify_new_booking",
    "notify_booking_cancelled",
    "notify_payment_failed",
    "notify_new_contact_message",
    "notify_low_stock",
    "notify_discount_maxed_out",
    "email_notifications_enabled",
}
URLS = {
    "instagram_url",
    "facebook_url",
    "tiktok_url",
    "hero_image_url",
    "featured_image_url",
}
IDS = {"featured_product_ids", "featured_service_ids"}


def get_setting(db, key, default=""):
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    return row.value if row else default


def validate_updates(updates):
    if len(updates) > 50:
        raise HTTPException(422, "Too many settings.")
    for key, value in updates.items():
        if len(value) > 4000:
            raise HTTPException(422, "Setting value too long.")
        if key in NUMBERS:
            try:
                n = float(value)
                if not 0 <= n <= NUMBERS[key] or (
                    key != "tax_rate_percent" and not n.is_integer()
                ):
                    raise ValueError()
            except ValueError:
                raise HTTPException(422, f"Invalid value for {key}.")
            updates[key] = str(int(n)) if n.is_integer() else str(n)
        elif key in BOOLS:
            if value not in ("true", "false"):
                raise HTTPException(422, f"Invalid toggle {key}.")
        elif key in IDS:
            try:
                if value:
                    for part in value.split(","):
                        UUID(part.strip())
            except ValueError:
                raise HTTPException(
                    422, "Featured items must be valid product/service IDs."
                )
        elif key in URLS:
            if not value:
                continue
            if (
                key.endswith("image_url")
                and value.startswith("/images/")
                and ".." not in value
                and not value.startswith("//")
            ):
                continue
            try:
                p = urlparse(value)
                port = p.port
            except ValueError:
                raise HTTPException(422, "Use a valid HTTPS URL.")
            if p.scheme != "https" or not p.hostname or p.username or p.password:
                raise HTTPException(422, "Use a valid HTTPS URL.")
            if key.endswith("image_url") and p.hostname != "res.cloudinary.com":
                raise HTTPException(
                    422, "Images must use Cloudinary or local /images files."
                )
            if not key.endswith("image_url"):
                domain = {
                    "instagram_url": "instagram.com",
                    "facebook_url": "facebook.com",
                    "tiktok_url": "tiktok.com",
                }[key]
                if p.hostname != domain and not p.hostname.endswith("." + domain):
                    raise HTTPException(422, "Social link has the wrong destination.")
        elif key == "notifier_whatsapp_number":
            if value and (
                not value.lstrip("+").isdigit() or not 7 <= len(value.lstrip("+")) <= 15
            ):
                raise HTTPException(422, "Invalid notifier phone number.")
        else:
            raise HTTPException(422, f"Unknown setting: {key}.")


def upsert_settings(db, updates):
    validate_updates(updates)
    from app.core.transactions import transaction_lock

    transaction_lock(db, 904)
    existing = {
        row.key: row
        for row in db.query(AdminSetting).filter(AdminSetting.key.in_(updates)).all()
    }
    for key, value in updates.items():
        if key in existing:
            existing[key].value = value
        else:
            db.add(AdminSetting(key=key, value=value))
    db.commit()


def get_all_settings(db):
    return {row.key: row.value for row in db.query(AdminSetting).all()}
