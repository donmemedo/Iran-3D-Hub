import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..geometry import analyse
from ..models import Hub, Material, Quote, User
from ..pricing import check_warnings, price_quote
from ..security import optional_user

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

MAX_UPLOAD = 60 * 1024 * 1024


def _material(session: Session, slug: str) -> Material:
    mat = session.exec(select(Material).where(Material.slug == slug)).first()
    if not mat:
        raise HTTPException(400, "unknown_material")
    return mat


def _match_hubs(session: Session, material: Material, city: str, bbox) -> list:
    """Pick the production partners that can actually make this part."""
    out = []
    for hub in session.exec(select(Hub)).all():
        if material.technology not in hub.technologies:
            continue
        if material.slug not in hub.materials:
            continue
        if bbox and max(bbox) > hub.max_build_mm:
            continue
        score = hub.rating * 12 - hub.lead_time_days * 4 - hub.capacity_pct * 0.08
        if hub.city_en.lower() == city.lower():
            score += 22
        out.append({"hub": hub.model_dump(), "score": round(score, 1),
                    "local": hub.city_en.lower() == city.lower()})
    return sorted(out, key=lambda r: -r["score"])[:4]


def _build(session: Session, user, filename, stats, body) -> dict:
    mat = _material(session, body["material_slug"])
    pricing = price_quote(
        material=mat, volume_cm3=stats.volume_cm3, quality=body["quality"],
        infill=body["infill"], quantity=body["quantity"], city=body["city"],
        commission=settings.platform_commission,
    )
    warnings = list(stats.warnings) + check_warnings(list(stats.bbox), mat)
    matches = _match_hubs(session, mat, body["city"], stats.bbox)
    lead = pricing["lead_time_days"]
    if matches:
        lead = max(lead, matches[0]["hub"]["lead_time_days"] + 1)

    quote = Quote(
        public_id=f"Q-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id if user else None,
        filename=filename, volume_cm3=stats.volume_cm3,
        bbox_x=stats.bbox[0], bbox_y=stats.bbox[1], bbox_z=stats.bbox[2],
        triangles=stats.triangles, material_slug=mat.slug, technology=mat.technology,
        quality=body["quality"], infill=body["infill"], quantity=body["quantity"],
        city=body["city"], unit_price=pricing["unit_price"],
        total_price=pricing["total_price"], lead_time_days=lead,
        print_hours=pricing["print_hours"], warnings=",".join(warnings),
    )
    session.add(quote)
    session.commit()
    session.refresh(quote)

    return {
        "quote": quote.model_dump(),
        "mesh": {"volume_cm3": stats.volume_cm3, "surface_cm2": stats.surface_cm2,
                 "bbox": list(stats.bbox), "triangles": stats.triangles,
                 "exact": stats.exact},
        "pricing": pricing,
        "material": mat.model_dump(),
        "warnings": warnings,
        "matches": matches,
    }


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    material_slug: str = Form("pla"),
    quality: str = Form("standard"),
    infill: int = Form(20),
    quantity: int = Form(1),
    city: str = Form("tehran"),
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(optional_user),
):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file_too_large")
    stats = analyse(file.filename or "model.stl", data)
    return _build(session, user, file.filename or "model.stl", stats,
                  {"material_slug": material_slug, "quality": quality, "infill": infill,
                   "quantity": max(1, quantity), "city": city})


class ManualIn(BaseModel):
    volume_cm3: float
    bbox: list[float] = [60, 60, 60]
    material_slug: str = "pla"
    quality: str = "standard"
    infill: int = 20
    quantity: int = 1
    city: str = "tehran"
    filename: str = "manual-entry"


@router.post("/manual")
def manual(body: ManualIn, session: Session = Depends(get_session),
           user: Optional[User] = Depends(optional_user)):
    from ..geometry import MeshStats

    bbox = (body.bbox + [0, 0, 0])[:3]
    stats = MeshStats(volume_cm3=body.volume_cm3, surface_cm2=body.volume_cm3 * 6,
                      bbox=tuple(bbox), triangles=0, exact=False)
    return _build(session, user, body.filename, stats, body.model_dump())


@router.get("/{public_id}")
def get_quote(public_id: str, session: Session = Depends(get_session)):
    q = session.exec(select(Quote).where(Quote.public_id == public_id)).first()
    if not q:
        raise HTTPException(404, "quote_not_found")
    return q
