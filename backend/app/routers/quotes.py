import os
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..geometry import MeshStats, analyse
from ..models import Hub, Material, Quote, User
from ..pricing import MAX_VOLUME_CM3, check_warnings, price_quote
from ..schemas import City, ManualIn, Quality, QuoteParams
from ..security import current_user, sign_quote

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

ALLOWED_EXT = {".stl", ".obj", ".step", ".stp", ".iges", ".igs", ".3mf"}
_SAFE_NAME = re.compile(r"[^\w.\- ()؀-ۿ]")


def split_csv(value: str) -> set[str]:
    """'FDM,SLA' -> {'FDM','SLA'}. Whole-token matching: 'pa12' must not match 'pa12-gf'."""
    return {t.strip().lower() for t in value.split(",") if t.strip()}


def clean_filename(name: str) -> str:
    base = os.path.basename(name.replace("\\", "/"))
    stem, ext = os.path.splitext(_SAFE_NAME.sub("_", base).replace("..", "."))
    return (stem[: 120 - len(ext)] or "model") + ext


def _material(session: Session, slug: str) -> Material:
    mat = session.exec(select(Material).where(Material.slug == slug)).first()
    if not mat:
        raise HTTPException(400, "unknown_material")
    return mat


def hub_can_make(hub: Hub, material: Material, bbox) -> bool:
    return (material.technology.lower() in split_csv(hub.technologies)
            and material.slug.lower() in split_csv(hub.materials)
            and not (bbox and max(bbox) > hub.max_build_mm))


def _match_hubs(session: Session, material: Material, city: str, bbox) -> list:
    """Pick the production partners that can actually make this part."""
    out = []
    for hub in session.exec(select(Hub)).all():
        if not hub_can_make(hub, material, bbox):
            continue
        local = hub.city_en.lower() == city.lower()
        score = hub.rating * 12 - hub.lead_time_days * 4 - hub.capacity_pct * 0.08 + (22 if local else 0)
        out.append({"hub": hub.model_dump(), "score": round(score, 1), "local": local})
    return sorted(out, key=lambda r: -r["score"])[:4]


def _build(session: Session, filename: str, stats: MeshStats, p) -> dict:
    """Price a part and sign the result. Nothing is written to the database."""
    if stats.volume_cm3 > MAX_VOLUME_CM3:
        raise HTTPException(422, "volume_out_of_range")
    mat = _material(session, p.material_slug)
    pricing = price_quote(material=mat, volume_cm3=stats.volume_cm3, quality=p.quality,
                          infill=p.infill, quantity=p.quantity, city=p.city,
                          commission=settings.platform_commission)
    warnings = list(stats.warnings) + check_warnings(list(stats.bbox), mat)
    matches = _match_hubs(session, mat, p.city, stats.bbox)
    lead = pricing["lead_time_days"]
    if matches:
        lead = max(lead, matches[0]["hub"]["lead_time_days"] + 1)

    snapshot = {
        "filename": filename, "volume_cm3": stats.volume_cm3,
        "bbox_x": stats.bbox[0], "bbox_y": stats.bbox[1], "bbox_z": stats.bbox[2],
        "triangles": stats.triangles, "material_slug": mat.slug, "technology": mat.technology,
        "quality": p.quality, "infill": p.infill, "quantity": p.quantity, "city": p.city,
        "unit_price": pricing["unit_price"], "total_price": pricing["total_price"],
        "lead_time_days": lead, "print_hours": pricing["print_hours"],
        "warnings": ",".join(warnings),
    }
    return {
        "quote": {**snapshot, "public_id": sign_quote(snapshot)},
        "mesh": {"volume_cm3": stats.volume_cm3, "surface_cm2": stats.surface_cm2,
                 "bbox": list(stats.bbox), "triangles": stats.triangles, "exact": stats.exact},
        "pricing": pricing,
        "material": mat.model_dump(),
        "warnings": warnings,
        "matches": matches,
    }


# Plain `def`, not `async def`: parsing is CPU-bound pure Python and must run in
# FastAPI's threadpool, otherwise one upload would freeze the event loop for everyone.
@router.post("/analyze")
def analyze(
    file: UploadFile = File(...),
    material_slug: str = Form("pla", min_length=1, max_length=32, pattern=r"^[a-z0-9-]+$"),
    quality: Quality = Form("standard"),
    infill: int = Form(20, ge=5, le=100),
    quantity: int = Form(1, ge=1, le=10_000),
    city: City = Form("tehran"),
    session: Session = Depends(get_session),
):
    name = clean_filename(file.filename or "model.stl")
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXT:
        raise HTTPException(422, "unsupported_file_type")
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)              # never reads more than limit + 1 bytes
    if len(data) > limit:
        raise HTTPException(413, "file_too_large")
    stats = analyse(name, data)
    params = QuoteParams(material_slug=material_slug, quality=quality, infill=infill,
                         quantity=quantity, city=city)
    return _build(session, name, stats, params)


@router.post("/manual")
def manual(body: ManualIn, session: Session = Depends(get_session)):
    stats = MeshStats(volume_cm3=body.volume_cm3, surface_cm2=body.volume_cm3 * 6,
                      bbox=tuple(body.bbox), triangles=0, exact=False)  # type: ignore[arg-type]
    return _build(session, clean_filename(body.filename), stats, body)


@router.get("/{public_id}")
def get_quote(public_id: str, session: Session = Depends(get_session),
              user: User = Depends(current_user)):
    """A saved quote (created when an order is placed). Visible to its owner only."""
    q = session.exec(select(Quote).where(Quote.public_id == public_id,
                                          Quote.user_id == user.id)).first()
    if not q:
        raise HTTPException(404, "quote_not_found")
    return q.model_dump(exclude={"user_id", "id"})
