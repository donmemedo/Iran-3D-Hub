<div dir="rtl">

# هاب سه‌بعدی ایران — 3D Hub Iran

بازارگاه آنلاین سفارش چاپ سه‌بعدی و ساخت افزایشی؛ ساخته‌شده بر پایه مدل کسب‌وکار **3D Hubs** و بومی‌سازی‌شده برای بازار ایران (بر اساس `56_3D_Hubs.pdf` و `56-Business-plan-toolkit_3D-Hubs_Iran_filled.pdf` در همین پوشه).

</div>

---

## What it is

A two-sided marketplace that unlocks idle 3D-printing capacity: makers and companies upload a
model, get a **transparent instant price** and lead time, and the job is matched to the nearest
verified workshop. The platform takes a **15% fee per completed order**, the 3D Hubs model from
the source business plan, localised for Iran (Toman pricing, Persian-first UI, in-city delivery).

## Stack

| | |
|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · three.js |
| **Backend** | FastAPI · SQLModel · SQLite in WAL mode (swap `DATABASE_URL` for Postgres) · JWT auth |
| **Languages** | فارسی (RTL) + English (LTR), switchable live; wording follows the [Persian UX-writing vocabulary](https://github.com/Aylarrazzaghi/Persian-vocabulary-in-UXwriting) |
| **Fonts** | Vazirmatn, self-hosted (no third-party font requests) |
| **Runtime** | Two hardened containers (non-root, read-only root filesystem), `docker compose` |

## Highlights

- **Real geometry, not a guess.** Uploaded STL/OBJ files are parsed server-side in pure Python and
  the volume is computed with a signed-tetrahedron sum (a 30 mm cube returns exactly `27.0 cm³`).
  STEP/IGES/3MF fall back to a flagged estimate for engineer review.
- **Live 3D preview.** Your own uploaded mesh renders in the browser (three.js) and can be grabbed and spun.
- **Instant quoting engine.** Material cost + machine time + quality multiplier + quantity breaks,
  with the 15% platform fee always shown separately.
- **Signed quotes.** The server signs the computed price (valid 24 h). Nothing is stored until an
  order is placed with that token, so anonymous traffic cannot grow the database and a client cannot change a price.
- **Producer matching.** Scores the network on technology, material, build volume, rating, workload and city proximity.
- **Order flow.** `pending_payment → in_production → quality_check → shipped → delivered` (or `canceled`).
- **PWA layer.** Manifest, icons and an offline app-shell service worker.

## Quick start (Docker)

```bash
export JWT_SECRET=$(openssl rand -hex 32)     # required; compose refuses to start without it
docker compose up --build
```

- Frontend: <http://localhost:3560>
- API health: <http://localhost:8400/api/health>
- Ports bind to `127.0.0.1` by default, so the stack is not reachable from your LAN.

Put the secret in a git-ignored `.env` to avoid exporting it every time: `cp .env.example .env`, then `make secret` and paste the value.

**Demo mode** (public demo account `demo@3dhub.ir` / `demo1234` and the demo button on the login page). Demos only, never production:

```bash
SEED_DEMO=true NEXT_PUBLIC_DEMO=1 docker compose up --build
```

`NEXT_PUBLIC_*` values are baked into the frontend at build time, so changing them needs `--build`.

**Going beyond localhost:** terminate TLS in a reverse proxy, set `CORS_ORIGINS` and `NEXT_PUBLIC_API_BASE`
to the public origins, set `FORWARDED_ALLOW_IPS` to the proxy address, then `BIND=0.0.0.0` if the proxy is on another host.

**Upgrading from an older checkout:** the backend used to run as root. A volume created back then is owned by root, and the
non-root container (uid 10001) cannot write to it. Fix once:
`docker run --rm -v <project>_backend-data:/data busybox chown -R 10001:10001 /data` (list volumes with `docker volume ls`).

## Local development

```bash
# Backend (terminal 1)
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env            # then set JWT_SECRET (make secret), or DEV=true for local use only
./.venv/bin/python -m uvicorn app.main:app --reload --port 8400

# Frontend (terminal 2)
cd frontend
npm ci
NEXT_PUBLIC_API_BASE=http://localhost:8400 npm run dev -- -p 3560
```

With `DEV=true` the API serves `/docs`, accepts any localhost CORS origin and generates a random per-process secret
(tokens die on restart). Add `SEED_DEMO=true` (backend) and `NEXT_PUBLIC_DEMO=1` (frontend) for the demo account.

> Ports 3560/8400 are used because 3000/8000 were already taken on the author's machine; change them in
> `docker-compose.yml` and `NEXT_PUBLIC_API_BASE` if you prefer the defaults.

## Configuration

Backend settings are read from the environment (and `backend/.env`). `.env.example` (repo root, used by compose) and
`backend/.env.example` list them with comments.

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | none, **required** | Signs login tokens and price quotes. At least 32 characters; the API refuses to start otherwise (unless `DEV=true`). Compose refuses to start without it. |
| `DEV` | `false` | Enables `/docs` + `/openapi.json`, any-localhost CORS and a random secret. Local development only. |
| `SEED_DEMO` | `false` | Creates `demo@3dhub.ir` / `demo1234`. Never in production. |
| `DATABASE_URL` | `sqlite:///./data/hub3d.db` | SQLAlchemy URL (compose: SQLite file on the `backend-data` volume). |
| `CORS_ORIGINS` | `http://localhost:3560` (compose) | Comma-separated exact origins allowed to call the API. |
| `PLATFORM_COMMISSION` | `0.15` | Platform fee per order. |
| `MAX_UPLOAD_MB` / `MAX_JSON_KB` | `60` / `64` | Request body limits (uploads / JSON). |
| `LOGIN_RATE_LIMIT` | `10` | Login + register attempts per IP per window (`LOGIN_RATE_WINDOW_S`, 60 s). |
| `ORDERS_PER_HOUR` | `60` | Orders per user per hour. |
| `ANALYZE_PER_MINUTE` / `MAX_PARALLEL_PARSES` | `30` / `2` | Upload analyses per IP per minute / concurrent mesh parses. |
| `JWT_EXPIRE_MINUTES` / `QUOTE_TTL_MINUTES` | `1440` / `1440` | Login-token and signed-quote lifetime. |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | Proxy addresses uvicorn trusts for `X-Forwarded-For` (client IP for rate limits). Never `*` on an exposed port. |
| `BIND` | `127.0.0.1` | Compose only: interface the published ports bind to. |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8400` | Frontend build time: public API URL (also narrows the CSP `connect-src`). |
| `NEXT_PUBLIC_DEMO` | empty | Frontend build time: `1` shows the demo-login button. |

## Security model

What is enforced, and where. Backend fixes are covered by the regression suite in `backend/tests/test_security.py`.

| Control | Where |
|---|---|
| Refuse to start with a missing, short (< 32) or known-default `JWT_SECRET` | `backend/app/config.py` |
| Passwords hashed with scrypt (N=2^15); legacy hashes upgraded at login; unknown emails cost the same CPU | `backend/app/security.py`, `routers/auth.py` |
| JWTs: fixed algorithm allow-list, `iss`/`exp`/`typ` required; role read from the database, not the token | `backend/app/security.py` |
| Signed 24 h price quotes with a separate derived key; no row written until an order | `security.py`, `routers/quotes.py`, `routers/orders.py` |
| Object-level access: orders readable/cancellable by their owner only; `advance` is admin only | `backend/app/routers/orders.py` |
| Rate limits: login/register per IP, uploads per IP, orders per user; parse concurrency cap | `backend/app/ratelimit.py`, routers |
| Body limits before parsing, extension allow-list, triangle cap, sanitised filenames | `backend/app/middleware.py`, `routers/quotes.py`, `geometry.py` |
| API headers (`nosniff`, CSP `default-src 'none'`, `no-store` on auth/orders/quotes, HSTS over HTTPS); validation errors never echo input; stable error codes | `backend/app/middleware.py`, `main.py` |
| CORS allow-list, no credentials, `GET/POST/OPTIONS` only; `/docs` off unless `DEV` | `backend/app/main.py` |
| Frontend CSP and security headers, self-hosted fonts, long-lived cache for static assets | `frontend/next.config.ts` |
| Containers: pinned base tags, multi-stage, non-root uid, no shell/home, pip removed from runtime, healthchecks | `backend/Dockerfile`, `frontend/Dockerfile` |
| Runtime: read-only root fs, `cap_drop: ALL`, `no-new-privileges`, tmpfs for temp paths, pids/memory/CPU limits, loopback-only ports, bounded logs | `docker-compose.yml` |
| Build context excludes `.env*`, databases, `node_modules`, tests | `backend/.dockerignore`, `frontend/.dockerignore` |
| Secret and repo guardrails | `.gitignore`, `.gitleaks.toml`, `.semgrep.yml` |

Known limits: the login token lives in `localStorage` (it is only read and written in `frontend/src/lib/api.ts`, and a
Semgrep rule enforces that); there is no refresh or revocation yet; the CSP keeps `'unsafe-inline'` for scripts
(see the note in `next.config.ts`); rate limits are per process; compose does not terminate TLS.

## Testing

```bash
cd backend && python -m pytest        # uses backend/pytest.ini (-q); needs requirements-dev.txt
make test                             # same, via the backend venv
```

The suite runs **in-process** against the real ASGI app on a throw-away SQLite file: no server, no network, no ports.
It is CPU-heavy on a loaded machine because it exercises real password hashing.

## CI and security pipeline

All workflows use least-privilege `permissions`, cancel superseded runs, and pin actions to a version tag.

| Workflow | What runs |
|---|---|
| `.github/workflows/ci.yml` | **backend**: pytest, `bandit -r backend/app -ll`, `pip-audit`. **frontend**: `npm ci`, `npm audit --omit=dev --audit-level=high`, `next build`. **docker** (per image): hadolint, buildx build, Trivy (HIGH/CRITICAL, unfixed ignored, fails the job), Syft CycloneDX SBOM uploaded as an artifact. |
| `.github/workflows/security.yml` | gitleaks over full history, Semgrep (`.semgrep.yml` + `p/owasp-top-ten`), CodeQL (Python, JavaScript/TypeScript), dependency review on PRs, weekly schedule. |
| `.github/dependabot.yml` | Weekly updates: pip, npm, both Dockerfiles, GitHub Actions. |

Locally: `make audit` (bandit, pip-audit, npm audit), `semgrep scan --config .semgrep.yml --error .`. Container images are built
and hardened in CI; the compose hardening has not been exercised by the pipeline itself.

## Project layout

```
backend/
  app/
    main.py          FastAPI app, CORS, middleware, startup seed
    config.py        settings + JWT_SECRET guard
    middleware.py    body limits, security headers, access log
    ratelimit.py     in-process sliding-window limits
    security.py      scrypt hashing, JWT, signed quotes, roles
    geometry.py      STL/OBJ parsers, volume and bounding box
    pricing.py       instant-quote engine (Toman)
    models.py        User · Hub · Material · Quote · Order · Review
    seed.py          verified hubs and materials (+ demo user when SEED_DEMO)
    routers/         auth · catalog · quotes · orders
  tests/             in-process regression suite
  Dockerfile  pytest.ini  requirements*.txt  .env.example
frontend/
  src/app/           landing · /quote · /hubs · /dashboard · /login · /privacy · /terms
  src/components/    Providers (theme+i18n+auth) · Header · Hero3D · StlViewer · SwRegister · ...
  src/lib/           api client (the only token access) · i18n dictionary (fa/en) · formatting
  public/            manifest.webmanifest · sw.js · icons · fonts
  Dockerfile  next.config.ts
docs/                project documentation: start at docs/README.md
.github/             workflows (ci, security) and dependabot
docker-compose.yml  .env.example  .semgrep.yml  .gitleaks.toml  Makefile
```

More documentation lives in [docs/README.md](docs/README.md).

## API surface

Errors are JSON `{"detail": "<code>"}` (validation: `{"detail":"validation_error","errors":[{loc,type}]}`).
Authenticated calls send `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` · `/api/auth/login` | returns `{token, user}`; rate limited |
| `GET` | `/api/auth/me` | current user |
| `GET` | `/api/materials` `/technologies` `/cities` `/qualities` | catalogue (cacheable 60 s) |
| `GET` | `/api/hubs` `?city&technology&material&q&sort` · `/api/hubs/{id}` | network search, hub detail + reviews |
| `POST` | `/api/quotes/analyze` | upload a model: mesh stats, price, matches, signed `public_id` |
| `POST` | `/api/quotes/manual` | quote from an approximate volume |
| `POST` `GET` | `/api/orders` | place (needs a quote token) / list your orders |
| `GET` | `/api/orders/{public_id}` | one of your orders |
| `POST` | `/api/orders/{public_id}/cancel` | owner only; not after shipping |
| `POST` | `/api/orders/{public_id}/advance` | **admin only**: moves the production flow |
| `POST` | `/api/orders/reviews` | add a review for an order |
| `GET` | `/api/stats` · `/api/health` | network KPIs · liveness |

Interactive docs exist only with `DEV=true` (`/docs`).

## Roadmap pointers

None of these exist yet; they are the next steps the code is shaped for.

- **Payments.** Orders start at `pending_payment` and there is no gateway; today an admin moves them along.
- **Producer console.** Hubs cannot yet accept or advance their own jobs; `advance` stays admin-only until they can.
- **App stores.** Only the PWA layer ships. An APK (Bubblewrap/TWA or Capacitor) and an IPA (Capacitor iOS) are not built.
- **Scale-out.** Postgres + migrations, shared rate limits, cookie-based sessions with refresh, nonce-based CSP.
