from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel

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
    if not settings.ADMIN_REGISTRATION_KEY or not secrets.compare_digest(
        admin_in.secret_key, settings.ADMIN_REGISTRATION_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin registration key.",
        )

    if db.query(AdminUser).first():
        raise HTTPException(status_code=409, detail="An administrator already exists.")

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
