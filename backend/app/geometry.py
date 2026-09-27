"""Mesh inspection: real volume / bounding-box analysis for uploaded models.

Pure-python parsers (no numpy/native deps) for binary STL, ASCII STL and OBJ.
Volume comes from the signed-tetrahedron sum over every triangle, which is the
same method slicers use, so the instant quote is grounded in the real part.
"""
from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from typing import List, Tuple

Vec = Tuple[float, float, float]


@dataclass
class MeshStats:
    volume_cm3: float = 0.0
    surface_cm2: float = 0.0
    bbox: Vec = (0.0, 0.0, 0.0)
    triangles: int = 0
    exact: bool = True
    warnings: List[str] = field(default_factory=list)


def _signed_volume(a: Vec, b: Vec, c: Vec) -> float:
    return (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6.0


def _tri_area(a: Vec, b: Vec, c: Vec) -> float:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    cx, cy, cz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    return 0.5 * (cx * cx + cy * cy + cz * cz) ** 0.5


def _stats_from_triangles(tris: List[Tuple[Vec, Vec, Vec]]) -> MeshStats:
    if not tris:
        return MeshStats(exact=False, warnings=["empty_mesh"])
    vol = 0.0
    area = 0.0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for a, b, c in tris:
        vol += _signed_volume(a, b, c)
        area += _tri_area(a, b, c)
        for p in (a, b, c):
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    bbox = tuple(round(hi[i] - lo[i], 2) for i in range(3))  # mm
    stats = MeshStats(
        volume_cm3=round(abs(vol) / 1000.0, 3),  # mm3 -> cm3
        surface_cm2=round(area / 100.0, 2),
        bbox=bbox,  # type: ignore[arg-type]
        triangles=len(tris),
    )
    if stats.volume_cm3 <= 0:
        stats.warnings.append("non_manifold")
        stats.exact = False
    return stats


def _parse_binary_stl(data: bytes) -> List[Tuple[Vec, Vec, Vec]]:
    count = struct.unpack("<I", data[80:84])[0]
    tris: List[Tuple[Vec, Vec, Vec]] = []
    offset = 84
    for _ in range(min(count, 2_000_000)):
        if offset + 50 > len(data):
            break
        vals = struct.unpack_from("<12fH", data, offset)
        tris.append((vals[3:6], vals[6:9], vals[9:12]))  # type: ignore[arg-type]
        offset += 50
    return tris


_NUM = re.compile(r"[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?")


def _parse_ascii_stl(text: str) -> List[Tuple[Vec, Vec, Vec]]:
    verts: List[Vec] = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("vertex"):
            n = _NUM.findall(s)
            if len(n) >= 3:
                verts.append((float(n[0]), float(n[1]), float(n[2])))
    return [tuple(verts[i : i + 3]) for i in range(0, len(verts) - 2, 3)]  # type: ignore


def _parse_obj(text: str) -> List[Tuple[Vec, Vec, Vec]]:
    verts: List[Vec] = []
    tris: List[Tuple[Vec, Vec, Vec]] = []
    for line in text.splitlines():
        if line.startswith("v "):
            p = line.split()
            verts.append((float(p[1]), float(p[2]), float(p[3])))
        elif line.startswith("f "):
            idx = []
            for tok in line.split()[1:]:
                i = int(tok.split("/")[0])
                idx.append(i - 1 if i > 0 else len(verts) + i)
            for k in range(1, len(idx) - 1):  # fan-triangulate
                tris.append((verts[idx[0]], verts[idx[k]], verts[idx[k + 1]]))
    return tris


def analyse(filename: str, data: bytes) -> MeshStats:
    name = filename.lower()
    try:
        if name.endswith(".stl"):
            head = data[:256].lstrip()
            if head[:5].lower() == b"solid" and b"facet" in data[:2048].lower():
                return _stats_from_triangles(_parse_ascii_stl(data.decode("utf-8", "ignore")))
            return _stats_from_triangles(_parse_binary_stl(data))
        if name.endswith(".obj"):
            return _stats_from_triangles(_parse_obj(data.decode("utf-8", "ignore")))
    except Exception:
        pass

    # STEP / IGES / 3MF and anything unreadable: fall back to a size estimate so
    # the user still gets an indicative price, clearly flagged for review.
    approx = max(len(data) / 1024 / 55.0, 1.5)
    return MeshStats(
        volume_cm3=round(approx, 2),
        surface_cm2=round(approx * 6.5, 2),
        bbox=(60.0, 60.0, 60.0),
        triangles=0,
        exact=False,
        warnings=["estimated_from_file", "needs_engineer_review"],
    )
