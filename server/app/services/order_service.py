from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from app.models.order import Order, OrderItem, Discount
from app.models.product import Product, ProductVariant
from app.core.config import settings
from app.core.security import customer_token
from app.core.transactions import transaction_lock
from app.services.settings_service import get_setting
from app.services.email import queue_order_paid, queue_order_status

HOLD_MINUTES = 30
PAID_STATUSES = ("paid", "confirmed", "processing", "shipped", "delivered")


def get_orders(db, status=None):
    q = db.query(Order).options(selectinload(Order.items))
    if status:
        q = q.filter(Order.status == status)
    return q.order_by(Order.created_at.desc()).all()


def get_order_detail(db, order_id):
    order = (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(404, "Order not found")
    return order


def _get_shipping_cents(db, country, subtotal=0):
    threshold = int(get_setting(db, "free_shipping_threshold_cents", "5000"))
    if subtotal > threshold:
        return 0
    c = country.strip().lower()
    region = (
        "domestic"
        if c in ("canada", "ca")
        else "us"
        if c in ("united states", "us", "usa")
        else "uk"
        if c in ("united kingdom", "uk", "gb", "great britain")
        else "international"
    )
    defaults = {"domestic": 995, "us": 1499, "uk": 1999, "international": 2499}
    return int(
        get_setting(db, "shipping_rate_" + region + "_cents", str(defaults[region]))
    )


def _get_tax_rate(db):
    return float(get_setting(db, "tax_rate_percent", "13"))


def create_order_checkout(db, order_in, payment_gateway):
    transaction_lock(db, 902)
    ids = [i.variant_id for i in order_in.items]
    variants = (
        db.query(ProductVariant)
        .join(Product)
        .filter(
            ProductVariant.id.in_(ids),
            ProductVariant.is_active == True,
            Product.is_active == True,
        )
        .order_by(ProductVariant.id)
        .with_for_update(of=ProductVariant)
        .all()
    )
    by_id = {v.id: v for v in variants}
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES)
    items = []
    subtotal = 0
    for item in order_in.items:
        variant = by_id.get(item.variant_id)
        if not variant:
            raise HTTPException(400, "A selected variant is no longer available.")
        reserved = (
            db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(Order)
            .filter(
                OrderItem.product_variant_id == variant.id,
                Order.status == "pending",
                Order.created_at > cutoff,
            )
            .scalar()
        )
        if item.quantity > variant.stock_count - reserved:
            raise HTTPException(409, "Not enough available stock. Refresh your cart.")
        if variant.price_cents <= 0:
            raise HTTPException(400, "This product is not available for checkout.")
        subtotal += variant.price_cents * item.quantity
        items.append(
            OrderItem(
                product_variant_id=variant.id,
                product_name=variant.product.name,
                variant_label=variant.weight_label,
                quantity=item.quantity,
                unit_price_cents=variant.price_cents,
            )
        )
    discount = None
    discount_cents = 0
    if order_in.discount_code:
        discount = (
            db.query(Discount)
            .filter(
                func.upper(Discount.code) == order_in.discount_code.upper(),
                Discount.is_active == True,
            )
            .with_for_update()
            .first()
        )
        if not discount:
            raise HTTPException(400, "Invalid discount code.")
        now = datetime.now(timezone.utc)
        expiry = discount.expires_at
        if expiry and expiry.replace(tzinfo=timezone.utc) <= now:
            raise HTTPException(400, "Discount code expired.")
        pending = (
            db.query(func.count(Order.id))
            .filter(
                Order.discount_id == discount.id,
                Order.status == "pending",
                Order.created_at > cutoff,
            )
            .scalar()
        )
        if (
            discount.max_uses is not None
            and discount.used_count + pending >= discount.max_uses
        ):
            raise HTTPException(400, "Discount usage limit reached.")
        if subtotal < (discount.min_order_cents or 0):
            raise HTTPException(400, "Order minimum not met.")
        discount_cents = min(
            subtotal,
            (subtotal * discount.value + 50) // 100
            if discount.discount_type == "percentage"
            else discount.value,
        )
    shipping = _get_shipping_cents(db, order_in.shipping_address.country, subtotal)
    taxable = subtotal - discount_cents + shipping
    tax = int(
        (Decimal(taxable) * Decimal(str(_get_tax_rate(db))) / 100).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    total = taxable + tax
    if total < 50 or total > 99_999_999:
        raise HTTPException(400, "Order total is outside supported payment limits.")
    order = Order(
        customer_name=order_in.customer_name,
        customer_email=str(order_in.customer_email),
        shipping_address=order_in.shipping_address.model_dump(),
        subtotal_cents=subtotal,
        shipping_cents=shipping,
        discount_cents=discount_cents,
        tax_cents=tax,
        total_cents=total,
        status="pending",
        discount_id=discount.id if discount else None,
        items=items,
    )
    db.add(order)
    db.flush()
    token = customer_token("order", order.id)
    try:
        session = payment_gateway.create_checkout_session(
            line_items=[
                {
                    "price_data": {
                        "currency": "cad",
                        "unit_amount": total,
                        "product_data": {
                            "name": "Pholar Natural order",
                            "description": ", ".join(
                                f"{i.quantity} × {i.product_name} ({i.variant_label})"
                                for i in items
                            )[:500],
                        },
                    },
                    "quantity": 1,
                }
            ],
            success_url=f"{settings.DOMAIN.rstrip('/')}/checkout/success?id={order.id}&token={token}",
            cancel_url=f"{settings.DOMAIN.rstrip('/')}/cart",
            metadata={"order_id": str(order.id), "type": "product_order"},
            customer_email=order.customer_email,
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            502,
            "Payment setup unavailable. Your cart has been preserved; please retry.",
        )
    order.stripe_session_id = session["session_id"]
    db.commit()
    db.refresh(order)
    return order, session["url"]


def confirm_order_payment(db, session_id, payment_intent_id=None):
    transaction_lock(db, 902)
    order = (
        db.query(Order)
        .filter(Order.stripe_session_id == session_id)
        .with_for_update()
        .first()
    )
    if (
        not order
        or order.status in PAID_STATUSES
        or order.status in ("refunded", "refund_pending")
    ):
        return None
    if order.status not in ("pending", "expired"):
        raise HTTPException(409, "Order cannot be paid in its current state.")
    variants = {
        v.id: v
        for v in db.query(ProductVariant)
        .filter(ProductVariant.id.in_([i.product_variant_id for i in order.items]))
        .with_for_update()
        .all()
    }
    if any(
        i.product_variant_id not in variants
        or variants[i.product_variant_id].stock_count < i.quantity
        for i in order.items
    ):
        # Never silently oversell. Stripe retries until the exceptional payment is refunded.
        raise HTTPException(409, "Inventory changed; payment requires reconciliation.")
    order.stripe_payment_intent_id = payment_intent_id
    order.status = "paid"
    for item in order.items:
        variants[item.product_variant_id].stock_count -= item.quantity
    if order.discount_id:
        discount = (
            db.query(Discount)
            .filter(Discount.id == order.discount_id)
            .with_for_update()
            .first()
        )
        if discount:
            discount.used_count += 1
    queue_order_paid(db, order)
    db.commit()
    from app.services.whatsapp import notify, NotificationEvent

    notify(
        NotificationEvent.NEW_ORDER,
        f"New paid order PN-{str(order.id)[:8].upper()}: CAD ${order.total_cents / 100:.2f}",
        db,
    )
    for item in order.items:
        variant = variants[item.product_variant_id]
        if variant.stock_count <= int(get_setting(db, "low_stock_threshold", "5")):
            notify(
                NotificationEvent.LOW_STOCK,
                f"Low stock: {item.product_name} ({item.variant_label}): {variant.stock_count}",
                db,
            )
    if (
        order.discount_id
        and discount
        and discount.max_uses
        and discount.used_count >= discount.max_uses
    ):
        notify(
            NotificationEvent.DISCOUNT_MAXED_OUT,
            f"Discount {discount.code} has reached its usage limit.",
            db,
        )
    db.refresh(order)
    return order


def update_order_status(db, order_id, status_in, payment_gateway=None):
    transaction_lock(db, 902)
    order = get_order_detail(db, order_id)
    target = status_in.status
    if order.status == target or (
        target == "cancelled" and order.status in ("refunded", "refund_pending")
    ):
        return order
    transitions = {
        "paid": {"confirmed", "processing", "cancelled"},
        "confirmed": {"processing", "cancelled"},
        "processing": {"shipped", "cancelled"},
        "shipped": {"delivered"},
        "delivered": set(),
        "pending": {"cancelled"},
        "expired": set(),
    }
    if target not in transitions.get(order.status, set()):
        raise HTTPException(409, "Invalid order status transition.")
    if target == "cancelled" and order.status in PAID_STATUSES:
        if not payment_gateway or not order.stripe_payment_intent_id:
            raise HTTPException(
                409,
                "Payment details required for a refund; reconcile the payment before cancelling.",
            )
        try:
            result = payment_gateway.create_refund(order.stripe_payment_intent_id)
        except Exception:
            raise HTTPException(
                502, "Refund could not be requested. Order remains unchanged."
            )
        if result.get("status") not in ("succeeded", "pending"):
            raise HTTPException(
                502, "Refund was not accepted. Order remains unchanged."
            )
        target = "refunded" if result["status"] == "succeeded" else "refund_pending"
        if target == "refunded":
            for item in order.items:
                variant = (
                    db.query(ProductVariant)
                    .filter(ProductVariant.id == item.product_variant_id)
                    .with_for_update()
                    .first()
                )
                if variant:
                    variant.stock_count += item.quantity
    order.status = target
    queue_order_status(db, order)
    db.commit()
    db.refresh(order)
    return order
