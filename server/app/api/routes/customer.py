"""Customer sessions are deliberately separate from administrator authentication."""
import hashlib
import secrets
from datetime import timedelta, timezone
from html import escape
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.core.config import settings
from app.core.security import customer_token
from app.models.customer import Customer, CustomerSession, CustomerAction, CustomerCartMerge
from app.models.order import Order
from app.models.booking import Booking
from app.models.product import ProductVariant
from app.services.mail_delivery import utcnow
from app.services.email import queue_email
from app.services.newsletter_mail import _base

router = APIRouter()
hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
SECURE = settings.DOMAIN.startswith("https://")
COOKIE = "__Host-pholar_customer" if SECURE else "pholar_customer"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def origin_guard(request: Request):
    allowed = {v.strip().rstrip("/") for v in (settings.CORS_ORIGINS or settings.DOMAIN).split(",")}
    if request.headers.get("origin", "").rstrip("/") not in allowed:
        raise HTTPException(403, "Please use the Pholar Natural website to continue.")


def current(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    session = db.get(CustomerSession, digest(token)) if token else None
    if not session or session.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
        raise HTTPException(401, "Please sign in to your account.")
    customer = db.get(Customer, session.customer_id)
    if not customer:
        raise HTTPException(401, "Please sign in to your account.")
    return customer


def public(customer):
    return {"id": str(customer.id), "name": customer.name, "email": customer.email, "verified": customer.verified}


def issue_session(db, customer, response):
    token = secrets.token_urlsafe(32)
    db.add(CustomerSession(token_hash=digest(token), customer_id=customer.id, expires_at=utcnow()+timedelta(days=30)))
    response.set_cookie(COOKIE, token, max_age=30*86400, secure=SECURE, httponly=True, samesite="lax", path="/")


def password_matches(password, hashed):
    try:
        return hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def send_action(db, customer, purpose):
    now = utcnow()
    # Persistent cooldown also applies across API workers and server restarts.
    recent = db.query(CustomerAction).filter_by(customer_id=customer.id, purpose=purpose).filter(CustomerAction.created_at > now-timedelta(minutes=2)).first()
    if recent:
        return
    db.query(CustomerAction).filter_by(customer_id=customer.id, purpose=purpose, used=False).update({"used": True})
    token = secrets.token_urlsafe(32)
    row = CustomerAction(token_hash=digest(token), customer_id=customer.id, purpose=purpose, created_at=now, expires_at=now+timedelta(hours=24 if purpose == "verify" else 0.5))
    db.add(row)
    title = "Verify your email" if purpose == "verify" else "Reset your password"
    path = "verify" if purpose == "verify" else "reset-password"
    link = f"{settings.DOMAIN.rstrip('/')}/account/{path}#token={token}"
    note = "Enter the password you chose when creating your account. This protects your bookings and orders." if purpose == "verify" else "Choose a new password. This link expires in 30 minutes and can only be used once."
    html = _base(title, f'<h1>{title}</h1><p>Hello {escape(customer.name)},</p><p>{note}</p><p><a href="{escape(link, quote=True)}">{title}</a></p><p>If you did not request this, you can ignore this email.</p>')
    queue_email(db, f"account/{row.token_hash}/{purpose}", customer.email, f"{title} · Pholar Natural", html)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Registration(Credentials):
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=12, max_length=128)


class EmailInput(Input):
    email: EmailStr


class ActionInput(Input):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class ResetInput(ActionInput):
    password: str = Field(min_length=12, max_length=128)


@router.get("/me")
def me(customer: Customer = Depends(current)):
    return public(customer)


@router.post("/register", dependencies=[Depends(origin_guard)], status_code=201)
def register(body: Registration, response: Response, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Please enter your name.")
    # Do not overwrite an existing account or silently authenticate a duplicate signup.
    if db.query(Customer).filter_by(email=email).first():
        raise HTTPException(409, "Unable to create this account. Try signing in or resetting your password.")
    customer = Customer(email=email, name=name, password_hash=hasher.hash(body.password))
    db.add(customer)
    db.flush()
    send_action(db, customer, "verify")
    issue_session(db, customer, response)
    db.commit()
    return public(customer)


@router.post("/login", dependencies=[Depends(origin_guard)])
def login(body: Credentials, response: Response, request: Request, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter_by(email=str(body.email).lower()).with_for_update().first()
    valid = password_matches(body.password, customer.password_hash if customer else DUMMY_HASH)
    if not customer or not valid:
        raise HTTPException(401, "Email or password is incorrect.")
    old = request.cookies.get(COOKIE)
    if old:
        db.query(CustomerSession).filter_by(token_hash=digest(old)).delete()
    issue_session(db, customer, response)
    db.commit()
    return public(customer)


@router.post("/logout", dependencies=[Depends(origin_guard)])
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    db.query(CustomerSession).filter_by(token_hash=digest(request.cookies.get(COOKIE, ""))).delete()
    db.commit()
    response.delete_cookie(COOKIE, secure=SECURE, httponly=True, samesite="lax", path="/")
    return {"message": "Signed out."}


@router.post("/resend-verification", dependencies=[Depends(origin_guard)], status_code=202)
def resend(customer: Customer = Depends(current), db: Session = Depends(get_db)):
    if not customer.verified:
        send_action(db, customer, "verify")
        db.commit()
    return {"message": "Check your inbox for your verification email. You can request another after two minutes."}


def action(db, token, purpose):
    row = db.query(CustomerAction).filter_by(token_hash=digest(token), purpose=purpose).with_for_update().first()
    if not row or row.used or row.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
        raise HTTPException(400, "This link has expired or has already been used. Please request a new one.")
    return row


@router.post("/verify", dependencies=[Depends(origin_guard)])
def verify(body: ActionInput, response: Response, db: Session = Depends(get_db)):
    row = action(db, body.token, "verify")
    customer = db.get(Customer, row.customer_id)
    # Email ownership and knowledge of the chosen password prevent account pre-hijacking.
    if not password_matches(body.password, customer.password_hash):
        raise HTTPException(400, "Please enter the password you chose for this account.")
    row.used = True
    customer.verified = True
    db.query(CustomerSession).filter_by(customer_id=customer.id).delete()
    issue_session(db, customer, response)
    db.commit()
    return public(customer)


@router.post("/forgot-password", dependencies=[Depends(origin_guard)], status_code=202)
def forgot(body: EmailInput, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter_by(email=str(body.email).lower()).first()
    if customer:
        send_action(db, customer, "reset")
        db.commit()
    return {"message": "If an account exists for this email, a password reset link will arrive shortly."}


@router.post("/reset-password", dependencies=[Depends(origin_guard)])
def reset(body: ResetInput, db: Session = Depends(get_db)):
    row = action(db, body.token, "reset")
    customer = db.get(Customer, row.customer_id)
    customer.password_hash = hasher.hash(body.password)
    customer.verified = True
    db.query(CustomerAction).filter_by(customer_id=customer.id).update({"used": True})
    db.query(CustomerSession).filter_by(customer_id=customer.id).delete()
    queue_email(db, f"account/{row.token_hash}/password-changed", customer.email, "Your Pholar Natural password was changed", _base("Password changed", '<h1>Your password was changed</h1><p>All previous sessions have been signed out. If this was not you, reset your password immediately and contact us.</p>'))
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


def cart_response(customer, db):
    items = []
    for line in customer.cart:
        variant = db.get(ProductVariant, UUID(line["variant_id"]))
        if not variant or not variant.is_active or variant.stock_count <= 0:
            continue
        product = variant.product
        if product.is_deleted or not product.is_active or variant.price_cents <= 0:
            continue
        image = product.images[0] if product.images else None
        items.append({"key": f"{product.id}:{variant.id}", "product_id": str(product.id), "product_name": product.name, "product_slug": product.slug, "variant_id": str(variant.id), "variant_label": variant.weight_label or "", "unit_price_cents": variant.price_cents, "quantity": min(line["quantity"], variant.stock_count, 100), "stock_count": variant.stock_count, "image_url": image.url if image else "", "image_alt": (image.alt or product.name) if image else product.name})
    return {"items": items, "version": customer.cart_version}


class CartLine(Input):
    variant_id: UUID
    quantity: int = Field(ge=1, le=100, strict=True)


class CartInput(Input):
    items: list[CartLine] = Field(max_length=100)
    version: int = Field(ge=0)


class MergeInput(Input):
    items: list[CartLine] = Field(max_length=100)
    operation_id: UUID


def lock_customer(db, customer):
    return db.query(Customer).filter_by(id=customer.id).populate_existing().with_for_update().one()


@router.get("/cart")
def get_cart(customer: Customer = Depends(current), db: Session = Depends(get_db)):
    return cart_response(customer, db)


@router.put("/cart", dependencies=[Depends(origin_guard)])
def save_cart(body: CartInput, customer: Customer = Depends(current), db: Session = Depends(get_db)):
    customer = lock_customer(db, customer)
    if customer.cart_version != body.version:
        raise HTTPException(409, "Your cart changed on another device. Reload your saved cart before editing it.")
    lines = {str(line.variant_id): line.quantity for line in body.items}
    customer.cart = [{"variant_id": key, "quantity": quantity} for key, quantity in lines.items()]
    customer.cart_version += 1
    db.commit()
    return cart_response(customer, db)


@router.post("/cart/merge", dependencies=[Depends(origin_guard)])
def merge_cart(body: MergeInput, customer: Customer = Depends(current), db: Session = Depends(get_db)):
    customer = lock_customer(db, customer)
    seen = db.get(CustomerCartMerge, (customer.id, body.operation_id))
    if not seen:
        lines = {line["variant_id"]: line["quantity"] for line in customer.cart}
        incoming = {str(line.variant_id): line.quantity for line in body.items}
        if len(set(lines) | set(incoming)) > 100:
            raise HTTPException(422, "Your cart can hold up to 100 different items.")
        for key, quantity in incoming.items():
            lines[key] = min(100, lines.get(key, 0)+quantity)
        customer.cart = [{"variant_id": key, "quantity": quantity} for key, quantity in lines.items()]
        customer.cart_version += 1
        db.add(CustomerCartMerge(customer_id=customer.id, operation_id=body.operation_id))
        db.commit()
    return cart_response(customer, db)


@router.get("/history")
def history(customer: Customer = Depends(current), db: Session = Depends(get_db)):
    if not customer.verified:
        raise HTTPException(403, "Verify your email to see your bookings and orders.")
    orders = db.query(Order).filter(func.lower(Order.customer_email) == customer.email).order_by(Order.created_at.desc()).limit(100).all()
    bookings = db.query(Booking).filter(func.lower(Booking.customer_email) == customer.email).order_by(Booking.booking_date.desc()).limit(100).all()
    return {
        "orders": [{"id": str(o.id), "reference": str(o.id)[:8].upper(), "date": o.created_at.isoformat(), "status": o.status, "total_cents": o.total_cents, "url": f"/checkout/success?id={o.id}&token={customer_token('order', o.id)}"} for o in orders],
        "bookings": [{"id": str(b.id), "service": b.service.name, "date": str(b.booking_date), "time": str(b.start_time)[:5], "status": b.status, "deposit_cents": b.deposit_cents, "url": f"/book/confirmation?id={b.id}&token={customer_token('booking', b.id)}"} for b in bookings],
    }
