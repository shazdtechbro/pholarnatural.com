from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.config import settings
from app.api.dependencies import get_db
from app.core.security import verify_customer_token
from app.models.order import Order
from app.models.booking import Booking
from app.models.notification import EmailDelivery

router = APIRouter()


@router.get("/info")
def info():
    return {"provider": settings.PAYMENT_PROVIDER,
            "environment": settings.BACHS_ENVIRONMENT if settings.PAYMENT_PROVIDER == "bachs" else "legacy",
            "currency": settings.PRICING_CURRENCY,
            "sandbox": settings.PAYMENT_SANDBOX_INSTANCE,
            "configured": bool(settings.BACHS_API_KEY and settings.BACHS_WEBHOOK_SECRET) if settings.PAYMENT_PROVIDER == "bachs" else bool(settings.STRIPE_SECRET_KEY)}


@router.post("/sandbox/{kind}/{record_id}/refund")
def sandbox_refund(kind: str, record_id: UUID, x_confirmation_token: str = Header(...), db: Session = Depends(get_db)):
    if not settings.PAYMENT_SANDBOX_INSTANCE or settings.BACHS_ENVIRONMENT != "sandbox" or settings.PAYMENT_PROVIDER != "bachs":
        raise HTTPException(404, "Not found.")
    if kind not in ("order", "booking"):
        raise HTTPException(404, "Not found.")
    verify_customer_token(x_confirmation_token, kind, record_id)
    record = db.get(Order if kind == "order" else Booking, record_id)
    if not record or record.payment_provider != "bachs" or record.payment_environment != "sandbox":
        raise HTTPException(404, "Sandbox purchase not found.")
    from app.services.bachs_gateway import BachsGateway
    if kind == "order":
        from app.services.order_service import update_order_status
        from app.schemas.order import OrderStatusUpdate
        record = update_order_status(db, record.id, OrderStatusUpdate(status="cancelled"), BachsGateway())
    else:
        from app.services.booking_service import cancel_booking
        record, _, _ = cancel_booking(db, record.id, "Sandbox refund test", BachsGateway(), admin=True)
    return {"status": record.status}


@router.get("/sandbox/{kind}/{record_id}/emails")
def sandbox_emails(kind: str, record_id: UUID, x_confirmation_token: str = Header(...), db: Session = Depends(get_db)):
    if not settings.PAYMENT_SANDBOX_INSTANCE or settings.BACHS_ENVIRONMENT != "sandbox" or kind not in ("order", "booking"):
        raise HTTPException(404, "Not found.")
    verify_customer_token(x_confirmation_token, kind, record_id)
    record = db.get(Order if kind == "order" else Booking, record_id)
    if not record:
        raise HTTPException(404, "Not found.")
    rows = db.query(EmailDelivery).filter(EmailDelivery.event_key.like(f"{kind}:{record_id}:%"), EmailDelivery.recipient == record.customer_email).order_by(EmailDelivery.created_at).all()
    return [{"subject": row.subject, "status": row.status} for row in rows]
