from app.models.payment import PaymentFields
import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, Time, Text, CheckConstraint, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from app.db.database import Base

class Booking(PaymentFields, Base):
    __tablename__ = "bookings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=False)
    
    # Customer Info
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    
    # Scheduling Info
    booking_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    
    # Payment & Status
    # Valid statuses: pending, confirmed, cancelled, completed, payment_failed
    status = Column(String(50), default="pending", index=True)
    deposit_cents = Column(Integer, nullable=False)
    total_price_cents = Column(Integer, nullable=True)
    service_name_snapshot = Column(String(255), nullable=True)
    service_completed_at = Column(DateTime(timezone=True), nullable=True)
    balance_requested_at = Column(DateTime(timezone=True), nullable=True)
    stripe_session_id = Column(String(255), nullable=True, unique=True)
    # Phase 9: Payment Intent ID for booking deposit (inline Payment Element flow)
    stripe_payment_intent_id = Column(String(255), nullable=True, unique=True)
    cancellation_reason = Column(String(255), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    service = relationship("Service")
    balance_payments = relationship("BookingBalancePayment", back_populates="booking", lazy="selectin")
    __table_args__ = (CheckConstraint("total_price_cents IS NULL OR total_price_cents >= deposit_cents", name="booking_total_covers_deposit"),)


class BookingBalancePayment(PaymentFields, Base):
    __tablename__ = "booking_balance_payments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id = Column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
    booking = relationship("Booking", back_populates="balance_payments")
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="balance_amount_positive"),
        CheckConstraint("refunded_cents >= 0 AND refunded_cents <= amount_cents", name="balance_refund_bounds"),
        Index("uq_booking_balance_pending", "booking_id", unique=True,
              postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'")),
    )

class BlockedDate(Base):
    __tablename__ = "blocked_dates"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    date = Column(Date, nullable=False, unique=True, index=True)
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
