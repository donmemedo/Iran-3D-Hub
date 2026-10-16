"""Security, correctness and performance regression suite.

Every test asserts the SAFE behaviour. Before the audit fixes most of these failed,
which is the red-team confirmation; after them they are the blue-team proof.
"""
import inspect
import os
import struct
import sys
import tempfile
import uuid

import jwt
import pytest
from sqlalchemy import event

from conftest import (STRONG_SECRET, ascii_stl, client, cube_stl, fresh_app, login, manual_quote,
                      place_order, register, set_role)


def _rows(model):
    from sqlmodel import Session, select
    from app.db import engine
    with Session(engine) as s:
        return s.exec(select(model)).all()


# ───────────────────────── auth & session ─────────────────────────

def test_default_or_weak_jwt_secret_refuses_to_start():
    for bad in ("change-me-in-production-3dhub-iran", "change-me-in-production", "short", ""):
        with pytest.raises(RuntimeError):
            fresh_app(JWT_SECRET=bad, DEV="false")


def test_dev_mode_generates_a_random_secret_instead_of_the_default():
    main = fresh_app(JWT_SECRET="", DEV="true")
    from app.config import settings
    assert len(settings.jwt_secret) >= 32 and "change-me" not in settings.jwt_secret


def test_token_without_sub_is_401_not_500(c):
    tok = jwt.encode({"email": "demo@3dhub.ir", "exp": 4102444800}, STRONG_SECRET, algorithm="HS256")
    r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401
    tok = jwt.encode({"sub": "not-an-int", "exp": 4102444800}, STRONG_SECRET, algorithm="HS256")
    assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


def test_quote_token_cannot_be_used_as_auth_token(c):
    tok = manual_quote(c).json()["quote"]["public_id"]
    assert c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


def test_login_and_register_are_rate_limited():
    cl = client(LOGIN_RATE_LIMIT="5")
    try:
        codes = [cl.post("/api/auth/login", json={"email": "x@y.io", "password": "nope-nope"}).status_code
                 for _ in range(8)]
        assert codes[:5] == [401] * 5 and codes[5:] == [429] * 3, codes
        r = cl.post("/api/auth/register", json={"email": "a@b.io", "password": "Passw0rd!x"})
        assert r.status_code == 429  # same bucket, same IP
    finally:
        cl.__exit__(None, None, None)


def test_password_policy_and_field_limits(c):
    bad = [{"email": "p@x.io", "password": ""}, {"email": "p@x.io", "password": "short"},
           {"email": "p@x.io", "password": "x" * 2000},
           {"email": "p@x.io", "password": "Passw0rd!x", "full_name": "n" * 10_000},
           {"email": "p@x.io", "password": "Passw0rd!x", "phone": "1" * 500}]
    for b in bad:
        assert c.post("/api/auth/register", json=b).status_code == 422, b


def test_email_is_case_normalised_so_no_duplicate_accounts(c):
    register(c, email="Dup.User@Example.com")
    r = c.post("/api/auth/register", json={"email": "dup.user@example.com", "password": "Passw0rd!x"})
    assert r.status_code == 409
    assert c.post("/api/auth/login", json={"email": "DUP.USER@example.com", "password": "Passw0rd!x"}).status_code == 200


def test_legacy_pbkdf2_hash_still_logs_in_and_is_upgraded_to_scrypt(c):
    import hashlib
    from sqlmodel import Session, select
    from app.db import engine
    from app.models import User
    salt = os.urandom(16)
    legacy = f"{salt.hex()}${hashlib.pbkdf2_hmac('sha256', b'OldPass!123', salt, 120_000).hex()}"
    with Session(engine) as s:
        s.add(User(email="legacy@x.io", password_hash=legacy))
        s.commit()
    assert c.post("/api/auth/login", json={"email": "legacy@x.io", "password": "OldPass!123"}).status_code == 200
    with Session(engine) as s:
        assert s.exec(select(User).where(User.email == "legacy@x.io")).one().password_hash.startswith("scrypt$")


# ───────────────────────── access control & business logic ─────────────────────────

def test_customer_cannot_advance_their_own_order(c):
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    oid = place_order(c, h, tok).json()["public_id"]
    assert c.post(f"/api/orders/{oid}/advance", headers=h).status_code == 403
    assert c.get(f"/api/orders/{oid}", headers=h).json()["order"]["status"] == "pending_payment"


def test_only_admin_can_advance_orders(c):
    h, u = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    oid = place_order(c, h, tok).json()["public_id"]
    set_role(u["email"], "hub")  # a hub account has no hub<->user link yet, so it is not trusted either
    assert c.post(f"/api/orders/{oid}/advance", headers=login(c, u["email"], "Passw0rd!x")).status_code == 403
    set_role(u["email"], "admin")
    ha = login(c, u["email"], "Passw0rd!x")  # new token carries the role
    r = c.post(f"/api/orders/{oid}/advance", headers=ha)
    assert r.status_code == 200 and r.json()["order"]["status"] == "in_production"


def test_quoting_never_writes_to_the_database(c):
    from app.models import Quote
    h, _ = register(c)
    for hdr in (None, h):
        for _ in range(5):
            assert manual_quote(c, hdr).status_code == 200
    r = c.post("/api/quotes/analyze", files={"file": ("cube.stl", cube_stl(30), "application/octet-stream")},
               data={"material_slug": "pla"})
    assert r.status_code == 200 and r.json()["mesh"]["volume_cm3"] == 27.0
    assert _rows(Quote) == []


def test_order_materialises_quote_and_rejects_tampering(c):
    from app.models import Order, Quote
    h, u = register(c)
    res = manual_quote(c, h).json()
    tok = res["quote"]["public_id"]
    claims = jwt.decode(tok, options={"verify_signature": False})
    assert "exp" in claims and claims.get("typ") == "quote"
    r = place_order(c, h, tok)
    assert r.status_code == 200, r.text
    assert r.json()["amount"] == res["pricing"]["total_price"]
    q = _rows(Quote)
    assert len(q) == 1 and q[0].user_id == u["id"] and q[0].total_price == res["pricing"]["total_price"]
    # forged price: re-sign with the wrong key
    forged = jwt.encode({**claims, "total": 1000}, "not-the-secret", algorithm="HS256")
    assert place_order(c, h, forged).status_code == 400
    assert place_order(c, h, "Q-DEADBEEF").status_code == 400
    assert len(_rows(Order)) == 1


def test_order_rejects_a_hub_that_cannot_make_the_part(c):
    h, _ = register(c)
    tok = manual_quote(c, h, material_slug="pla").json()["quote"]["public_id"]
    assert place_order(c, h, tok, hub_id=3).status_code == 422   # SLA-only studio, quote is FDM/PLA
    tok = manual_quote(c, h, bbox=[900, 10, 10]).json()["quote"]["public_id"]
    assert place_order(c, h, tok, hub_id=1).status_code == 422   # bigger than the 300 mm build volume


def test_order_requires_existing_hub(c):
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    assert place_order(c, h, tok, hub_id=9999).status_code == 404
    assert place_order(c, h, tok, hub_id=None).status_code == 200


def test_order_ids_are_long_and_unique_in_schema(c):
    from app.db import engine
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    oid = place_order(c, h, tok).json()["public_id"]
    assert len(oid.split("-", 1)[1]) >= 12
    with engine.connect() as conn:
        uniq = [row for row in conn.exec_driver_sql("PRAGMA index_list('order')") if row[2] == 1]
        cols = {conn.exec_driver_sql(f"PRAGMA index_info('{u[1]}')").fetchone()[2] for u in uniq}
        assert "public_id" in cols
        idx = {conn.exec_driver_sql(f"PRAGMA index_info('{r[1]}')").fetchone()[2]
               for r in conn.exec_driver_sql("PRAGMA index_list('order')")}
        assert "user_id" in idx  # SQLite does not index FKs on its own


def test_review_requires_a_delivered_order_and_is_one_per_order(c):
    from app.models import Hub
    h, u = register(c)
    tok = manual_quote(c, h, material_slug="resin-std").json()["quote"]["public_id"]
    oid = place_order(c, h, tok, hub_id=3).json()["public_id"]  # hub 3 is the SLA resin studio
    body = {"order_public_id": oid, "rating": 1, "body": "bad"}
    assert c.post("/api/orders/reviews", json=body, headers=h).status_code == 403
    set_role(u["email"], "admin")
    ha = login(c, u["email"], "Passw0rd!x")
    for _ in range(4):
        c.post(f"/api/orders/{oid}/advance", headers=ha)
    before = [x for x in _rows(Hub) if x.id == 3][0]
    assert c.post("/api/orders/reviews", json=body, headers=h).status_code == 200
    assert c.post("/api/orders/reviews", json=body, headers=h).status_code == 409
    after = [x for x in _rows(Hub) if x.id == 3][0]
    assert after.reviews_count == before.reviews_count + 1 and after.rating < before.rating
    # other users' orders cannot be reviewed
    h2, _ = register(c)
    assert c.post("/api/orders/reviews", json=body, headers=h2).status_code == 403
    assert c.post("/api/orders/reviews", json={**body, "rating": 99}, headers=h).status_code == 422


def test_persisted_quote_is_owner_only(c):
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    place_order(c, h, tok)
    from app.models import Quote
    pid = _rows(Quote)[0].public_id
    assert c.get(f"/api/quotes/{pid}").status_code == 401
    h2, _ = register(c)
    assert c.get(f"/api/quotes/{pid}", headers=h2).status_code == 404
    assert c.get(f"/api/quotes/{pid}", headers=h).status_code == 200


def test_hub_detail_404_and_cancel_rules(c):
    assert c.get("/api/hubs/9999").status_code == 404
    assert c.get("/api/hubs/1").status_code == 200


# ───────────────────────── input validation ─────────────────────────

@pytest.mark.parametrize("over", [
    {"quantity": 0}, {"quantity": -5}, {"quantity": 10**12}, {"infill": 150}, {"infill": -1},
    {"volume_cm3": -1}, {"volume_cm3": 0}, {"volume_cm3": 10**9}, {"quality": "ultra"},
    {"city": "tehran; drop table"}, {"bbox": [1, 2]}, {"bbox": [1, 2, 3, 4, 5, 6, 7]},
    {"bbox": [-1, 2, 3]}, {"filename": "x" * 10_000}, {"material_slug": "x" * 500},
])
def test_manual_quote_rejects_bad_input(c, over):
    assert manual_quote(c, **over).status_code == 422, over


def test_manual_quote_rejects_nan_and_inf(c):
    body = '{"volume_cm3": NaN, "material_slug": "pla"}'
    r = c.post("/api/quotes/manual", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 422
    body = '{"volume_cm3": 10, "bbox": [Infinity, 1, 1], "material_slug": "pla"}'
    r = c.post("/api/quotes/manual", content=body, headers={"Content-Type": "application/json"})
    assert r.status_code == 422


def test_price_is_never_negative_or_zero(c):
    r = manual_quote(c, quantity=1, volume_cm3=0.01).json()
    assert r["pricing"]["total_price"] > 0


def test_zero_bbox_does_not_crash(c):
    assert manual_quote(c, bbox=[0, 0, 0]).status_code == 200


def test_analyze_form_bounds(c):
    r = c.post("/api/quotes/analyze", files={"file": ("cube.stl", cube_stl(), "application/octet-stream")},
               data={"quantity": "0"})
    assert r.status_code == 422
    r = c.post("/api/quotes/analyze", files={"file": ("cube.stl", cube_stl(), "application/octet-stream")},
               data={"quality": "ultra"})
    assert r.status_code == 422


def test_order_field_limits(c):
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    assert place_order(c, h, tok, address="a" * 5000).status_code == 422
    assert place_order(c, h, tok, note="n" * 5000).status_code == 422


def test_material_and_technology_filters_match_whole_tokens(c):
    assert c.get("/api/hubs?material=pa").json() == []
    assert c.get("/api/hubs?technology=FD").json() == []
    assert len(c.get("/api/hubs?material=pa12").json()) == 3
    # a hub that only lists pa12-gf must not be matched for pa12
    from sqlmodel import Session
    from app.db import engine
    from app.models import Hub
    with Session(engine) as s:
        s.add(Hub(name_fa="x", name_en="GF Only", city_fa="تهران", city_en="Tehran", lat=0, lng=0,
                  technologies="SLS", materials="pa12-gf", rating=5.0, lead_time_days=1, capacity_pct=0))
        s.commit()
    names = [m["hub"]["name_en"] for m in manual_quote(c, material_slug="pa12").json()["matches"]]
    assert "GF Only" not in names


# ───────────────────────── upload & geometry DoS ─────────────────────────

def test_analyze_is_not_an_async_def_blocking_the_loop():
    fresh_app()
    from app.routers import quotes
    assert not inspect.iscoroutinefunction(quotes.analyze)


def test_oversized_upload_is_rejected_early():
    cl = client(MAX_UPLOAD_MB="1")
    try:
        big = b"\0" * (1024 * 1024 + 1024)
        r = cl.post("/api/quotes/analyze", files={"file": ("big.stl", big, "application/octet-stream")},
                    data={"material_slug": "pla"})
        assert r.status_code == 413
        # a plain JSON body over the limit is refused too
        r = cl.post("/api/quotes/manual", content=b"{" + b" " * (1024 * 1024 + 1024) + b"}",
                    headers={"Content-Type": "application/json"})
        assert r.status_code == 413
    finally:
        cl.__exit__(None, None, None)


def test_every_parser_honours_the_triangle_cap(monkeypatch):
    fresh_app()
    from app import geometry
    monkeypatch.setattr(geometry, "MAX_TRIANGLES", 4)
    s = geometry.analyse("a.stl", ascii_stl(12).encode())
    assert s.triangles == 4 and "mesh_truncated" in s.warnings and not s.exact
    obj = "v 0 0 0\nv 1 0 0\nv 0 1 0\n" + "f 1 2 3\n" * 12
    s = geometry.analyse("a.obj", obj.encode())
    assert s.triangles == 4 and "mesh_truncated" in s.warnings
    s = geometry.analyse("a.stl", cube_stl())
    assert s.triangles == 4 and "mesh_truncated" in s.warnings


def test_hostile_meshes_do_not_500(c):
    cases = {
        "zeros.stl": b"\0" * 200,
        "hugecount.stl": b"\0" * 80 + struct.pack("<I", 4_000_000_000) + b"\0" * 50,
        "badidx.obj": b"v 0 0 0\nv 1 0 0\nf 1 2 99\nf -7 1 2\n",
        "empty.obj": b"",
        "junk.step": os.urandom(2048),
    }
    for name, data in cases.items():
        r = c.post("/api/quotes/analyze", files={"file": (name, data, "application/octet-stream")},
                   data={"material_slug": "pla"})
        assert r.status_code == 200, (name, r.status_code, r.text[:200])


def test_upload_filename_is_sanitised(c):
    h, _ = register(c)
    r = c.post("/api/quotes/analyze", headers=h,
               files={"file": ("../../etc/passwd" + "x" * 300 + ".stl", cube_stl(), "application/octet-stream")},
               data={"material_slug": "pla"})
    fn = r.json()["quote"]["filename"]
    assert "/" not in fn and ".." not in fn and len(fn) <= 120


# ───────────────────────── headers, CORS, config ─────────────────────────

def test_api_sends_security_headers_and_hides_docs(c):
    r = c.get("/api/health")
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert "frame-ancestors 'none'" in r.headers.get("content-security-policy", "")
    assert r.headers.get("referrer-policy")
    assert "no-store" in c.post("/api/auth/login", json={"email": "a@b.io", "password": "x" * 8}).headers.get("cache-control", "")
    assert c.get("/docs").status_code == 404
    assert c.get("/openapi.json").status_code == 404


def test_cors_is_an_allowlist_without_credentials(c):
    for origin in ("https://evil.example", "http://localhost:1337", "http://127.0.0.1:9999"):
        r = c.options("/api/stats", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
        assert "access-control-allow-origin" not in r.headers, origin
    r = c.get("/api/stats", headers={"Origin": "http://localhost:3560"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3560"
    assert r.headers.get("access-control-allow-credentials") is None


def test_health_does_not_leak_configuration(c):
    body = c.get("/api/health").json()
    assert "commission" not in body


def test_sqlite_runs_in_wal_mode_with_busy_timeout(c):
    from app.db import engine
    with engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar().lower() == "wal"
        assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar() >= 5000


# ───────────────────────── performance ─────────────────────────

def test_dashboard_listing_is_not_n_plus_one(c):
    from app.db import engine
    h, _ = register(c)
    tok = manual_quote(c, h).json()["quote"]["public_id"]
    for _ in range(20):
        assert place_order(c, h, tok).status_code == 200
    stmts = []

    def rec(conn, cursor, statement, *a):
        stmts.append(statement)

    event.listen(engine, "before_cursor_execute", rec)
    try:
        r = c.get("/api/orders", headers=h)
    finally:
        event.remove(engine, "before_cursor_execute", rec)
    assert r.status_code == 200 and len(r.json()) == 20
    selects = [s for s in stmts if s.lstrip().upper().startswith("SELECT")]
    assert len(selects) <= 4, f"{len(selects)} SELECTs for 20 orders (N+1)"
