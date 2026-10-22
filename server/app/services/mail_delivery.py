import json, logging, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta
from app.core.config import settings
from app.models.notification import EmailDelivery as EmailJob
log = logging.getLogger(__name__)
URL = "https://api.resend.com/emails"
def utcnow(): return datetime.now(timezone.utc)
def request(method, path="", payload=None, key=None):
    headers = {"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json",
               "User-Agent": "PholarNatural/1.0"}
    if key:
        headers["Idempotency-Key"] = key
    req = urllib.request.Request(URL + path, data=json.dumps(payload).encode() if payload else None,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

def process_one(db, sender=None):
    now = utcnow()
    job = (db.query(EmailJob).filter(EmailJob.status.in_(["queued", "sending", "accepted"]),
                                   EmailJob.next_attempt_at <= now)
           .order_by(EmailJob.next_attempt_at, EmailJob.created_at)
           .with_for_update(skip_locked=True).first())
    if not job:
        db.rollback()
        return False
    # Persist a lease before HTTP: a killed worker is recoverable after 90 seconds.
    polling = job.status == "accepted"
    if sender is not None:
        job.attempts += 1
        try:
            sender(job)
            job.status = "sent"
            job.sent_at = now
            job.last_error = None
        except Exception as exc:
            job.status = "queued"
            job.last_error = type(exc).__name__
            job.next_attempt_at = now + timedelta(seconds=60)
        db.commit()
        return True
    if not polling:
        if job.event_key.startswith("account/") and not job.event_key.endswith("/password-changed"):
            from app.models.customer import CustomerAction
            parts = job.event_key.split("/")
            action = db.get(CustomerAction, parts[1])
            if not action or action.used or action.expires_at.replace(tzinfo=timezone.utc) <= now:
                job.status = "cancelled"
                job.last_error = "Account link expired or was already used"
                db.commit()
                return True
        if job.event_key.startswith("newsletter/"):
            from app.models.subscriber import Subscriber
            parts = job.event_key.split("/")
            subscriber = db.query(Subscriber).filter_by(email=job.recipient).first()
            expected = "pending" if parts[2] == "confirm" else "subscribed"
            if not subscriber or subscriber.nonce != parts[1] or subscriber.status != expected:
                job.status = "cancelled"
                job.last_error = "Newsletter consent or confirmation link changed"
                db.commit()
                return True
        if job.event_key.startswith("reminder/"):
            from app.models.booking import Booking
            from uuid import UUID
            from zoneinfo import ZoneInfo
            parts = job.event_key.split("/")
            booking = db.query(Booking).filter_by(id=UUID(parts[1])).first()
            if not booking or booking.status != "confirmed" or str(booking.booking_date) != parts[2] or not parts[3].startswith(str(booking.start_time)) or datetime.combine(booking.booking_date, booking.start_time, ZoneInfo(settings.BUSINESS_TIMEZONE)) <= now:
                job.status = "cancelled"
                job.last_error = "Reminder no longer matches a confirmed appointment"
                db.commit()
                return True
        first = job.first_attempt_at
        if first and now - first.replace(tzinfo=timezone.utc) >= timedelta(hours=23):
            job.status = "needs_review"
            job.last_error = "Retry window ended; review provider history before replay to avoid duplicates."
            db.commit()
            return True
        job.status = "sending"
        job.attempts += 1
        job.first_attempt_at = first or now
    if not polling and not job.payload:
        recipients = [job.recipient] if job.recipient != "__admin__" else [r.strip() for r in (settings.ADMIN_EMAIL or "").split(",") if r.strip()]
        if not recipients:
            job.status = "queued"
            job.last_error = "ADMIN_EMAIL is not configured"
            job.next_attempt_at = now + timedelta(minutes=5)
            db.commit()
            return True
        job.payload = {"from": settings.DEFAULT_FROM_EMAIL, "to": recipients, "subject": job.subject, "html": job.html}
        if job.reply_to:
            job.payload["reply_to"] = job.reply_to
    job.next_attempt_at = now + timedelta(seconds=90)
    db.commit()
    try:
        if not settings.RESEND_API_KEY:
            raise RuntimeError("RESEND_API_KEY is missing")
        if polling:
            result = request("GET", "/" + job.provider_id)
            event = result.get("last_event", "sent")
            job.status = {"delivered": "delivered", "bounced": "bounced", "complained": "complained",
                          "failed": "failed", "suppressed": "suppressed"}.get(event, "accepted")
            job.next_attempt_at = utcnow() + timedelta(minutes=5)
            if job.status in ("bounced", "complained", "failed", "suppressed"):
                job.last_error = "Provider delivery event: " + event
                if job.status in ("bounced", "complained", "suppressed"):
                    from app.models.subscriber import Subscriber
                    db.query(Subscriber).filter_by(email=job.recipient).update({"status": "suppressed"})
            if job.status == "accepted" and now - (job.sent_at or job.created_at).replace(tzinfo=timezone.utc) > timedelta(days=3):
                job.status = "needs_review"
                job.last_error = "No terminal delivery event after 3 days"
        else:
            result = request("POST", payload=job.payload, key=job.provider_key or str(job.id))
            job.provider_id = result["id"]
            job.status = "accepted"
            job.sent_at = utcnow()
            job.last_error = None
            job.next_attempt_at = utcnow() + timedelta(minutes=1)
    except Exception as exc:
        permanent = isinstance(exc, urllib.error.HTTPError) and exc.code in (400, 401, 403, 404, 422)
        job.status = "needs_review" if permanent else ("accepted" if polling else "queued")
        job.last_error = f"{type(exc).__name__}: {exc}"[:255]
        delay = min(3600, 30 * 2 ** min(job.attempts, 7))
        if isinstance(exc, urllib.error.HTTPError):
            try:
                delay = max(delay, int(exc.headers.get("Retry-After", "0")))
            except ValueError:
                pass
        job.next_attempt_at = utcnow() + timedelta(seconds=delay)
        log.error("Mail job %s: %s", job.id, job.last_error)
    db.commit()
    return True



def main():
    import signal
    import threading
    from app.db.database import SessionLocal
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *args: stop.set())
    signal.signal(signal.SIGINT, lambda *args: stop.set())
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                busy = process_one(db)
        except Exception:
            log.exception("Mail worker cycle failed; persisted jobs will be retried")
            busy = False
        stop.wait(1 if busy else 5)

if __name__ == "__main__":
    main()
