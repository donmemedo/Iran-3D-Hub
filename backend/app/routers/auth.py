from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from ..db import get_session
from ..models import User
from ..security import create_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    phone: str | None = None
    company: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _public(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name,
            "company": u.company, "phone": u.phone, "role": u.role}


@router.post("/register")
def register(body: RegisterIn, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(409, "email_already_registered")
    user = User(email=body.email, full_name=body.full_name, phone=body.phone,
                company=body.company, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"token": create_token(user), "user": _public(user)}


@router.post("/login")
def login(body: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "invalid_credentials")
    return {"token": create_token(user), "user": _public(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return _public(user)
