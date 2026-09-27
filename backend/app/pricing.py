"""Instant-quote engine. All amounts in Toman."""
from __future__ import annotations

from typing import Dict, List

from .models import Material

QUALITY = {
    # layer height (mm), time multiplier, price multiplier
    "draft": (0.30, 0.72, 0.92),
    "standard": (0.20, 1.00, 1.00),
    "fine": (0.10, 1.65, 1.22),
}

TECH = {
    # cm3 printed per machine-hour, setup fee, min charge
    "FDM": (14.0, 45_000, 85_000),
    "SLA": (9.0, 90_000, 180_000),
    "SLS": (22.0, 140_000, 420_000),
}

CITY_LEAD = {
    "tehran": 0, "karaj": 0, "isfahan": 1,
    "mashhad": 1, "shiraz": 1, "tabriz": 1, "other": 2,
}

QTY_BREAKS = [(1, 1.0), (5, 0.93), (10, 0.86), (25, 0.78), (50, 0.70)]


def qty_factor(quantity: int) -> float:
    factor = 1.0
    for threshold, value in QTY_BREAKS:
        if quantity >= threshold:
            factor = value
    return factor


def price_quote(
    material: Material,
    volume_cm3: float,
    quality: str = "standard",
    infill: int = 20,
    quantity: int = 1,
    city: str = "tehran",
    commission: float = 0.15,
) -> Dict:
    quality = quality if quality in QUALITY else "standard"
    tech = material.technology if material.technology in TECH else "FDM"
    _, time_mult, price_mult = QUALITY[quality]
    throughput, setup_fee, min_charge = TECH[tech]

    # Resin/powder parts are solid; FDM honours the infill setting.
    fill = (0.22 + 0.78 * (infill / 100.0)) if tech == "FDM" else 1.0
    solid_cm3 = max(volume_cm3 * fill, 0.05)

    material_cost = solid_cm3 * material.price_per_cm3
    print_hours = round((solid_cm3 / throughput) * time_mult + 0.25, 2)
    machine_cost = print_hours * 45_000
    unit = (material_cost + machine_cost) * price_mult + setup_fee
    unit = max(unit, min_charge)
    unit = int(round(unit * qty_factor(quantity) / 1000.0) * 1000)

    subtotal = unit * quantity
    fee = int(round(subtotal * commission / 1000.0) * 1000)
    lead = 2 + CITY_LEAD.get(city, 2) + (1 if quantity > 10 else 0) + (1 if quality == "fine" else 0)

    return {
        "unit_price": unit,
        "subtotal": subtotal,
        "platform_fee": fee,
        "total_price": subtotal + fee,
        "print_hours": print_hours,
        "material_cost": int(material_cost),
        "machine_cost": int(machine_cost),
        "lead_time_days": lead,
        "solid_cm3": round(solid_cm3, 2),
    }


def check_warnings(bbox: List[float], material: Material, max_build_mm: int = 250) -> List[str]:
    out: List[str] = []
    if bbox and max(bbox) > max_build_mm:
        out.append("oversize_split_required")
    if bbox and min(b for b in bbox if b > 0) < material.min_wall_mm:
        out.append("thin_wall")
    return out
