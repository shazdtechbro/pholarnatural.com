import os
import re
import shutil
import uuid
from typing import Optional

from app.services.storage_service import StorageService
from sqlalchemy import or_, func
from sqlalchemy.orm import Session, selectinload
from fastapi import HTTPException, status, UploadFile
from app.models.product import Product, ProductImage, ProductVariant
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    VariantCreate,
    VariantUpdate,
)


def get_all_products(db: Session):
    """Fetch all products (including inactive) for the admin panel."""
    return (
        db.query(Product)
        .filter(Product.is_deleted == False)
        .options(selectinload(Product.images), selectinload(Product.variants))
        .order_by(Product.created_at.desc())
        .all()
    )


def get_active_products(
    db: Session,
    category: Optional[str] = None,
    q: Optional[str] = None,
):
    """
    Fetch active products with optional filters.
    category — exact match on the category column.
    q        — case-insensitive substring match on name OR description.
    """
    query = db.query(Product).filter(Product.is_active == True, Product.is_deleted == False)

    if category:
        query = query.filter(Product.category == category)

    if q:
        pattern = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Product.name).like(pattern),
                func.lower(Product.description).like(pattern),
            )
        )

    return query.options(
        selectinload(Product.images), selectinload(Product.variants)
    ).all()


def get_product_by_slug(db: Session, slug: str):
    """
    Fetches a single product by its URL-friendly slug.
    Throws a 404 error if not found.
    """
    product = (
        db.query(Product)
        .filter(Product.slug == slug, Product.is_active == True, Product.is_deleted == False)
        .options(selectinload(Product.images), selectinload(Product.variants))
        .first()
    )

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with slug '{slug}' not found",
        )

    return product


def create_product(db: Session, product_in: ProductCreate):
    """Create a new product and its initial variants."""

    # Check if slug exists
    unique_slug = generate_unique_slug(db, product_in.name)

    # Create the Product
    db_product = Product(
        name=product_in.name,
        slug=unique_slug,
        description=product_in.description,
        tagline=product_in.tagline,
        category=product_in.category,
        is_active=product_in.is_active,
        seo_title=product_in.seo_title,
        seo_description=product_in.seo_description,
        is_bestseller=product_in.is_bestseller,
    )
    db.add(db_product)
    db.flush()  # Keep product and initial variants in one transaction
    db.refresh(db_product)

    # Create the Variants
    for var_in in product_in.variants:
        db_variant = ProductVariant(
            product_id=db_product.id,
            weight_grams=var_in.weight_grams,
            weight_label=var_in.weight_label,
            price_cents=var_in.price_cents,
            stock_count=var_in.stock_count,
            sku=var_in.sku,
            is_active=var_in.is_active,
        )
        db.add(db_variant)

    db.commit()
    db.refresh(db_product)
    return db_product


def update_product(db: Session, product_id: int, product_in: ProductUpdate):
    """Update an existing product's top-level details."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product or db_product.is_deleted:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = product_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_product, key, value)

    db.commit()
    db.refresh(db_product)
    return db_product


def delete_product(db: Session, product_id: int):
    """Delete a product (and cascade delete variants/images)."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product or db_product.is_deleted:
        raise HTTPException(status_code=404, detail="Product not found")

    db_product.is_deleted = True
    db_product.is_active = False
    db.commit()
    return {"message": "Product deleted successfully"}


def add_variant_to_product(db: Session, product_id: int, variant_in: VariantCreate):
    """Add a new variant to an existing product."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product or db_product.is_deleted:
        raise HTTPException(status_code=404, detail="Product not found")

    db_variant = ProductVariant(
        product_id=product_id,
        weight_grams=variant_in.weight_grams,
        weight_label=variant_in.weight_label,
        price_cents=variant_in.price_cents,
        stock_count=variant_in.stock_count,
        sku=variant_in.sku,
        is_active=variant_in.is_active,
    )
    db.add(db_variant)
    db.commit()
    db.refresh(db_variant)
    return db_variant


def update_variant(db: Session, variant_id: int, variant_in: VariantUpdate):
    """Update an existing variant."""
    db_variant = (
        db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    )
    if not db_variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    update_data = variant_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_variant, key, value)

    db.commit()
    db.refresh(db_variant)

    # Fire low_stock when an admin manually adjusts stock into the warning zone.
    if "stock_count" in update_data and db_variant.stock_count >= 0:
        from app.services.settings_service import get_setting  # noqa: PLC0415
        from app.services.whatsapp import notify, NotificationEvent  # noqa: PLC0415

        threshold = int(get_setting(db, "low_stock_threshold", "5"))
        if 0 < db_variant.stock_count <= threshold:
            product = (
                db.query(Product).filter(Product.id == db_variant.product_id).first()
            )
            product_name = product.name if product else "Unknown"
            variant_label = db_variant.weight_label or "Default"
            units = db_variant.stock_count
            notify(
                NotificationEvent.LOW_STOCK,
                f"⚠️ Low Stock — {product_name}\n"
                f"Variant: {variant_label} · {units} unit{'s' if units != 1 else ''} remaining\n"
                f"pholarnatural.com/admin/products",
                db,
            )

    return db_variant


def delete_variant(db: Session, variant_id: int):
    """Delete a variant."""
    db_variant = (
        db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    )
    if not db_variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    db_variant.is_active = False
    db.commit()
    return {"message": "Variant deleted successfully"}


def upload_product_image(
    db: Session,
    product_id: int,
    file: UploadFile,
    storage: StorageService,  # INJECT HERE
):
    """Save an uploaded image via Cloudinary and add it to the database."""
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product or db_product.is_deleted:
        raise HTTPException(status_code=404, detail="Product not found")

    # Upload using the injected service
    try:
        # Pass the raw file bytes
        image_url = storage.upload_image(file.file, folder="products")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Image upload unavailable.")

    db_image = ProductImage(
        product_id=product_id,
        url=image_url,
        alt=db_product.name,
        sort_order=len(db_product.images),
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


def delete_product_image(
    db: Session,
    product_id: int,
    image_id: int,
    storage: StorageService,  # INJECT HERE
):
    """Delete an image record from the DB and Cloudinary."""
    db_image = (
        db.query(ProductImage)
        .filter(ProductImage.id == image_id, ProductImage.product_id == product_id)
        .first()
    )
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete from Cloudinary
    storage.delete_image(db_image.url)

    db.delete(db_image)
    db.commit()
    return {"message": "Image deleted successfully"}


def generate_unique_slug(db: Session, slug: str) -> str:
    """
    Generate a unique slug by appending a number if it already exists.
    Example:
        iphone -> iphone
        iphone -> iphone-1
        iphone -> iphone-2
    """
    base_slug = re.sub(r"[^a-zA-Z0-9-]", "", slug.replace(" ", "-")).strip("-").lower()

    if not base_slug:
        import uuid

        base_slug = uuid.uuid4().hex[:12]

    # If the slug doesn't exist, return it
    if not db.query(Product).filter(Product.slug == base_slug).first():
        return base_slug

    counter = 1
    while True:
        new_slug = f"{base_slug}-{counter}"
        exists = db.query(Product).filter(Product.slug == new_slug).first()

        if not exists:
            return new_slug

        counter += 1
