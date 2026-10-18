from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import bcrypt
import secrets
from fastapi import HTTPException
from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check if the provided password matches the hash."""
    try:
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    """Generate a bcrypt hash for a password."""
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password.encode("utf-8"), salt)

    # Decode back to a string so it can be saved in the database easily
    return hashed_bytes.decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate a JWT token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update(
        {"exp": expire, "scope": "admin", "jti": secrets.token_urlsafe(16)}
    )

    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def customer_token(kind, record_id):
    return jwt.encode(
        {
            "sub": str(record_id),
            "scope": kind,
            "exp": datetime.now(timezone.utc) + timedelta(days=120),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def verify_customer_token(token, kind, record_id):
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "scope"]},
        )
        if payload.get("scope") != kind or payload.get("sub") != str(record_id):
            raise ValueError()
    except Exception:
        raise HTTPException(
            status_code=403, detail="Invalid or expired confirmation link."
        )
