"""In-process harness: runs the real ASGI app (middleware + seed) on a fresh SQLite file.

No server, no network. `client()` re-imports the app so env changes take effect.
Run with:  cd backend && ./.venv/bin/python -m pytest -q
"""
import importlib
import os
import shutil
import struct
import sys
import tempfile
import uuid

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

STRONG_SECRET = "pt-secret-Zq7Lm2Xv9Rk4Tw8Yb3Nc6Hd1Fg5Js0PaEu"  # >= 32 chars and varied
# A private temp dir: other processes cleaning /tmp must not be able to delete our databases.
TMP = tempfile.mkdtemp(prefix="h3d-pytest-")
_ENV_KEYS = ("JWT_SECRET", "DEV", "SEED_DEMO", "LOGIN_RATE_LIMIT", "MAX_UPLOAD_MB", "MAX_JSON_KB",
             "CORS_ORIGINS", "DATABASE_URL", "ORDERS_PER_HOUR", "ANALYZE_PER_MINUTE", "MAX_PARALLEL_PARSES")


@pytest.fixture(scope="session", autouse=True)
def _cleanup_tmp():
    yield
    shutil.rmtree(TMP, ignore_errors=True)


def fresh_app(**env):
    """Import app.main with the given env. Returns the module (so tests can reach app.*)."""
    for k in _ENV_KEYS:  # no leakage from the previous test
        os.environ.pop(k, None)
    os.environ.update({"JWT_SECRET": STRONG_SECRET, "LOGIN_RATE_LIMIT": "1000", "DEV": "false",
                       "DATABASE_URL": f"sqlite:///{TMP}/h3d-{uuid.uuid4().hex}.db"})
    os.environ.update(env)  # a test may override anything, including DATABASE_URL (restart simulation)
    # SQLModel keeps one global MetaData/registry; clear it so a re-import can redeclare tables.
    from sqlmodel import SQLModel
    SQLModel.metadata.clear()
    SQLModel._sa_registry.dispose(cascade=True)
    for m in [m for m in list(sys.modules) if m == "app" or m.startswith("app.")]:
        del sys.modules[m]
    return importlib.import_module("app.main")


def client(**env):
    from fastapi.testclient import TestClient
    main = fresh_app(**env)
    c = TestClient(main.app, base_url="http://testserver")
    c.__enter__()  # run startup (init_db + seed)
    return c


@pytest.fixture
def c():
    cl = client()
    yield cl
    cl.__exit__(None, None, None)


def login(c, email="demo@3dhub.ir", password="demo1234"):
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def register(c, email=None, password="Passw0rd!x", **extra):
    email = email or f"u{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/auth/register", json={"email": email, "password": password, "full_name": "T", **extra})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


def manual_quote(c, headers=None, **over):
    body = {"volume_cm3": 27.0, "bbox": [30, 30, 30], "material_slug": "pla", "quality": "standard",
            "infill": 20, "quantity": 1, "city": "tehran"}
    body.update(over)
    return c.post("/api/quotes/manual", json=body, headers=headers or {})


def place_order(c, headers, token, hub_id=1, **over):
    body = {"quote_public_id": token, "hub_id": hub_id, "address": "Tehran, Valiasr 1", "note": ""}
    body.update(over)
    return c.post("/api/orders", json=body, headers=headers)


def cube_stl(mm=30.0) -> bytes:
    """Binary STL of a closed cube; 30 mm gives 27 cm3."""
    s = mm
    v = [(0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0), (0, 0, s), (s, 0, s), (s, s, s), (0, s, s)]
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5),
             (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    out = bytearray(b"\0" * 80) + struct.pack("<I", len(faces))
    for a, b, cc in faces:
        out += struct.pack("<3f", 0, 0, 0)
        for i in (a, b, cc):
            out += struct.pack("<3f", *v[i])
        out += struct.pack("<H", 0)
    return bytes(out)


def ascii_stl(n_tris: int) -> str:
    tri = "facet normal 0 0 0\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\n"
    return "solid t\n" + tri * n_tris + "endsolid t\n"


def set_role(email, role):
    """Promote a user directly in the DB (there is no admin UI yet)."""
    from sqlmodel import Session, select
    from app.db import engine
    from app.models import User
    with Session(engine) as s:
        u = s.exec(select(User).where(User.email == email)).one()
        u.role = role
        s.add(u)
        s.commit()
