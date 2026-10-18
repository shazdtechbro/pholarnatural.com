import time
import threading
from collections import defaultdict, deque
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityMiddleware(BaseHTTPMiddleware):
    """Per-process abuse limits; use a shared edge limiter for multi-instance deployments."""

    _events = defaultdict(deque)
    _lock = threading.Lock()

    async def dispatch(self, request, call_next):
        path = request.url.path
        limit = (
            600
            if "/webhooks/" in path
            else 10
            if path.endswith(("/login", "/register"))
            else 15
            if path.startswith("/api/v1/contact")
            else 60
            if request.method not in ("GET", "HEAD", "OPTIONS")
            else 3000
        )
        group = (
            "webhooks"
            if "/webhooks/" in path
            else "auth"
            if path.endswith(("/login", "/register"))
            else "contact"
            if path.startswith("/api/v1/contact")
            else request.method
        )
        # Signature-authenticated webhooks get a separate, higher retry-burst limit.
        key = (request.client.host if request.client else "unknown", group)
        now = time.monotonic()
        with self._lock:
            for stale in list(self._events):
                if not self._events[stale] or self._events[stale][-1] < now - 60:
                    del self._events[stale]
            events = self._events[key]
            while events and events[0] < now - 60:
                events.popleft()
            if len(events) >= limit:
                return JSONResponse(
                    {"detail": "Too many requests. Try again shortly."},
                    429,
                    headers={"Retry-After": "60"},
                )
            if len(self._events) > 10000:
                return JSONResponse({"detail": "Server busy."}, 503)
            events.append(now)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            size = 0
            chunks = []
            async for chunk in request.stream():
                size += len(chunk)
                if size > 6_000_000:
                    return JSONResponse({"detail": "Request body too large."}, 413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response
