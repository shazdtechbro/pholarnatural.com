"""Provider-neutral payment references, plus a durable webhook inbox."""
from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.orm import declarative_mixin
from sqlalchemy.sql import func
from app.db.database import Base


@declarative_mixin
class PaymentFields:
    payment_provider = Column(String(20), nullable=False, default="stripe", server_default="stripe")
    payment_environment = Column(String(20), nullable=False, default="legacy", server_default="legacy")
    currency = Column(String(3), nullable=False, default="CAD", server_default="CAD")
    payment_checkout_id = Column(String(255), unique=True)
    payment_checkout_url = Column(String(1000))
    payment_charge_id = Column(String(255), unique=True)
    payment_refund_id = Column(String(255), index=True)
    payment_request_key = Column(String(36), unique=True)
    payment_request_hash = Column(String(64))
    payment_request_payload = Column(JSON)
    refunded_cents = Column(Integer, nullable=False, default=0, server_default="0")


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    id = Column(String(255), primary_key=True)
    kind = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default="queued", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_error = Column(String(255))
