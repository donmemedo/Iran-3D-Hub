import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from .. import ratelimit
from ..config import settings
from ..db import get_session
from ..models import User
from ..schemas import LoginIn, RegisterIn
from ..security import (create_token, current_user, dummy_verify, hash_password, needs_rehash,
                        verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
audit = logging.getLogger("app.audit")


def _public(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name,
            "company": u.company, "phone": u.phone, "role": u.role}


@router.post("/register", dependencies=[Depends(ratelimit.auth_limit)])
def register(body: RegisterIn, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(409, "email_already_registered")
    user = User(email=body.email, full_name=body.full_name, phone=body.phone,
                company=body.company, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    audit.info("register user=%s", user.id)
    return {"token": create_token(user), "user": _public(user)}


@router.post("/login", dependencies=[Depends(ratelimit.auth_limit)])
def login(body: LoginIn, request: Request, session: Session = Depends(get_session)):
    # Per-account failure budget stops a distributed guesser even when every IP is fresh.
    # It counts failures only, so it cannot be used to lock a victim out by just hitting login.
    acct = f"fail:{body.email}"
    if ratelimit.over(acct, settings.login_rate_limit, 600):
        raise ratelimit.too_many(600)
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None:
        dummy_verify(body.password)
        ok = False
    else:
        ok = verify_password(body.password, user.password_hash)
    if not ok:
        ratelimit.hit(acct, settings.login_rate_limit, 600)
        audit.warning("login_failed ip=%s", ratelimit.client_ip(request))
        raise HTTPException(401, "invalid_credentials")
    ratelimit.forget(acct)
    if needs_rehash(user.password_hash):  # silently upgrade legacy hashes on successful login
        user.password_hash = hash_password(body.password)
        session.add(user)
        session.commit()
    return {"token": create_token(user), "user": _public(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _public(user)
