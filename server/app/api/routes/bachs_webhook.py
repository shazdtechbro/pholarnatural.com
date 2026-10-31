from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.api.dependencies import get_db
from app.core.config import settings
from app.models.payment import PaymentEvent
from app.services.bachs_gateway import BachsGateway, BachsError

router = APIRouter()


@router.post("/{environment}")
async def receive(environment: str, request: Request, db: Session = Depends(get_db)):
    if settings.PAYMENT_PROVIDER != "bachs" or environment != settings.BACHS_ENVIRONMENT:
        raise HTTPException(404, "Payment environment is not available on this deployment.")
    try:
        gateway = BachsGateway()
        payload = await request.body()
        if len(payload) > 256_000:
            raise HTTPException(413, "Webhook too large.")
        signature = request.headers.get("X-Bachs-Signature-V2")
        if not signature:
            signature = "t="+request.headers.get("X-Bachs-Timestamp", "")+",v1="+request.headers.get("X-Bachs-Signature", "")
        event = gateway.verify_webhook_signature(payload, signature)
    except BachsError as error:
        raise HTTPException(503 if error.code.endswith("NOT_CONFIGURED") else 400, "Webhook configuration unavailable." if error.code.endswith("NOT_CONFIGURED") else "Invalid webhook signature.")
    if not db.get(PaymentEvent, event["id"]):
        db.add(PaymentEvent(id=event["id"], kind=event["type"], payload=event))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()  # The other worker durably stored the same delivery.
    # No network calls or fulfilment in the delivery request. The worker owns retries.
    return {"received": True}
