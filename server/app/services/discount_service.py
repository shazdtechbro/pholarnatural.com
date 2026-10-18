from datetime import datetime, timezone

from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.order import Discount
from app.schemas.discount import DiscountCreate, DiscountUpdate


def get_all_discounts(db: Session):
    return db.query(Discount).all()


def create_discount(db: Session, discount_in: DiscountCreate):
    if db.query(Discount).filter(Discount.code == discount_in.code.upper()).first():
        raise HTTPException(status_code=400, detail="Discount code already exists.")

    db_discount = Discount(
        **discount_in.model_dump(exclude={"code"}),
        code=discount_in.code.upper(),  # Enforce uppercase codes
    )
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    return db_discount


def update_discount(db: Session, discount_id: int, discount_in: DiscountUpdate):
    db_discount = db.query(Discount).filter(Discount.id == discount_id).first()
    if not db_discount:
        raise HTTPException(status_code=404, detail="Discount not found")

    update_data = discount_in.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"]:
        update_data["code"] = update_data["code"].upper()

    from pydantic import ValidationError

    merged = {key: getattr(db_discount, key) for key in DiscountCreate.model_fields}
    merged.update(update_data)
    try:
        DiscountCreate.model_validate(merged)
    except ValidationError:
        raise HTTPException(422, "Invalid discount configuration.")
    for key, value in update_data.items():
        setattr(db_discount, key, value)

    db.commit()
    db.refresh(db_discount)
    return db_discount


def delete_discount(db: Session, discount_id: int):
    db_discount = db.query(Discount).filter(Discount.id == discount_id).first()
    if not db_discount:
        raise HTTPException(status_code=404, detail="Discount not found")

    db.delete(db_discount)
    db.commit()
    return {"message": "Discount deleted"}


def validate_discount(db: Session, code: str, subtotal_cents: int):
    """Public validation — checks without consuming a use. Returns discount amount if valid."""
    db_discount = (
        db.query(Discount)
        .filter(
            Discount.code == code.upper(),
            Discount.is_active == True,
        )
        .first()
    )
    if not db_discount:
        raise HTTPException(status_code=404, detail="Discount code not found.")
    if db_discount.expires_at:
        expires = (
            db_discount.expires_at.replace(tzinfo=timezone.utc)
            if db_discount.expires_at.tzinfo is None
            else db_discount.expires_at
        )
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Discount code has expired.")
    if db_discount.max_uses and db_discount.used_count >= db_discount.max_uses:
        raise HTTPException(
            status_code=400, detail="Discount code has reached its usage limit."
        )
    if db_discount.min_order_cents and subtotal_cents < db_discount.min_order_cents:
        min_dollars = db_discount.min_order_cents / 100
        raise HTTPException(
            status_code=400,
            detail=f"A minimum order of CAD ${min_dollars:.2f} is required for this code.",
        )

    if db_discount.discount_type == "percentage":
        discount_cents = (subtotal_cents * db_discount.value + 50) // 100
    else:
        discount_cents = db_discount.value
    discount_cents = min(discount_cents, subtotal_cents)

    if db_discount.discount_type == "percentage":
        description = f"{db_discount.value}% off"
    else:
        description = f"CAD ${discount_cents / 100:.2f} off"

    return {
        "valid": True,
        "code": db_discount.code,
        "discount_type": db_discount.discount_type,
        "value": db_discount.value,
        "discount_cents": discount_cents,
        "message": f"Code applied — {description}.",
    }
