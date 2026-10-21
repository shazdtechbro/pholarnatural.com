"""Transactional email composition and durable, retryable Resend delivery.

Queue rows in the same transaction as business changes. No customer data or
provider response body is logged. Provider acceptance is not inbox delivery.
"""

import json
import hashlib
import logging
import threading
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from html import escape
from sqlalchemy import func
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.notification import EmailDelivery
from app.services.settings_service import get_setting

logger = logging.getLogger(__name__)


def e(value):
    return escape(str(value if value is not None else ""), quote=True)


def cad(value):
    return f"CAD ${value / 100:,.2f}"


def message(title, lines):
    return (
        title,
        '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#334537">'
        "<h1>Pholar Natural</h1><h2>"
        + e(title)
        + "</h2>"
        + "".join("<p>" + e(line) + "</p>" for line in lines)
        + "<p>Questions? Reply to your Pholar Natural contact or visit "
        '<a href="'
        + e(settings.DOMAIN.rstrip("/") + "/contact")
        + '">Contact us</a>.</p></body></html>',
    )


def queue_email(db, key, recipient, subject, html):
    if (
        not recipient
        or any(
            isinstance(row, EmailDelivery) and row.event_key == key for row in db.new
        )
        or db.query(EmailDelivery.id).filter(EmailDelivery.event_key == key).first()
    ):
        return
    suppressed = db.query(EmailDelivery.id).filter(
        EmailDelivery.recipient == recipient,
        EmailDelivery.status.in_(["bounced", "complained", "suppressed"]),
    ).first()
    db.add(
        EmailDelivery(
            event_key=key, recipient=recipient, subject=subject[:255], html=html,
            status="suppressed" if suppressed else "queued",
            last_error="Recipient previously bounced or complained" if suppressed else None,
        )
    )


def queue_admin(db, key, content, force=False):
    if not force and get_setting(db, "email_notifications_enabled", "true") != "true":
        return
    recipients = [
        s.strip() for s in (settings.ADMIN_EMAIL or "").split(",") if s.strip()
    ]
    # Do not silently drop business alerts before recipients have been configured.
    if not recipients:
        queue_email(db, key + ":admin:unconfigured", "__admin__", *content)
    for recipient in recipients:
        queue_email(
            db,
            key + ":admin:" + hashlib.sha256(recipient.encode()).hexdigest(),
            recipient,
            *content,
        )


def order_confirmation_email(order):
    address = order.shipping_address or {}
    lines = [
        f"Order PN-{str(order.id)[:8].upper()} is paid.",
        *[
            f"{i.product_name} ({i.variant_label or 'Standard'}) × {i.quantity}: {cad(i.unit_price_cents * i.quantity)}"
            for i in order.items
        ],
        f"Subtotal: {cad(order.subtotal_cents)}; discount: {cad(order.discount_cents)}; shipping: {cad(order.shipping_cents)}; tax: {cad(order.tax_cents)}; total: {cad(order.total_cents)}",
        "Shipping to: " + ", ".join(str(v) for v in address.values() if v),
        "We will email you as your order progresses.",
    ]
    return message("Order payment confirmed", lines)


def booking_confirmation_email(booking):
    from app.core.security import customer_token

    url = (
        settings.DOMAIN.rstrip("/")
        + "/book/confirmation?id="
        + str(booking.id)
        + "&token="
        + customer_token("booking", booking.id)
    )
    title, html = message(
        "Appointment confirmed",
        [
            f"Reference PN-{str(booking.id)[:8].upper()}",
            f"{booking.service.name}: {booking.booking_date} at {booking.start_time}–{booking.end_time}",
            f"Deposit paid: {cad(booking.deposit_cents)}",
            "Cancel within 30 minutes of booking for a full deposit refund. Later cancellations are subject to the refund policy.",
        ],
    )
    return title, html.replace(
        "</body>",
        '<p><a href="' + e(url) + '">View or cancel your appointment</a></p></body>',
    )


def order_status_update_email(order, status):
    return message(
        "Order " + status.replace("_", " "),
        [
            f"Reference PN-{str(order.id)[:8].upper()}",
            f"Your order status is now {status}.",
            f"Order total: {cad(order.total_cents)}",
        ],
    )


def queue_order_paid(db, order):
    key = f"order:{order.id}:paid"
    queue_email(db, key, order.customer_email, *order_confirmation_email(order))
    queue_admin(
        db,
        key,
        message(
            "New paid order",
            [
                f"PN-{str(order.id)[:8].upper()}",
                f"{order.customer_name}: {cad(order.total_cents)}",
            ],
        ),
    )


def queue_booking_confirmed(db, booking):
    key = f"booking:{booking.id}:confirmed"
    queue_email(db, key, booking.customer_email, *booking_confirmation_email(booking))
    queue_admin(
        db,
        key,
        message(
            "New confirmed booking",
            [
                booking.customer_name,
                booking.service.name,
                str(booking.booking_date),
                str(booking.start_time),
            ],
        ),
    )

    from zoneinfo import ZoneInfo
    appointment = datetime.combine(booking.booking_date, booking.start_time, ZoneInfo(settings.BUSINESS_TIMEZONE))
    reminder_at = appointment - timedelta(hours=24)
    if reminder_at > datetime.now(timezone.utc):
        key = f"reminder/{booking.id}/{booking.booking_date}/{booking.start_time}"
        queue_email(db, key, booking.customer_email, *message("Your appointment is tomorrow", [booking.service.name, str(booking.booking_date), f"{booking.start_time} ({settings.BUSINESS_TIMEZONE})", "Please arrive five minutes early. Contact us if you need help."]))
        db.flush()
        row = db.query(EmailDelivery).filter_by(event_key=key).one()
        row.next_attempt_at = reminder_at


def queue_booking_cancelled(db, booking, refund_message):
    key = f"booking:{booking.id}:cancelled"
    content = message(
        "Appointment cancelled",
        [
            f"Reference PN-{str(booking.id)[:8].upper()}",
            booking.cancellation_reason or "Cancelled",
            refund_message,
        ],
    )
    queue_email(db, key, booking.customer_email, *content)
    queue_admin(db, key, content)


def queue_order_status(db, order):
    key = f"order:{order.id}:{order.status}"
    content = order_status_update_email(order, order.status)
    queue_email(db, key, order.customer_email, *content)
    queue_admin(db, key, content)


def queue_payment_failed(db, record, kind):
    key = f"{kind}:{record.id}:payment_failed"
    content = message(
        "Payment could not be completed",
        [
            "No payment has been confirmed. Please retry through the site or contact us for help.",
            f"Reference PN-{str(record.id)[:8].upper()}",
        ],
    )
    queue_email(db, key, record.customer_email, *content)
    queue_admin(db, key, content)


def deliver_one(db, sender=None):
    from app.services.mail_delivery import process_one
    return process_one(db, sender)


def start_worker(stop):
    def run():
        while not stop.is_set():
            try:
                with SessionLocal() as db:
                    processed = deliver_one(db)
                if processed:
                    stop.wait(1)
                    continue
            except Exception:
                logger.warning("Email queue unavailable; will retry")
            stop.wait(5)

    worker = threading.Thread(target=run, name="email-outbox", daemon=True)
    worker.start()
    return worker
