import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..models import Hub, Order, Quote, Review, User
from ..security import current_user

router = APIRouter(prefix="/api/orders", tags=["orders"])

FLOW = ["pending_payment", "in_production", "quality_check", "shipped", "delivered"]


class OrderIn(BaseModel):
    quote_public_id: str
    hub_id: int | None = None
    address: str = ""
    note: str = ""


@router.post("")
def create_order(body: OrderIn, session: Session = Depends(get_session),
                 user: User = Depends(current_user)):
    quote = session.exec(select(Quote).where(Quote.public_id == body.quote_public_id)).first()
    if not quote:
        raise HTTPException(404, "quote_not_found")
    commission = int(quote.total_price * settings.platform_commission /
                     (1 + settings.platform_commission))
    order = Order(public_id=f"H3D-{uuid.uuid4().hex[:6].upper()}", user_id=user.id,
                  quote_id=quote.id, hub_id=body.hub_id, address=body.address,
                  note=body.note, amount=quote.total_price, commission=commission)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def _decorate(session: Session, order: Order) -> dict:
    quote = session.get(Quote, order.quote_id)
    hub = session.get(Hub, order.hub_id) if order.hub_id else None
    return {"order": order.model_dump(),
            "quote": quote.model_dump() if quote else None,
            "hub": hub.model_dump() if hub else None,
            "step": FLOW.index(order.status) if order.status in FLOW else -1,
            "flow": FLOW}


@router.get("")
def my_orders(session: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = session.exec(
        select(Order).where(Order.user_id == user.id).order_by(Order.id.desc())).all()
    return [_decorate(session, o) for o in rows]


@router.get("/{public_id}")
def order_detail(public_id: str, session: Session = Depends(get_session),
                 user: User = Depends(current_user)):
    order = session.exec(select(Order).where(Order.public_id == public_id)).first()
    if not order or order.user_id != user.id:
        raise HTTPException(404, "order_not_found")
    return _decorate(session, order)


@router.post("/{public_id}/advance")
def advance(public_id: str, session: Session = Depends(get_session),
            user: User = Depends(current_user)):
    """Demo helper: walks an order one step along the production flow."""
    order = session.exec(select(Order).where(Order.public_id == public_id)).first()
    if not order or order.user_id != user.id:
        raise HTTPException(404, "order_not_found")
    if order.status in FLOW and order.status != FLOW[-1]:
        order.status = FLOW[FLOW.index(order.status) + 1]
        order.updated_at = datetime.utcnow()
        session.add(order)
        session.commit()
        session.refresh(order)
    return _decorate(session, order)


@router.post("/{public_id}/cancel")
def cancel(public_id: str, session: Session = Depends(get_session),
           user: User = Depends(current_user)):
    order = session.exec(select(Order).where(Order.public_id == public_id)).first()
    if not order or order.user_id != user.id:
        raise HTTPException(404, "order_not_found")
    if order.status in ("shipped", "delivered"):
        raise HTTPException(400, "too_late_to_cancel")
    order.status = "canceled"
    order.updated_at = datetime.utcnow()
    session.add(order)
    session.commit()
    session.refresh(order)
    return _decorate(session, order)


class ReviewIn(BaseModel):
    hub_id: int
    rating: int = 5
    body: str = ""


@router.post("/reviews")
def add_review(body: ReviewIn, session: Session = Depends(get_session),
               user: User = Depends(current_user)):
    hub = session.get(Hub, body.hub_id)
    if not hub:
        raise HTTPException(404, "hub_not_found")
    review = Review(hub_id=body.hub_id, user_id=user.id,
                    author=user.full_name or user.email,
                    rating=max(1, min(5, body.rating)), body=body.body)
    hub.rating = round((hub.rating * hub.reviews_count + review.rating) /
                       (hub.reviews_count + 1), 2)
    hub.reviews_count += 1
    session.add(review)
    session.add(hub)
    session.commit()
    session.refresh(review)
    return review
