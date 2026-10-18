from typing import Optional, Literal
from pydantic import model_validator, Field
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Pholar Naturals API"
    DATABASE_URL: str

    # Stripe Settings
    STRIPE_SECRET_KEY: str
    STRIPE_PUBLISHABLE_KEY: str
    STRIPE_WEBHOOK_SECRET: str
    DOMAIN: str = "http://localhost:3000"
    BUSINESS_TIMEZONE: str = "America/Toronto"
    CORS_ORIGINS: str = ""
    EMAIL_WORKER_ENABLED: bool = True

    # JWT Settings
    SECRET_KEY: str
    ALGORITHM: Literal["HS256"] = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, ge=5, le=1440)
    ADMIN_REGISTRATION_KEY: str

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # Resend
    RESEND_API_KEY: Optional[str] = None
    DEFAULT_FROM_EMAIL: str = "onboarding@resend.dev"
    ADMIN_EMAIL: Optional[str] = None

    # Evolution API (WhatsApp notifications via instance "pholar-notifier")
    EVOLUTION_API_KEY: Optional[str] = None
    EVOLUTION_API_URL: str = "http://evolution-api:8080"

    @model_validator(mode="after")
    def validate_security(self):
        if len(self.SECRET_KEY.encode()) < 32:
            raise ValueError(
                "SECRET_KEY must contain at least 32 bytes of random data."
            )
        parsed = urlparse(self.DOMAIN)
        if (
            not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
            or (
                parsed.scheme not in ("http", "https")
                or (
                    parsed.scheme != "https"
                    and parsed.hostname
                    not in (
                        "localhost",
                        "127.0.0.1",
                    )
                )
            )
        ):
            raise ValueError("DOMAIN must use HTTPS outside local development.")
        for origin in self.CORS_ORIGINS.split(","):
            if not origin.strip():
                continue
            target = urlparse(origin.strip())
            if (
                not target.hostname
                or target.username
                or target.password
                or target.query
                or target.fragment
                or target.path not in ("", "/")
                or (
                    target.scheme not in ("http", "https")
                    or (
                        target.scheme != "https"
                        and target.hostname not in ("localhost", "127.0.0.1")
                    )
                )
            ):
                raise ValueError(
                    "CORS_ORIGINS must contain exact HTTPS origins (or loopback development origins)."
                )
        ZoneInfo(self.BUSINESS_TIMEZONE)
        return self

    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", hide_input_in_errors=True
    )


settings = Settings()
