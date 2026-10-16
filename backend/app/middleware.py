"""Pure-ASGI middleware (no BaseHTTPMiddleware: it buffers bodies and adds latency).

* BodyLimit      – rejects oversized requests before they are parsed or spooled to disk.
* SecureHeaders  – security + cache headers, request id and one access-log line per request.
"""
import logging
import time
import uuid

from fastapi import HTTPException

from .config import settings

log = logging.getLogger("app.access")

_PRIVATE = ("/api/auth", "/api/orders", "/api/quotes")
_UPLOAD = "/api/quotes/analyze"
_MULTIPART_SLACK = 16 * 1024  # form framing around the file


async def _send_413(send) -> None:
    body = b'{"detail":"payload_too_large"}'
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()), (b"connection", b"close")]})
    await send({"type": "http.response.body", "body": body})


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            return await self.app(scope, receive, send)
        limit = (settings.max_upload_mb * 1024 * 1024 + _MULTIPART_SLACK) if scope["path"] == _UPLOAD \
            else settings.max_json_kb * 1024
        declared = dict(scope["headers"]).get(b"content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            return await _send_413(send)

        seen = 0

        async def counting_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > limit:  # chunked body with no / lying Content-Length
                    # fastapi's HTTPException passes through FastAPI's body-parsing
                    # try/except untouched (anything else becomes a generic 400).
                    raise HTTPException(413, "payload_too_large")
            return msg

        await self.app(scope, counting_receive, send)


class SecureHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        rid = uuid.uuid4().hex[:16]
        scope.setdefault("state", {})["request_id"] = rid
        path, method = scope["path"], scope["method"]
        t0 = time.perf_counter()
        status_code = 500

        async def wrapped(msg):
            nonlocal status_code
            if msg["type"] == "http.response.start":
                status_code = msg["status"]
                h = msg.setdefault("headers", [])
                h += [
                    (b"x-request-id", rid.encode()),
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                ]
                if scope.get("scheme") == "https":
                    h.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                if path.startswith(_PRIVATE):
                    h.append((b"cache-control", b"no-store"))
                elif method == "GET" and status_code == 200 and path.startswith("/api/") and path != "/api/health":
                    h.append((b"cache-control", b"public, max-age=60"))
            await send(msg)

        try:
            await self.app(scope, receive, wrapped)
        finally:
            log.info("%s %s %s %.1fms rid=%s", method, path, status_code,
                     (time.perf_counter() - t0) * 1000, rid)
