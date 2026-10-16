"""Tiny in-process sliding-window limiter (O(1) per hit, bounded memory).

ponytail: per-process counters. With several workers/replicas the effective limit is
N x limit; move to nginx limit_req or Redis when you scale out.
"""
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

from .config import settings

_lock = threading.Lock()
_buckets: dict[str, deque] = {}
_MAX_KEYS = 20_000


def _prune(dq: deque, now: float, window: float) -> None:
    while dq and now - dq[0] > window:
        dq.popleft()


def hit(key: str, limit: int, window: float) -> bool:
    """Record an attempt; False when the caller is over the limit."""
    now = time.monotonic()
    with _lock:
        dq = _buckets.setdefault(key, deque())
        _prune(dq, now, window)
        if len(dq) >= limit:
            return False
        dq.append(now)
        if len(_buckets) > _MAX_KEYS:  # attacker rotating keys cannot grow memory forever
            for k in [k for k, v in _buckets.items() if not v or now - v[-1] > window]:
                _buckets.pop(k, None)
        return True


def over(key: str, limit: int, window: float) -> bool:
    """Read-only check (does not record)."""
    now = time.monotonic()
    with _lock:
        dq = _buckets.get(key)
        if not dq:
            return False
        _prune(dq, now, window)
        return len(dq) >= limit


def forget(key: str) -> None:
    with _lock:
        _buckets.pop(key, None)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def too_many(retry_after: int) -> HTTPException:
    return HTTPException(429, "too_many_requests", headers={"Retry-After": str(retry_after)})


def auth_limit(request: Request) -> None:
    """Dependency for /login and /register: one shared per-IP bucket."""
    if not hit(f"auth:{client_ip(request)}", settings.login_rate_limit, settings.login_rate_window_s):
        raise too_many(settings.login_rate_window_s)
