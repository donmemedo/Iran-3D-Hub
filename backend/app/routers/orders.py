import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .. import ratelimit
from ..config import settings
from ..db import get_session
from ..models import Hub, Material, Order, Quote, Review, User, utcnow
from ..schemas import OrderIn, ReviewIn
from ..security import current_user, read_quote, require_admin
from .quotes import hub_can_make

router = APIRouter(prefix="/api/orders", tags=["orders"])
audit = logging.getLogger("app.audit")

FLOW = ["pending_payment", "in_production", "quality_check", "shipped", "delivered"]
_QUOTE_FIELDS = ("filename", "volume_cm3", "bbox_x", "bbox_y", "bbox_z", "triangles", "material_slug",
                 "technology", "quality", "infill", "quantity", "city", "unit_price", "total_price",
                 "lead_time_days", "print_hours", "warnings")


@router.post("")
def create_order(body: OrderIn, session: Session = Depends(get_session),
                 user: User = Depends(current_user)):
    if not ratelimit.hit(f"order:{user.id}", settings.orders_per_hour, 3600):
        raise ratelimit.too_many(3600)
    claims = read_quote(body.quote_public_id)  # signature + expiry: the client cannot change the price

    hub = None
    if body.hub_id is not None:
        hub = session.get(Hub, body.hub_id)
        if not hub:
            raise HTTPException(404, "hub_not_found")
        mat = session.exec(select(Material).where(Material.slug == claims["material_slug"])).first()
        bbox = [claims["bbox_x"], claims["bbox_y"], claims["bbox_z"]]
        if not mat or not hub_can_make(hub, mat, bbox):
            raise HTTPException(422, "hub_cannot_produce")

    quote = Quote(public_id=f"Q-{secrets.token_hex(8).upper()}", user_id=user.id,
                  **{k: claims[k] for k in _QUOTE_FIELDS})
    session.add(quote)
    session.flush()
    total = quote.total_price
    commission = int(total * settings.platform_commission / (1 + settings.platform_commission))
    order = Order(public_id=f"H3D-{secrets.token_hex(8).upper()}", user_id=user.id, quote_id=quote.id,
                  hub_id=hub.id if hub else None, address=body.address, note=body.note,
                  amount=total, commission=commission)
    session.add(order)
    session.commit()
    session.refresh(order)
    audit.info("order_created order=%s user=%s amount=%s", order.public_id, user.id, total)
    return order


def _decorate(order: Order, quote: Quote | None, hub: Hub | None) -> dict:
    return {"order": order.model_dump(),
            "quote": quote.model_dump(exclude={"user_id"}) if quote else None,
            "hub": hub.model_dump() if hub else None,
            "step": FLOW.index(order.status) if order.status in FLOW else -1,
            "flow": FLOW}


def _load(session: Session, order: Order) -> dict:
    return _decorate(order, session.get(Quote, order.quote_id),
                     session.get(Hub, order.hub_id) if order.hub_id else None)


@router.get("")
def my_orders(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
              session: Session = Depends(get_session), user: User = Depends(current_user)):
    # One JOIN instead of two extra queries per order (was N+1).
    rows = session.exec(
        select(Order, Quote, Hub)
        .join(Quote, Quote.id == Order.quote_id)
        .join(Hub, Hub.id == Order.hub_id, isouter=True)
        .where(Order.user_id == user.id)
        .order_by(Order.id.desc()).offset(offset).limit(limit)).all()
    return [_decorate(o, q, h) for o, q, h in rows]


def _own_order(session: Session, public_id: str, user: User) -> Order:
    order = session.exec(select(Order).where(Order.public_id == public_id)).first()
    if not order or order.user_id != user.id:
        raise HTTPException(404, "order_not_found")
    return order


@router.get("/{public_id}")
def order_detail(public_id: str, session: Session = Depends(get_session),
                 user: User = Depends(current_user)):
    return _load(session, _own_order(session, public_id, user))


def _transition(session: Session, order: Order, new_status: str) -> None:
    """Compare-and-set on status: two concurrent clicks cannot double-advance or
    cancel an order that just shipped."""
    res = session.execute(update(Order).where(Order.id == order.id, Order.status == order.status)
                          .values(status=new_status, updated_at=utcnow()))
    if res.rowcount != 1:
        session.rollback()
        raise HTTPException(409, "order_changed")
    session.commit()
    session.refresh(order)


@router.post("/{public_id}/advance")
def advance(public_id: str, session: Session = Depends(get_session),
            admin: User = Depends(require_admin)):
    """Back-office step (there is no payment gateway or hub console yet): admin only."""
    order = session.exec(select(Order).where(Order.public_id == public_id)).first()
    if not order:
        raise HTTPException(404, "order_not_found")
    if order.status in FLOW and order.status != FLOW[-1]:
        _transition(session, order, FLOW[FLOW.index(order.status) + 1])
        audit.info("order_advanced order=%s admin=%s status=%s", order.public_id, admin.id, order.status)
    return _load(session, order)


@router.post("/{public_id}/cancel")
def cancel(public_id: str, session: Session = Depends(get_session),
           user: User = Depends(current_user)):
    order = _own_order(session, public_id, user)
    if order.status in ("shipped", "delivered"):
        raise HTTPException(400, "too_late_to_cancel")
    if order.status != "canceled":
        _transition(session, order, "canceled")
        audit.info("order_canceled order=%s user=%s", order.public_id, user.id)
    return _load(session, order)


@router.post("/reviews")
def add_review(body: ReviewIn, session: Session = Depends(get_session),
               user: User = Depends(current_user)):
    """Only the customer of a delivered order may review its hub, once per order."""
    order = session.exec(select(Order).where(Order.public_id == body.order_public_id)).first()
    if not order or order.user_id != user.id or order.status != "delivered":
        raise HTTPException(403, "review_not_allowed")
    if order.hub_id is None:
        raise HTTPException(400, "order_has_no_hub")
    review = Review(hub_id=order.hub_id, user_id=user.id, order_id=order.id,
                    author=user.full_name or user.email.split("@")[0],  # never publish the full email
                    rating=body.rating, body=body.body)
    session.add(review)
    try:
        session.flush()
    except IntegrityError:  # unique(order_id): a concurrent duplicate lost the race
        session.rollback()
        raise HTTPException(409, "already_reviewed")
    # Atomic running average: one UPDATE, no read-modify-write race between reviewers.
    session.execute(update(Hub).where(Hub.id == order.hub_id).values(
        rating=func.round(((Hub.rating * Hub.reviews_count) + body.rating) / (Hub.reviews_count + 1), 2),
        reviews_count=Hub.reviews_count + 1))
    session.commit()
    session.refresh(review)
    return review.model_dump(exclude={"user_id", "order_id"})
