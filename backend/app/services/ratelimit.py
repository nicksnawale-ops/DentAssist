"""Small in-memory rate limiter for public (no-login) endpoints.

Fine for a single API process. Behind several workers or servers, put the
same limits on the reverse proxy (e.g. nginx limit_req) as well.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request

from app.core.errors import AppError

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check(request: Request, bucket: str, limit: int, per_seconds: int) -> None:
    key = f"{bucket}:{client_ip(request)}"
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= limit:
            raise AppError(429, "Too many requests. Please wait a little and try again.", "RATE_LIMITED")
        q.append(now)


def reset() -> None:
    """For tests."""
    with _lock:
        _hits.clear()
