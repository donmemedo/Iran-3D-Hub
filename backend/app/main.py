from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import auth, catalog, orders, quotes
from .seed import seed

app = FastAPI(
    title=settings.app_name,
    description="Marketplace API for 3D Hub Iran — instant quoting, hub matching and order flow.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    # Any localhost port is allowed in development; "*" with credentials is invalid.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(quotes.router)
app.include_router(orders.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    seed()


@app.get("/api/health")
def health():
    return {"status": "ok", "service": settings.app_name, "commission": settings.platform_commission}
