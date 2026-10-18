import re
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.service import Service
from app.models.booking import Booking
from app.schemas.service import ServiceCreate, ServiceUpdate


def get_active_services(db: Session):
    """Fetch all active services."""
    return db.query(Service).filter(Service.is_active == True).all()


def get_service_by_slug(db: Session, slug: str):
    """Fetch a single service by its slug."""
    return (
        db.query(Service)
        .filter(Service.slug == slug, Service.is_active == True)
        .first()
    )


def get_all_services(db: Session):
    """List all services, including inactive ones."""
    return db.query(Service).filter(Service.is_deleted == False).all()


def create_service(db: Session, service_in: ServiceCreate):
    """Create a new service."""

    unique_slug = generate_unique_slug(db, service_in.name)

    service_data = service_in.model_dump()
    service_data["slug"] = unique_slug

    db_service = Service(**service_data)
    db.add(db_service)
    db.commit()
    db.refresh(db_service)
    return db_service


def update_service(db: Session, service_id: int, service_in: ServiceUpdate):
    """Update an existing service."""
    db_service = db.query(Service).filter(Service.id == service_id).first()
    if not db_service or db_service.is_deleted:
        raise HTTPException(status_code=404, detail="Service not found")

    update_data = service_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_service, key, value)

    db.commit()
    db.refresh(db_service)
    return db_service


def delete_service(db: Session, service_id):
    """Delete a service, blocked if it has future non-cancelled bookings."""
    db_service = db.query(Service).filter(Service.id == service_id).first()
    if not db_service or db_service.is_deleted:
        raise HTTPException(status_code=404, detail="Service not found")

    future_count = (
        db.query(func.count(Booking.id))
        .filter(
            Booking.service_id == service_id,
            Booking.booking_date >= date.today(),
            Booking.status.not_in(["cancelled"]),
        )
        .scalar()
    ) or 0

    if future_count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete — {future_count} upcoming booking(s). Cancel them first.",
        )

    db_service.is_deleted = True
    db_service.is_active = False
    db.commit()


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
    if not db.query(Service).filter(Service.slug == base_slug).first():
        return base_slug

    counter = 1
    while True:
        new_slug = f"{base_slug}-{counter}"
        exists = db.query(Service).filter(Service.slug == new_slug).first()

        if not exists:
            return new_slug

        counter += 1
