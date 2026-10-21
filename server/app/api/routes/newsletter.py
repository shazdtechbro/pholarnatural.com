import hashlib
import hmac
import uuid
from datetime import timedelta, timezone
from html import escape
from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
import jwt
from jwt import InvalidTokenError as JWTError
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.api.dependencies import get_db, get_current_admin
from app.core.config import settings
from app.models.subscriber import Subscriber
from app.services.email import queue_email
from app.services.newsletter_mail import _base
def send_email(to, subject, html, *, db, event_key):
    return queue_email(db, event_key, to, subject, html)
from app.services.mail_delivery import utcnow

router = APIRouter()
BASE = "https://api.pholarnatural.com/api/v1/newsletter"
MESSAGE = "Check your email to confirm your subscription. If you already subscribed, you are all set."

class Signup(BaseModel):
    email: EmailStr

def token_for(sub, purpose, days=2):
    return jwt.encode({"sub": sub.email, "nonce": sub.nonce, "purpose": purpose,
                       "exp": utcnow()+timedelta(days=days)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def resolve(db, token, purpose):
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        sub = db.query(Subscriber).filter_by(email=data["sub"]).with_for_update().first()
        if data.get("purpose") != purpose or not sub or data.get("nonce") != sub.nonce:
            raise ValueError()
        return sub
    except (JWTError, ValueError, KeyError):
        raise HTTPException(400, "This link is invalid or expired. Please sign up again.")

@router.post("/subscribe", status_code=202)
def subscribe(body: Signup, request: Request, db: Session = Depends(get_db)):
    now = utcnow()
    address = str(body.email).lower()
    sub = db.query(Subscriber).filter_by(email=address).with_for_update().first()
    if sub and (sub.status == "subscribed" or now-sub.requested_at.replace(tzinfo=timezone.utc) < timedelta(minutes=15)):
        return {"message": MESSAGE}
    ip = request.headers.get("x-real-ip") or request.client.host
    source = hmac.new(settings.SECRET_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()
    count = db.query(Subscriber).filter(Subscriber.source_hash == source, Subscriber.requested_at > now-timedelta(hours=1)).count()
    if count >= 10:
        raise HTTPException(429, "Too many signup requests. Please try later.")
    if not sub:
        sub = Subscriber(email=address, source_hash=source)
        db.add(sub)
    sub.nonce = str(uuid.uuid4())
    sub.status = "pending"
    sub.source_hash = source
    sub.requested_at = now
    try:
        db.flush()
        link = BASE+"/confirm?token="+token_for(sub, "confirm")
        html = _base("Confirm your newsletter subscription", f'<h1>Join the Natural Ritual</h1><p>Please confirm you would like to receive Pholar Natural product news and hair wellness updates.</p><p><a href="{escape(link, quote=True)}">Confirm subscription</a></p><p>This link expires in 48 hours. If you did not request this, ignore this email; you will not be subscribed.</p>')
        send_email(sub.email, "Confirm your Pholar Natural newsletter subscription", html, db=db, event_key=f"newsletter/{sub.nonce}/confirm")
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"message": MESSAGE}

def landing(token, action, label):
    # A scanner visiting a link cannot opt someone in or out; require a button.
    return HTMLResponse(_base(label, f'<h1>{label}</h1><form method="post" action="{BASE}/{action}"><input type="hidden" name="token" value="{escape(token, quote=True)}"><button type="submit">{label}</button></form>'), headers={"Referrer-Policy": "no-referrer", "Cache-Control": "no-store"})

@router.get("/confirm")
def confirm_page(token: str):
    return landing(token, "confirm", "Confirm newsletter subscription")

@router.post("/confirm", response_class=HTMLResponse)
def confirm(token: str = Form(...), db: Session = Depends(get_db)):
    sub = resolve(db, token, "confirm")
    if sub.status != "subscribed":
        sub.status = "subscribed"
        sub.confirmed_at = utcnow()
        link = BASE+"/unsubscribe?token="+token_for(sub, "unsubscribe", days=3650)
        html = _base("Welcome to the Natural Ritual", f'<h1>You are subscribed</h1><p>Welcome to Pholar Natural. You will receive our product news and hair wellness updates.</p><p><a href="{escape(link, quote=True)}">Unsubscribe</a> whenever you wish.</p>')
        send_email(sub.email, "Welcome to the Natural Ritual", html, db=db, event_key=f"newsletter/{sub.nonce}/welcome")
        db.commit()
    return _base("Subscription confirmed", '<h1>You are subscribed</h1><p>Welcome to the Natural Ritual.</p><a href="https://pholarnatural.com/shop">Visit the shop</a>')

@router.get("/unsubscribe")
def unsubscribe_page(token: str):
    return landing(token, "unsubscribe", "Unsubscribe from newsletter")

@router.post("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(token: str = Form(...), db: Session = Depends(get_db)):
    sub = resolve(db, token, "unsubscribe")
    sub.status = "unsubscribed"
    db.commit()
    return _base("Unsubscribed", '<h1>You are unsubscribed</h1><p>You will no longer receive newsletter updates.</p>')

@router.get("/subscribers", dependencies=[Depends(get_current_admin)])
def subscribers(db: Session = Depends(get_db)):
    return [{"email": s.email, "status": s.status, "confirmed_at": s.confirmed_at} for s in db.query(Subscriber).order_by(Subscriber.created_at.desc()).all()]
