import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import (
    JSONB,
)  # Use JSON for flexible address storage
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.db.database import Base


class Discount(Base):
    __tablename__ = "discounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, index=True, nullable=False)
    discount_type = Column(String(20), nullable=False)  # "percentage" or "fixed"
    value = Column(Integer, nullable=False)  # e.g., 10 for 10%, or 500 for $5.00
    max_uses = Column(Integer, nullable=True)
    used_count = Column(Integer, default=0)
    min_order_cents = Column(Integer, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_name = Column(String(255), nullable=False)
    customer_email = Column(String(255), nullable=False)

    # Using JSONB is great for addresses so we don't need 6 different columns
    shipping_address = Column(
        __import__("sqlalchemy").JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
    )

    subtotal_cents = Column(Integer, nullable=False)
    shipping_cents = Column(Integer, nullable=False, default=0)
    discount_cents = Column(Integer, nullable=False, default=0)
    tax_cents = Column(Integer, nullable=False, default=0)
    total_cents = Column(Integer, nullable=False)

    # Valid statuses: pending, paid, shipped, cancelled, refunded
    status = Column(String(50), default="pending", index=True)
    stripe_payment_intent_id = Column(String(255), nullable=True, unique=True)
    stripe_session_id = Column(String(255), nullable=True, unique=True)

    discount_id = Column(UUID(as_uuid=True), ForeignKey("discounts.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    discount = relationship("Discount")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    product_variant_id = Column(
        UUID(as_uuid=True), ForeignKey("product_variants.id"), nullable=False
    )

    # We store these explicitly so if the product changes later, the historical order receipt doesn't change
    product_name = Column(String(255), nullable=False)
    variant_label = Column(String(100), nullable=True)
    quantity = Column(Integer, nullable=False)
    unit_price_cents = Column(Integer, nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant")
