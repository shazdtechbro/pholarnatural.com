from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_admin, get_storage_service
from app.models.admin import AdminUser
from app.schemas.product import (
    ProductResponse,
    ProductCreate,
    ProductUpdate,
    VariantCreate,
    ProductImageBase,
)
from app.services import product_service
from app.services.storage_service import StorageService

router = APIRouter()


@router.get("/", response_model=List[ProductResponse])
def list_products(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """List all products including inactive (Admin only)."""
    return product_service.get_all_products(db)


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Create a new product (Admin only)."""
    return product_service.create_product(db, product_in)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: UUID,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Update a product (Admin only)."""
    return product_service.update_product(db, product_id, product_in)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Delete a product (Admin only)."""
    product_service.delete_product(db, product_id)
    return None


@router.post("/{product_id}/variants", status_code=status.HTTP_201_CREATED)
def add_product_variant(
    product_id: UUID,
    variant_in: VariantCreate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Add a variant to a product (Admin only)."""
    return product_service.add_variant_to_product(db, product_id, variant_in)


@router.post(
    "/{product_id}/images",
    response_model=ProductImageBase,
    status_code=status.HTTP_201_CREATED,
)
def upload_image(
    product_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
    storage: StorageService = Depends(get_storage_service),
):
    """Upload an image for a product via Cloudinary."""
    return product_service.upload_product_image(db, product_id, file, storage)


@router.delete(
    "/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_image(
    product_id: UUID,
    image_id: UUID,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
    storage: StorageService = Depends(get_storage_service),
):
    """Delete a product image from Cloudinary and the database."""
    product_service.delete_product_image(db, product_id, image_id, storage)
    return None


@router.put("/{product_id}/images/order")
def reorder_images(
    product_id: UUID,
    image_ids: List[UUID],
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    from app.models.product import ProductImage, Product
    from fastapi import HTTPException

    if (
        not db.query(Product)
        .filter(Product.id == product_id, Product.is_deleted == False)
        .first()
    ):
        raise HTTPException(404, "Product not found.")
    images = (
        db.query(ProductImage)
        .filter(ProductImage.product_id == product_id)
        .with_for_update()
        .all()
    )
    if len(image_ids) != len(set(image_ids)) or set(image_ids) != {
        img.id for img in images
    }:
        raise HTTPException(
            422, "Supply each image belonging to this product exactly once."
        )
    order = {value: index for index, value in enumerate(image_ids)}
    for image in images:
        image.sort_order = order[image.id]
    db.commit()
    return {"ok": True}
