import hashlib
import hmac
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from .config import settings
from .db import get_session
from .models import User

bearer = HTTPBearer(auto_error=False)

# scrypt: memory-hard, stdlib. N=2^15 (32 MiB), r=8, p=1 is OWASP's recommended minimum.
_N, _R, _P = 2**15, 8, 1
# Hashing is the most expensive thing the API does. Cap concurrent hashes so a login
# burst cannot allocate 40 threads x 32 MiB; waiters queue instead of exhausting RAM.
_hash_slots = threading.BoundedSemaphore(4)
_HASH_WAIT_S = 2.0   # a queued login holds a pool thread: wait briefly, then shed load (503)


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    if not _hash_slots.acquire(timeout=_HASH_WAIT_S):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "busy", headers={"Retry-After": "2"})
    try:
        return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p,
                              maxmem=128 * 1024 * 1024, dklen=32)
    finally:
        _hash_slots.release()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${_scrypt(password, salt, _N, _R, _P).hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        if parts[0] == "scrypt":
            _, n, r, p, salt_hex, digest_hex = parts
            digest = _scrypt(password, bytes.fromhex(salt_hex), int(n), int(r), int(p))
        else:  # legacy pbkdf2 "salt$digest" created before the audit
            salt_hex, digest_hex = parts
            digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def needs_rehash(stored: str) -> bool:
    return not stored.startswith(f"scrypt${_N}${_R}${_P}$")


_dummy: Optional[str] = None


def dummy_verify(password: str) -> None:
    """Burn the same CPU as a real check so unknown emails are not distinguishable by timing."""
    global _dummy
    if _dummy is None:
        _dummy = hash_password("dummy-password-for-timing")
    verify_password(password, _dummy)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(user: User) -> str:
    payload = {
        "iss": settings.jwt_issuer,
        "typ": "access",
        "sub": str(user.id),
        "role": user.role,
        "iat": _now(),
        "exp": _now() + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ── Signed price quotes ─────────────────────────────────────────────────────
# A quote is NOT stored. The server signs the computed price and returns it; the row is
# only written when the customer orders. Anonymous traffic therefore cannot grow the DB,
# and a client cannot alter the price. A separate derived key keeps quote tokens from
# ever being accepted as login tokens (and vice versa).
def _quote_key() -> str:
    return hashlib.sha256(b"quote-v1:" + settings.jwt_secret.encode()).hexdigest()


def sign_quote(data: dict) -> str:
    claims = {**data, "iss": settings.jwt_issuer, "typ": "quote", "iat": _now(),
              "exp": _now() + timedelta(minutes=settings.quote_ttl_minutes)}
    return jwt.encode(claims, _quote_key(), algorithm="HS256")


def read_quote(token: str) -> dict:
    """Return the signed quote claims or raise HTTP 400 invalid_quote."""
    try:
        claims = jwt.decode(token, _quote_key(), algorithms=["HS256"], issuer=settings.jwt_issuer,
                            options={"require": ["exp", "iss", "typ"]})
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_quote")
    if claims.get("typ") != "quote":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_quote")
    return claims


def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not_authenticated")
    try:
        payload = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer, options={"require": ["exp", "sub", "iss", "typ"]},
        )
        if payload["typ"] != "access":
            raise jwt.InvalidTokenError("wrong token type")
        uid = int(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
    user = session.get(User, uid)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_token")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    # Role comes from the database row, never from the token, so demotion is immediate.
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return user
