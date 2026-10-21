# Backend image: multi-stage, non-root, safe to run with a read-only root filesystem.
#
# Base images are pinned by tag only. Pin the digest as well
# (python:3.12-slim-bookworm@sha256:<digest>) in CI with Renovate or Dependabot's
# docker ecosystem (see .github/dependabot.yml); never hand-write a digest.

# ---- builder: resolve and install dependencies into a self-contained venv ----------
FROM python:3.12-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

# requirements.txt is fully pinned (==) but has no hashes, so --require-hashes is not
# possible yet. Upgrade pip first, install, then drop pip/setuptools/wheel from the venv
# so the runtime image carries no package installer.
COPY requirements.txt .
# hadolint ignore=DL3013
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt \
 && pip uninstall -y pip setuptools wheel

# ---- runtime: interpreter + venv + app code, nothing else -------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH

# The base image's own pip carries advisories and is not needed at runtime.
# uid/gid 10001: no login shell, no home directory. Only /app/data is writable (SQLite WAL).
RUN /usr/local/bin/python -m pip uninstall -y pip setuptools wheel \
 && groupadd --gid 10001 app \
 && useradd --uid 10001 --gid app --no-create-home --home-dir /nonexistent \
            --shell /usr/sbin/nologin app \
 && mkdir -p /app/data \
 && chown 10001:10001 /app/data

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY app ./app
# Precompile once at build time: PYTHONDONTWRITEBYTECODE=1 would otherwise recompile on every start.
RUN python -m compileall -q /app/app

USER 10001:10001
EXPOSE 8000

# python + urllib: no curl in the image. urlopen raises on non-2xx, so a failure exits non-zero.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

# Exec form so uvicorn is PID 1 and gets SIGTERM. Behind a reverse proxy, set the
# FORWARDED_ALLOW_IPS env var to the proxy address: uvicorn reads it for X-Forwarded-For.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
