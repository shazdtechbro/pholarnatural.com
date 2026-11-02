from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel, EmailStr, StrictBool
from uuid import UUID

from app.schemas.admin import AdminCreate, AdminResponse
from app.schemas.system import DashboardStats
from app.api.dependencies import get_db, get_current_admin
from app.core import security
from app.core.config import settings
from app.models.admin import AdminUser
from app.services import system_service

router = APIRouter()


class Token(BaseModel):
    access_token: str
    token_type: str


@router.post("/login", response_model=Token)
def login_for_access_token(
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),  # FastAPI's built-in form handler
):
    """Admin Login. Expects form-data with 'username' (email) and 'password'."""

    # 1. Find the user by email (form_data.username is used for email here)
    from sqlalchemy import func

    admin = (
        db.query(AdminUser)
        .filter(func.lower(AdminUser.email) == form_data.username.strip().lower())
        .first()
    )

    # 2. Verify password
    if (
        not admin
        or not admin.is_active
        or not security.verify_password(form_data.password, admin.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Create the JWT
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": admin.email, "ver": admin.token_version},
        expires_delta=access_token_expires,
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(
    db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)
):
    """Invalidate all existing admin sessions, including copied tokens."""
    from sqlalchemy import update

    db.execute(
        update(AdminUser)
        .where(AdminUser.id == current_admin.id)
        .values(token_version=AdminUser.token_version + 1)
    )
    db.commit()
    return {"message": "Logged out"}


@router.get("/me")
def get_admin_profile(current_admin: AdminUser = Depends(get_current_admin)):
    """A protected test route to verify the token works."""
    return {"email": current_admin.email, "is_active": current_admin.is_active}


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    """Dashboard stats: orders/revenue/bookings today, recent orders, upcoming bookings."""
    return system_service.get_dashboard_stats(db)


@router.post(
    "/register", response_model=AdminResponse, status_code=status.HTTP_201_CREATED
)
def register_admin(admin_in: AdminCreate, db: Session = Depends(get_db)):
    """Create a new admin user using a secret key."""
    # 1. Verify the secret key
    import secrets
    from app.core.transactions import transaction_lock

    transaction_lock(db, 901)
    import hashlib
    from datetime import datetime, timezone
    from app.models.admin import AdminInvitation
    invitation = db.query(AdminInvitation).filter_by(token_hash=hashlib.sha256(admin_in.secret_key.encode()).hexdigest(), purpose="invite").with_for_update().first()
    if invitation:
        if invitation.used or invitation.email.lower() != str(admin_in.email).lower() or invitation.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
            raise HTTPException(403, "Invitation is invalid or expired.")
        invitation.used = True
    else:
        if not settings.ADMIN_REGISTRATION_KEY or not secrets.compare_digest(admin_in.secret_key, settings.ADMIN_REGISTRATION_KEY):
            raise HTTPException(403, "Invitation is invalid or expired.")
        if db.query(AdminUser).first():
            raise HTTPException(409, "Ask an existing administrator to invite you from Settings.")

    # 2. Check if email already exists
    existing_admin = (
        db.query(AdminUser).filter(AdminUser.email == admin_in.email).first()
    )
    if existing_admin:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # 3. Hash password and save
    hashed_password = security.get_password_hash(admin_in.password)
    new_admin = AdminUser(
        email=str(admin_in.email).lower(), hashed_password=hashed_password
    )

    db.add(new_admin)
    db.flush()
    from app.services.email import queue_email, message

    queue_email(
        db,
        f"admin:{new_admin.id}:created",
        new_admin.email,
        *message(
            "Administrator account created",
            [
                "Your Pholar Natural administrator account is ready. Keep your login credentials private."
            ],
        ),
    )
    db.commit()
    db.refresh(new_admin)
    return new_admin


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/password")
def change_password(
    body: PasswordChange,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    from app.schemas.admin import AdminCreate
    from pydantic import ValidationError

    if not security.verify_password(
        body.current_password, current_admin.hashed_password
    ):
        raise HTTPException(403, "Current password is incorrect.")
    try:
        AdminCreate(
            email=current_admin.email,
            password=body.new_password,
            secret_key="validation-only",
        )
    except ValidationError:
        raise HTTPException(
            422, "Use at least 12 characters and at most 72 UTF-8 bytes."
        )
    from sqlalchemy import update

    db.execute(
        update(AdminUser)
        .where(AdminUser.id == current_admin.id)
        .values(
            hashed_password=security.get_password_hash(body.new_password),
            token_version=AdminUser.token_version + 1,
        )
    )
    from app.services.email import queue_email, message

    queue_email(
        db,
        f"admin:{current_admin.id}:password:{current_admin.token_version}",
        current_admin.email,
        *message(
            "Administrator password changed",
            [
                "Your password has changed and previous admin sessions have been signed out. If you did not request this change, contact the site administrator immediately."
            ],
        ),
    )
    db.commit()
    return {"ok": True}


class InvitationCreate(BaseModel):
    email: EmailStr
    current_password: str


@router.get("/team")
def team(db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    return [{"id": str(a.id), "email": a.email, "is_active": a.is_active} for a in db.query(AdminUser).order_by(AdminUser.created_at).all()]


@router.post("/invitations", status_code=202)
def invite_admin(body: InvitationCreate, db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    import hashlib, secrets
    from datetime import datetime, timezone
    from urllib.parse import urlencode
    from sqlalchemy import func
    from app.models.admin import AdminInvitation
    from app.services.email import queue_email, message, e
    from app.core.transactions import transaction_lock
    if not security.verify_password(body.current_password, current_admin.hashed_password):
        raise HTTPException(403, "Current password is incorrect.")
    transaction_lock(db, 901)
    address = str(body.email).lower()
    if db.query(AdminUser).filter(func.lower(AdminUser.email) == address).first():
        raise HTTPException(409, "An administrator with this email already exists.")
    db.query(AdminInvitation).filter_by(email=address, used=False).update({"used": True})
    token = secrets.token_urlsafe(32)
    invitation = AdminInvitation(email=address, token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=datetime.now(timezone.utc)+timedelta(hours=48))
    db.add(invitation); db.flush()
    url = settings.DOMAIN+"/admin/register#"+urlencode({"invite": token, "email": address})
    title, html = message("Your Pholar Natural admin invitation", ["An administrator invited you to manage Pholar Natural. This grants full dashboard access. Choose your own password using the invitation link. The link expires in 48 hours and works once. If this was unexpected, ignore it."])
    queue_email(db, "admin-invite:"+str(invitation.id), address, title, html.replace("</body>", '<p><a href="'+e(url)+'">Create my administrator account</a></p></body>'))
    db.commit()
    return {"queued": True, "expires_in_hours": 48}


class AdminAccess(BaseModel):
    is_active: StrictBool
    current_password: str


@router.post("/team/{admin_id}/access")
def admin_access(admin_id: UUID, body: AdminAccess, db: Session = Depends(get_db), current_admin: AdminUser = Depends(get_current_admin)):
    from app.core.transactions import transaction_lock
    if not security.verify_password(body.current_password, current_admin.hashed_password):
        raise HTTPException(403, "Current password is incorrect.")
    transaction_lock(db, 901)
    target = db.query(AdminUser).filter_by(id=admin_id).with_for_update().first()
    if not target:
        raise HTTPException(404, "Administrator not found.")
    if not body.is_active and target.is_active and db.query(AdminUser).filter_by(is_active=True).count() <= 1:
        raise HTTPException(409, "Keep at least one active administrator.")
    target.is_active = body.is_active
    target.token_version += 1
    db.commit()
    return {"ok": True}


class AdminRecoveryRequest(BaseModel):
    email: EmailStr


class AdminRecoveryComplete(BaseModel):
    token: str
    password: str


@router.post("/forgot-password", status_code=202)
def admin_forgot_password(body: AdminRecoveryRequest, db: Session = Depends(get_db)):
    import hashlib, secrets
    from datetime import datetime, timezone
    from urllib.parse import urlencode
    from app.models.admin import AdminInvitation
    from app.services.email import queue_email, message, e
    from app.core.transactions import transaction_lock
    transaction_lock(db, 901)
    admin = db.query(AdminUser).filter_by(email=str(body.email).lower(), is_active=True).first()
    if admin:
        db.query(AdminInvitation).filter_by(email=admin.email, purpose="password_reset", used=False).update({"used": True})
        token = secrets.token_urlsafe(32)
        action = AdminInvitation(email=admin.email, purpose="password_reset", token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=datetime.now(timezone.utc)+timedelta(minutes=30))
        db.add(action); db.flush()
        url = settings.DOMAIN+"/admin/reset-password#"+urlencode({"token": token})
        title, html = message("Reset your Pholar Natural admin password", ["Use this single-use link within 30 minutes to choose a new password. If you did not request a reset, ignore this email. No password has changed."])
        queue_email(db, "admin-reset:"+str(action.id), admin.email, title, html.replace("</body>", '<p><a href="'+e(url)+'">Reset my password</a></p></body>'))
        db.commit()
    return {"message": "If this is an active admin account, a password reset email will arrive shortly."}


@router.post("/reset-password")
def admin_reset_password(body: AdminRecoveryComplete, db: Session = Depends(get_db)):
    import hashlib
    from datetime import datetime, timezone
    from pydantic import ValidationError
    from app.models.admin import AdminInvitation
    from app.core.transactions import transaction_lock
    from app.services.email import queue_email, message
    transaction_lock(db, 901)
    action = db.query(AdminInvitation).filter_by(token_hash=hashlib.sha256(body.token.encode()).hexdigest(), purpose="password_reset").with_for_update().first()
    if not action or action.used or action.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(400, "Reset link is invalid or expired. Request a new link.")
    admin = db.query(AdminUser).filter_by(email=action.email, is_active=True).with_for_update().first()
    if not admin:
        raise HTTPException(400, "Reset link is invalid or expired. Request a new link.")
    try:
        AdminCreate(email=admin.email, password=body.password, secret_key="validation-only")
    except ValidationError:
        raise HTTPException(422, "Use at least 12 characters and at most 72 UTF-8 bytes.")
    admin.hashed_password = security.get_password_hash(body.password)
    admin.token_version += 1
    action.used = True
    queue_email(db, "admin-reset-done:"+str(action.id), admin.email, *message("Administrator password changed", ["Your administrator password changed. All previous sessions have been signed out. If this was not you, contact another administrator immediately."]))
    db.commit()
    return {"ok": True}
