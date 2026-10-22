import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import init_db
from .middleware import BodyLimit, SecureHeaders
from .routers import auth, catalog, orders, quotes
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    seed()
    yield


app = FastAPI(
    title=settings.app_name,
    description="Marketplace API for 3D Hub Iran — instant quoting, hub matching and order flow.",
    version="1.1.0",
    lifespan=lifespan,
    # The API reference is a recon gift in production; keep it for local development only.
    docs_url="/docs" if settings.dev else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.dev else None,
)

# Last added = outermost. Order: headers/logging -> CORS -> body limit -> app.
app.add_middleware(BodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    # Any localhost port only in development. Auth is a Bearer header, not a cookie,
    # so credentialed CORS is never needed.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?" if settings.dev else None,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,  # browsers cache the preflight: one OPTIONS per 10 min instead of per request
)
app.add_middleware(SecureHeaders)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(quotes.router)
app.include_router(orders.router)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # Default handler echoes the offending input back (can be megabytes). Return locations only.
    errs = [{"loc": [str(x) for x in e["loc"]], "type": e["type"]} for e in exc.errors()]
    return JSONResponse({"detail": "validation_error", "errors": errs}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error rid=%s", getattr(request.state, "request_id", "-"))
    return JSONResponse({"detail": "internal_error",
                         "request_id": getattr(request.state, "request_id", None)}, status_code=500)


@app.get("/api/health")
def health():
    return {"status": "ok"}
