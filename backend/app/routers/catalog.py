import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import Hub, Material, Review
from ..pricing import CITY_LEAD, QUALITY, TECH

from .quotes import split_csv

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/materials")
def materials(technology: str | None = Query(None, max_length=8), session: Session = Depends(get_session)):
    q = select(Material)
    if technology:
        q = q.where(Material.technology == technology)
    return session.exec(q).all()


@router.get("/technologies")
def technologies():
    return [
        {"code": "FDM", "name_fa": "اف‌دی‌ام (رشته‌ای)", "name_en": "FDM (Filament)",
         "desc_fa": "اقتصادی‌ترین روش برای نمونه‌سازی و قطعات کاربردی.",
         "desc_en": "The most economical route for prototypes and functional parts.",
         "throughput": TECH["FDM"][0]},
        {"code": "SLA", "name_fa": "اس‌ال‌ای (رزینی)", "name_en": "SLA (Resin)",
         "desc_fa": "بالاترین جزئیات و سطح صاف برای قطعات ظریف.",
         "desc_en": "Highest detail and smoothest surface for fine parts.",
         "throughput": TECH["SLA"][0]},
        {"code": "SLS", "name_fa": "اس‌ال‌اس (پودری)", "name_en": "SLS (Powder)",
         "desc_fa": "بدون ساپورت و مناسب تولید کم‌تیراژ صنعتی.",
         "desc_en": "Support-free, built for low-volume industrial production.",
         "throughput": TECH["SLS"][0]},
    ]


@router.get("/qualities")
def qualities():
    return [{"code": k, "layer_mm": v[0]} for k, v in QUALITY.items()]


@router.get("/cities")
def cities():
    names = {"tehran": ("تهران", "Tehran"), "karaj": ("کرج", "Karaj"),
             "isfahan": ("اصفهان", "Isfahan"), "mashhad": ("مشهد", "Mashhad"),
             "shiraz": ("شیراز", "Shiraz"), "tabriz": ("تبریز", "Tabriz"),
             "other": ("سایر شهرها", "Other cities")}
    return [{"code": c, "name_fa": names[c][0], "name_en": names[c][1], "extra_days": d}
            for c, d in CITY_LEAD.items()]


@router.get("/hubs")
def hubs(city: str | None = Query(None, max_length=40), technology: str | None = Query(None, max_length=8),
         material: str | None = Query(None, max_length=32), q: str | None = Query(None, max_length=80),
         sort: str = Query("rating", max_length=12), limit: int = Query(100, ge=1, le=200),
         session: Session = Depends(get_session)):
    rows = session.exec(select(Hub)).all()
    if city:
        rows = [h for h in rows if h.city_en.lower() == city.lower()]
    if technology:  # whole-token match: "FD" must not match "FDM"
        rows = [h for h in rows if technology.lower() in split_csv(h.technologies)]
    if material:
        rows = [h for h in rows if material.lower() in split_csv(h.materials)]
    if q:
        needle = q.strip().lower()
        rows = [h for h in rows
                if needle in h.name_fa.lower() or needle in h.name_en.lower()
                or needle in h.city_fa or needle in h.city_en.lower()]
    keys = {"rating": lambda h: -h.rating, "speed": lambda h: h.lead_time_days,
            "orders": lambda h: -h.orders_done, "price": lambda h: h.hourly_rate}
    return sorted(rows, key=keys.get(sort, keys["rating"]))[:limit]


@router.get("/hubs/{hub_id}")
def hub_detail(hub_id: int, session: Session = Depends(get_session)):
    hub = session.get(Hub, hub_id)
    if not hub:
        raise HTTPException(404, "hub_not_found")
    reviews = session.exec(select(Review).where(Review.hub_id == hub_id)
                           .order_by(Review.id.desc()).limit(50)).all()
    return {"hub": hub, "reviews": [r.model_dump(exclude={"user_id", "order_id"}) for r in reviews]}


_stats_cache: tuple[float, dict] | None = None  # (expires_at, payload); one worker, 30 s TTL


@router.get("/stats")
def stats(session: Session = Depends(get_session)):
    global _stats_cache
    now = time.monotonic()
    if _stats_cache and _stats_cache[0] > now:
        return _stats_cache[1]
    hubs_all = session.exec(select(Hub)).all()
    n = max(len(hubs_all), 1)
    payload = {
        "hubs": len(hubs_all),
        "cities": len({h.city_en for h in hubs_all}),
        "orders_done": sum(h.orders_done for h in hubs_all),
        "avg_rating": round(sum(h.rating for h in hubs_all) / n, 2),
        "avg_lead_days": round(sum(h.lead_time_days for h in hubs_all) / n, 1),
        "materials": len(session.exec(select(Material)).all()),
        "free_capacity_pct": round(sum(100 - h.capacity_pct for h in hubs_all) / n),
    }
    _stats_cache = (now + 30, payload)
    return payload
