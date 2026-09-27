from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Hub, Material, Review
from ..pricing import CITY_LEAD, QUALITY, TECH

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/materials")
def materials(technology: str | None = None, session: Session = Depends(get_session)):
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
def hubs(city: str | None = None, technology: str | None = None,
         material: str | None = None, q: str | None = None,
         sort: str = "rating", session: Session = Depends(get_session)):
    rows = session.exec(select(Hub)).all()
    if city:
        rows = [h for h in rows if h.city_en.lower() == city.lower()]
    if technology:
        rows = [h for h in rows if technology.upper() in h.technologies.upper()]
    if material:
        rows = [h for h in rows if material in h.materials]
    if q:
        needle = q.strip().lower()
        rows = [h for h in rows
                if needle in h.name_fa.lower() or needle in h.name_en.lower()
                or needle in h.city_fa or needle in h.city_en.lower()]
    keys = {"rating": lambda h: -h.rating, "speed": lambda h: h.lead_time_days,
            "orders": lambda h: -h.orders_done, "price": lambda h: h.hourly_rate}
    return sorted(rows, key=keys.get(sort, keys["rating"]))


@router.get("/hubs/{hub_id}")
def hub_detail(hub_id: int, session: Session = Depends(get_session)):
    hub = session.get(Hub, hub_id)
    if not hub:
        return {"error": "not_found"}
    reviews = session.exec(select(Review).where(Review.hub_id == hub_id)).all()
    return {"hub": hub, "reviews": reviews}


@router.get("/stats")
def stats(session: Session = Depends(get_session)):
    hubs_all = session.exec(select(Hub)).all()
    return {
        "hubs": len(hubs_all),
        "cities": len({h.city_en for h in hubs_all}),
        "orders_done": sum(h.orders_done for h in hubs_all),
        "avg_rating": round(sum(h.rating for h in hubs_all) / max(len(hubs_all), 1), 2),
        "avg_lead_days": round(sum(h.lead_time_days for h in hubs_all) / max(len(hubs_all), 1), 1),
        "materials": len(session.exec(select(Material)).all()),
        "free_capacity_pct": round(
            sum(100 - h.capacity_pct for h in hubs_all) / max(len(hubs_all), 1)),
    }
