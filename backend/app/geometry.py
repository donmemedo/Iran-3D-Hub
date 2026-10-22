"""Mesh inspection: real volume / bounding-box analysis for uploaded models.

Pure-python parsers (no numpy/native deps) for binary STL, ASCII STL and OBJ.
Volume comes from the signed-tetrahedron sum over every triangle, which is the
same method slicers use, so the instant quote is grounded in the real part.

Every parser is bounded so one upload cannot exhaust CPU or the container's memory:
  * text formats (OBJ / ASCII STL) larger than MAX_TEXT_BYTES are not parsed at all,
  * at most MAX_TRIANGLES triangles and MAX_LINES lines are read,
  * parsing works on raw bytes: no decode, no second copy of a 25 MB file.
Measured before these limits (idle machine, 60 MiB hostile text file): 3.6-19.6 s CPU and
370-552 MB RSS, which is why the ceilings below exist. See docs/05-performance.md.
"""
from __future__ import annotations

import io
import math
import re
import struct
from dataclasses import dataclass, field
from typing import List, Tuple

Vec = Tuple[float, float, float]
Tri = Tuple[Vec, Vec, Vec]

MAX_TRIANGLES = 250_000          # ~12 MB binary STL; real printable parts are far below this
MAX_TEXT_BYTES = 25 * 1024 * 1024
MAX_LINES = 3_000_000            # blank/garbage lines cost time too, so they are budgeted


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


def _stats_from_triangles(tris: List[Tri], truncated: bool = False) -> MeshStats:
    if not tris:
        return MeshStats(exact=False, warnings=["empty_mesh"] + (["mesh_truncated"] if truncated else []))
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
    if not all(math.isfinite(x) for x in (vol, area, *lo, *hi)):
        return MeshStats(exact=False, warnings=["empty_mesh"])  # NaN/inf coordinates
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
    if truncated:  # volume of a partial mesh is not the part's volume
        stats.warnings += ["mesh_truncated", "needs_engineer_review"]
        stats.exact = False
    return stats


def _parse_binary_stl(data: bytes) -> Tuple[List[Tri], bool]:
    if len(data) < 84:
        return [], False
    declared = struct.unpack_from("<I", data, 80)[0]
    available = (len(data) - 84) // 50          # never trust the header count
    n = min(declared, available, MAX_TRIANGLES)
    body = memoryview(data)[84:84 + 50 * n]
    tris = [(v[3:6], v[6:9], v[9:12]) for v in struct.iter_unpack("<12fH", body)]
    return tris, min(declared, available) > MAX_TRIANGLES  # type: ignore[return-value]


_VERTEX = re.compile(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)")


def _parse_ascii_stl(data: bytes) -> Tuple[List[Tri], bool]:
    verts: List[Vec] = []
    cap = MAX_TRIANGLES * 3
    truncated = False
    for m in _VERTEX.finditer(data):
        if len(verts) >= cap:
            truncated = True
            break
        try:
            verts.append((float(m.group(1)), float(m.group(2)), float(m.group(3))))
        except ValueError:
            continue
    tris = [tuple(verts[i:i + 3]) for i in range(0, len(verts) - 2, 3)]
    return tris, truncated  # type: ignore[return-value]


def _parse_obj(data: bytes) -> Tuple[List[Tri], bool]:
    verts: List[Vec] = []
    tris: List[Tri] = []
    for n, line in enumerate(io.BytesIO(data)):   # lazy bytes lines: no giant list, no decode
        if n >= MAX_LINES:
            return tris, True
        if line.startswith(b"v "):
            if len(verts) >= MAX_TRIANGLES:       # a 250k-triangle mesh has far fewer vertices
                return [], True
            p = line.split()
            try:
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            except (ValueError, IndexError):
                continue
        elif line.startswith(b"f "):
            idx = []
            try:
                for tok in line.split()[1:]:
                    i = int(tok.split(b"/")[0])
                    j = i - 1 if i > 0 else len(verts) + i
                    if not 0 <= j < len(verts):   # negative wrap-around / out of range
                        raise IndexError
                    idx.append(j)
            except (ValueError, IndexError):
                continue                          # skip the malformed face, keep the rest
            for k in range(1, len(idx) - 1):      # fan-triangulate
                if len(tris) >= MAX_TRIANGLES:
                    return tris, True
                tris.append((verts[idx[0]], verts[idx[k]], verts[idx[k + 1]]))
    return tris, False


def analyse(filename: str, data: bytes) -> MeshStats:
    name = filename.lower()
    oversize_text = False
    try:
        if name.endswith(".stl"):
            ascii_stl = data[:256].lstrip()[:5].lower() == b"solid" and b"facet" in data[:2048].lower()
            if not ascii_stl:
                return _stats_from_triangles(*_parse_binary_stl(data))
            if len(data) <= MAX_TEXT_BYTES:
                return _stats_from_triangles(*_parse_ascii_stl(data))
            oversize_text = True
        elif name.endswith(".obj"):
            if len(data) <= MAX_TEXT_BYTES:
                return _stats_from_triangles(*_parse_obj(data))
            oversize_text = True
    except (ValueError, IndexError, struct.error):
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
        warnings=["estimated_from_file", "needs_engineer_review"] + (["mesh_truncated"] if oversize_text else []),
    )
