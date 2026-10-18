from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import InvalidTokenError as JWTError
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.services.payment_gateway import PaymentGateway
from app.services.notification_service import (
    NotificationService,
    PlatformNotificationService,
)
from app.services.storage_service import CloudinaryStorageService, StorageService
from app.services.stripe_gateway import StripeGateway
from app.core.config import settings
from app.models.admin import AdminUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/login")


def get_db() -> Generator:
    """
    Dependency function that yields a database session and ensures it is closed
    after the request is complete.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_payment_gateway() -> PaymentGateway:
    """
    Dependency that returns the configured payment gateway.
    During testing, we can easily override this to return a MockPaymentGateway.
    """
    return StripeGateway()


def get_storage_service() -> StorageService:
    return CloudinaryStorageService()


def get_notification_service() -> NotificationService:
    return PlatformNotificationService()


def get_current_admin(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> AdminUser:
    """
    Dependency to get the current authenticated admin user.
    If the token is invalid, expired, or the user doesn't exist, it throws a 401.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 1. Decode the JWT token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "scope"]},
        )
        if payload.get("scope") != "admin":
            raise credentials_exception
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # 2. Fetch the user from the DB
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if (
        admin is None
        or not admin.is_active
        or payload.get("ver", 0) != admin.token_version
    ):
        raise credentials_exception

    return admin
