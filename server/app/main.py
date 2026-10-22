from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import threading
from app.core.http_security import SecurityMiddleware
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import (
    admin_auth,
    orders,
    products,
    services,
    bookings,
    contact,
    discounts,
    admin_bookings,
    admin_orders,
    admin_products,
    admin_services,
    admin_discounts,
    admin_variants,
    stripe_webhook,
    admin_settings,
)


@asynccontextmanager
async def lifespan(app):
    from app.services.email import start_worker

    stop = threading.Event()
    worker = start_worker(stop) if settings.EMAIL_WORKER_ENABLED else None
    yield
    stop.set()
    if worker:
        worker.join(timeout=16)


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
app.add_middleware(SecurityMiddleware)

from sqlalchemy.exc import IntegrityError


@app.exception_handler(IntegrityError)
async def conflict_error(request: Request, exc: IntegrityError):
    return JSONResponse(
        {
            "detail": "The change conflicts with an existing record or a data constraint."
        },
        status_code=409,
    )


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    import logging

    logging.getLogger(__name__).error(
        "Request failed: %s %s (%s)",
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        {"detail": "An unexpected error occurred. Please retry or contact support."},
        status_code=500,
    )


# Browsers treat localhost and 127.0.0.1 as different origins. Permit the
# equivalent loopback origin for local development only; production stays explicit.
from urllib.parse import urlparse

_origins = [
    v.strip().rstrip("/")
    for v in (settings.CORS_ORIGINS or settings.DOMAIN).split(",")
    if v.strip()
]
_local = urlparse(settings.DOMAIN)
if not settings.CORS_ORIGINS and _local.hostname in ("localhost", "127.0.0.1"):
    for host in ("localhost", "127.0.0.1"):
        origin = f"{_local.scheme}://{host}" + (
            f":{_local.port}" if _local.port else ""
        )
        if origin not in _origins:
            _origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Confirmation-Token"],
)

# Include our routers
app.include_router(
    stripe_webhook.router, prefix="/api/v1/webhooks/payments", tags=["Webhooks"]
)
app.include_router(products.router, prefix="/api/v1/products", tags=["Products"])
app.include_router(services.router, prefix="/api/v1/services", tags=["Services"])
app.include_router(bookings.router, prefix="/api/v1/bookings", tags=["Bookings"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(contact.router, prefix="/api/v1/contact", tags=["Contact"])
app.include_router(discounts.router, prefix="/api/v1/discounts", tags=["Discounts"])
app.include_router(admin_auth.router, prefix="/api/v1/admin", tags=["Admin Auth"])
app.include_router(
    admin_products.router, prefix="/api/v1/admin/products", tags=["Admin Products"]
)
app.include_router(
    admin_orders.router, prefix="/api/v1/admin/orders", tags=["Admin Orders"]
)
app.include_router(
    admin_bookings.router, prefix="/api/v1/admin/bookings", tags=["Admin Bookings"]
)
app.include_router(
    admin_services.router, prefix="/api/v1/admin/services", tags=["Admin Services"]
)
app.include_router(
    admin_variants.router, prefix="/api/v1/admin/variants", tags=["Admin Variants"]
)
app.include_router(
    admin_discounts.router, prefix="/api/v1/admin/discounts", tags=["Admin Discounts"]
)
app.include_router(
    admin_settings.router, prefix="/api/v1/admin", tags=["Admin Settings"]
)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Pholar Natural API"}


@app.get("/health", include_in_schema=False)
def health():
    from app.db.database import SessionLocal
    from sqlalchemy import text

    with SessionLocal() as db:
        db.execute(text("SELECT 1 FROM admin_settings LIMIT 1"))
        db.execute(text("SELECT 1 FROM email_deliveries LIMIT 1"))
    return {"status": "ok"}

from app.api.routes import newsletter
app.include_router(newsletter.router, prefix="/api/v1/newsletter", tags=["Newsletter"])

from app.api.routes import customer
app.include_router(customer.router, prefix="/api/v1/account", tags=["Customer Accounts"])
