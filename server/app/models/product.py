from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.db.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    tagline = Column(String(255), nullable=True)
    category = Column(String(100), index=True, nullable=True)
    seo_title = Column(String(255))
    seo_description = Column(String(500))
    is_bestseller = Column(Boolean, nullable=False, default=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, default=True)

    # func.now() lets the database handle the timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    images = relationship(
        "ProductImage",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductImage.sort_order",
    )
    variants = relationship(
        "ProductVariant", back_populates="product", cascade="all, delete-orphan"
    )


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    url = Column(String(500), nullable=False)
    alt = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0)

    # Relationship back to Product
    product = relationship("Product", back_populates="images")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    weight_grams = Column(Integer, nullable=True)
    weight_label = Column(String(50), nullable=True)  # e.g., "250g", "16oz"
    price_cents = Column(
        Integer, nullable=False
    )  # Always store currency as integers (cents)
    stock_count = Column(Integer, default=0)
    sku = Column(String(100), unique=True, index=True, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationship back to Product
    product = relationship("Product", back_populates="variants")
