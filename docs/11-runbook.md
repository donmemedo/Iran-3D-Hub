# 3D Hub Iran: runbook

How to run and operate the stack at commit `47ba9b9`. Checked against the code and compose file on 2026-10-22.

**Not executed in this pass.** No container, server or build was started while writing this document. File and line references were read from the code. Shell and Python snippets are assembled from the repository's own files (`Makefile`, `.env.example`, `README.md`, `docker-compose.yml`, `tests/conftest.py`) and the Python standard library; run them first on a throw-away volume.

Related: [implementation report](00-implementation-report.md) (configuration table in section 6), [architecture](01-architecture.md), [index](README.md).

## Quick reference

| Item | Value | Source |
|---|---|---|
| Frontend | `http://localhost:3560` (container port 3000) | `docker-compose.yml:79` |
| API | `http://localhost:8400` (container port 8000); health at `/api/health` | `docker-compose.yml:52` |
| Published ports bind to | `127.0.0.1` unless `BIND` is set | `docker-compose.yml:52,79` |
| Persistent data | named volume `backend-data` mounted at `/app/data` (SQLite file `hub3d.db` plus `-wal` and `-shm`) | `docker-compose.yml:47-48,88-89` |
| Secret generator | `make secret`, which runs `openssl rand -hex 32` | `Makefile:9` |
| Backend limits | 512 MB RAM and swap, 1 CPU, 128 processes | `docker-compose.yml:59-62` |
| Frontend limits | 512 MB RAM and swap, 1 CPU, 256 processes | `docker-compose.yml:83-86` |
| Container logs | json-file, at most 3 files of 10 MB per container | `docker-compose.yml:24-28` |
| API docs | `/docs` and `/openapi.json` exist only with `DEV=true` | `main.py:32-34` |

## Generate secrets

`JWT_SECRET` is the only secret. It signs login tokens directly and signed price quotes through a derived key (`security.py:87-88`). The app refuses to start outside `DEV=true` if it is empty, shorter than 32 characters, or one of four known weak values (`config.py:6-11,40-49`).

```bash
openssl rand -hex 32          # 64 hex characters; same as: make secret
```

Rules:

- One secret per environment. Never reuse a value between development, staging and production.
- Keep it in the git-ignored `.env` (`.gitignore` ignores `.env*` except `.env.example`), or in the platform's secret store. `.gitleaks.toml` has a rule that flags a committed 32-character `JWT_SECRET` value.
- Passwords are not hashed with this secret (scrypt uses a random salt per password), so rotating it never touches stored passwords.

## First run

1. Create the environment file and fill in the secret (command from `.env.example:2`):

   ```bash
   cp .env.example .env
   sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
   ```

2. Start. Compose refuses to start with an empty secret (`docker-compose.yml:37`):

   ```bash
   docker compose up --build -d
   docker compose ps                       # backend must become "healthy"; frontend waits for it
   curl -s http://localhost:8400/api/health    # {"status":"ok"}
   curl -s http://localhost:8400/api/materials | head -c 200   # reads the database
   ```

3. On an empty database the backend seeds 8 materials, 8 hubs and 5 reviews at start (`seed.py:79-101`). No users are created unless `DEV` or `SEED_DEMO` is true.
4. Open `http://localhost:3560`, register an account, then confirm `http://localhost:8400/docs` answers 404.
5. **Create the first admin.** Nothing in the API grants the `admin` role and registration always creates `maker`. Only an admin can move orders forward (`orders.py:110-112`), so promote one account by editing the database. The email is stored lower-case (`schemas.py:10`). The role is read from the database on every request, so the change applies at once (`security.py:143-147`); reload the page so the dashboard shows the admin buttons.

   ```bash
   docker compose exec -T backend python - <<'PY'
   import sqlite3
   c = sqlite3.connect("/app/data/hub3d.db")
   n = c.execute('UPDATE "user" SET role = ? WHERE email = ?', ("admin", "you@example.com")).rowcount
   c.commit()
   print("rows updated:", n)
   PY
   ```

Running without Docker (development), from `README.md`:

```bash
cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env     # set JWT_SECRET, or DEV=true for local use only
./.venv/bin/python -m uvicorn app.main:app --reload --port 8400
cd ../frontend && npm ci && NEXT_PUBLIC_API_BASE=http://localhost:8400 npm run dev -- -p 3560
```

Tests: `make test` (or `cd backend && python -m pytest`). The suite runs the real app in process, needs no server, and is CPU-heavy because it performs real password hashing. The only recorded duration is for the run against the original code, 361.37 s (`evidence/baseline-original-code.txt`); none is recorded for the fixed code.

## Demo mode

```bash
SEED_DEMO=true NEXT_PUBLIC_DEMO=1 docker compose up --build
```

This creates `demo@3dhub.ir` with password `demo1234` and shows a "log in with demo account" button on the login page (`seed.py:96-100`, `login/page.tsx:13,148`). `NEXT_PUBLIC_DEMO` is inlined at build time, hence `--build`.

**Never use demo mode in production.**

- The credential is published in the README and in the compose header, so anyone can log in as that user and place orders in its name.
- The button is compiled into the public JavaScript bundle.
- `DEV=true` also creates the demo user (`seed.py:97`) and additionally enables `/docs`, accepts any localhost origin in CORS, and generates a random secret per process when `JWT_SECRET` is empty or weak.
- Seeding only adds. Switching `SEED_DEMO` off later does not delete the account, so a database that ever ran in demo mode still holds it. Remove it before going live. With foreign keys on, the delete fails instead of orphaning rows if the account already has orders, quotes or reviews; in that case start production from a fresh volume.

  ```bash
  docker compose exec -T backend python - <<'PY'
  import sqlite3
  c = sqlite3.connect("/app/data/hub3d.db")
  c.execute("PRAGMA foreign_keys=ON")
  print(c.execute('DELETE FROM "user" WHERE email = ?', ("demo@3dhub.ir",)).rowcount, "row(s) deleted")
  c.commit()
  PY
  ```

## Reverse proxy

Compose does not terminate TLS. Put a TLS proxy in front of both containers and keep the published ports on loopback (`BIND=127.0.0.1`, the default) when the proxy runs on the same host.

| Setting | Why |
|---|---|
| `CORS_ORIGINS` | Exact public origin of the frontend, with scheme and port, comma-separated. The API is a different origin from the frontend by default, and a mismatch shows up in the UI as a network error (`main.py:39-49`). |
| `NEXT_PUBLIC_API_BASE` | Public URL of the API as the browser sees it. It is inlined at build time and also narrows the CSP `connect-src` (`next.config.ts:5-12,28`). Change it, then rebuild the frontend with `docker compose up --build`. |
| `FORWARDED_ALLOW_IPS` | Address of the proxy as the backend sees it; see below. |
| Body size | Allow at least 60 MiB plus framing on `/api/quotes/analyze`. For nginx use `client_max_body_size 61m;`; nginx's default is 1 MB, which rejects model uploads. A proxy 413 without a JSON body is still mapped to the right message by the frontend (`api.ts:35`). |
| Timeouts | The browser gives uploads 60 s and other calls 20 s (`api.ts:5-6`). Set the proxy read timeout to at least 60 s. |
| Forwarded headers | Send `X-Forwarded-For` and `X-Forwarded-Proto`. With the second, uvicorn sets the request scheme to `https`, which is the only condition under which the API adds `Strict-Transport-Security` (`middleware.py:83-84`). |

An illustrative nginx fragment for the API origin (untested; adapt names and certificates):

```nginx
server {
  listen 443 ssl;
  server_name api.example.com;
  client_max_body_size 61m;
  location / {
    proxy_pass http://127.0.0.1:8400;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 90s;
  }
}
```

**`FORWARDED_ALLOW_IPS`.** Every limiter keys on the client address (`ratelimit.py:55-56`), and uvicorn rewrites that address from `X-Forwarded-For` only for peers in this list. Compose passes `127.0.0.1` by default (`docker-compose.yml:46`); uvicorn's own default is `127.0.0.1,::1`. It accepts comma-separated addresses and CIDR networks.

- Too narrow: the proxy is not trusted, every user appears with the proxy's address and shares one bucket. Ten login attempts per minute then apply to all users together.
- `*`: uvicorn trusts the first address in the header, so any client can send a forged `X-Forwarded-For` and dodge every limit. Never use it on a port a client can reach.
- The peer address the container sees depends on how the proxy connects. Through a published port it is usually the Docker bridge gateway, not `127.0.0.1`. Do not assume; check. After a deliberate failed login through the proxy, read the audit line `login_failed ip=...` (`auth.py:51`). It shows exactly the address the limiter uses. It must be your real client address; if it is the proxy's, add the proxy's address or its network to `FORWARDED_ALLOW_IPS` and recreate the backend.

**HSTS.** The frontend sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response (`next.config.ts:56`); browsers ignore it over plain HTTP. `includeSubDomains` with a one-year lifetime commits every subdomain of the host to HTTPS, so confirm that all of them support TLS before the first deployment. There is no `preload` directive.

## Backups

The database is SQLite in WAL mode, so a running system has three files: `hub3d.db`, `hub3d.db-wal` and `hub3d.db-shm`. Copying only `hub3d.db` from a live system can lose recent commits or give an inconsistent file. Use one of:

- **Online copy with SQLite's backup API** (standard library; safe while the app runs):

  ```bash
  docker compose exec -T backend python - <<'PY'
  import sqlite3
  src = sqlite3.connect("/app/data/hub3d.db")
  dst = sqlite3.connect("/app/data/backup.db")
  src.backup(dst)
  dst.close(); src.close()
  PY
  docker compose cp backend:/app/data/backup.db "./hub3d-$(date +%F).db"
  docker compose exec -T backend rm /app/data/backup.db
  ```

- **Cold copy:** `docker compose stop backend`, copy all three files from the volume, `docker compose start backend`.

The backup holds password hashes, addresses and order data. Store it encrypted, off the host, and decide a retention period; none is configured. Test a restore before relying on it:

```bash
docker compose stop backend
docker run --rm -v <project>_backend-data:/data -v "$PWD":/in busybox sh -c \
  'cp /in/hub3d-YYYY-MM-DD.db /data/hub3d.db && rm -f /data/hub3d.db-wal /data/hub3d.db-shm && chown 10001:10001 /data/hub3d.db'
docker compose start backend
```

`<project>_backend-data` is the volume name from `docker volume ls`. The `chown` matters: the backend runs as uid 10001 (`backend/Dockerfile:35-39,48`) and cannot write a root-owned file. The same cause applies to a volume created by an older root-running image (`README.md`, "Upgrading from an older checkout"). Deleting the stale `-wal` and `-shm` files before the restore avoids replaying an old log on top of the restored file. The app runs `init_db()` and `seed()` on every start; both are idempotent (`main.py:19-23`).

## Key rotation

Rotating `JWT_SECRET` has these effects, all at once, because the app holds a single secret and has no overlap period:

| Effect | What users see |
|---|---|
| Every login token becomes invalid | next request answers `401 invalid_token`; `api.ts` clears the token and fires the logout event (`api.ts:78-81`); the user logs in again |
| Every outstanding signed quote becomes invalid, because the quote key is derived from the secret (`security.py:87-88`) | `400 invalid_quote` when ordering; the quote page prices again automatically (`quote/page.tsx:208-209`) |
| Stored passwords, orders and data | unchanged |

Procedure:

1. Generate a new value (`openssl rand -hex 32`).
2. Replace `JWT_SECRET` in `.env` or the secret store.
3. Recreate the backend so it reads the new value: `docker compose up -d backend`.
4. Check that a fresh login works and that an old token now gets `401`.

Do it in a quiet period. After a suspected leak of the secret, rotate at once: until then anyone holding it can mint valid admin tokens and price quotes. Changing `JWT_ISSUER` also invalidates every token (`security.py:118`, `config.py:24`). There is no revocation for a single user: the options are rotating the secret (everyone) or deleting that user's row.

## Upgrading dependencies

Backend pins are exact in `backend/requirements.txt` (no hashes). `starlette` is not pinned directly; it comes in through `fastapi`, so check the resolved version after a FastAPI bump.

```bash
cd backend
# edit requirements.txt
./.venv/bin/pip install -r requirements-dev.txt
make test        # in-process regression suite
make audit       # bandit, pip-audit, and npm audit for the frontend
docker compose build backend
```

Frontend, from `frontend/`:

```bash
# edit package.json, then refresh the lockfile
npm install
npm audit --omit=dev --audit-level=high
NEXT_PUBLIC_API_BASE=http://localhost:8400 npm run build    # also type-checks
```

Notes:

- CI repeats these checks on every pull request (`.github/workflows/ci.yml`): pytest, bandit, pip-audit, `npm audit --omit=dev --audit-level=high`, `next build`, and per image hadolint, Trivy (HIGH and CRITICAL with a fix available) and a Syft SBOM. `security.yml` adds gitleaks, Semgrep, CodeQL and dependency review. Dependabot opens weekly updates for pip, npm, both Dockerfiles and GitHub Actions (`.github/dependabot.yml`).
- The last scan on record (OSV, 2026-10-16) found advisories only in `pip 24.0`, which is build tooling removed from the runtime image (`evidence/dependency-and-sast.txt`).
- There are no migrations. A SQLModel or SQLAlchemy upgrade does not alter existing tables; schema changes are hand-written statements in `db.py:35-54`.
- After any rebuild, check `docker compose ps` for `healthy`, then log in and request a quote.

## Logs and incident basics

All application logs go to the container's stdout and stderr, so `docker compose logs` shows them. Format: `%(asctime)s %(levelname)s %(name)s %(message)s` (`main.py:15`). Docker keeps at most 3 files of 10 MB per container, so older lines rotate away: copy logs early in an incident.

| Logger | Lines | Source |
|---|---|---|
| `app.access` | `METHOD /path STATUS 12.3ms rid=<id>`: one per request; path only, no query string, no client address, no user | `middleware.py:94` |
| `app.audit` | `register user=<id>`; `login_failed ip=<ip>` (warning); `order_created order=<id> user=<id> amount=<n>`; `order_advanced order=<id> admin=<id> status=<s>`; `order_canceled order=<id> user=<id>` | `auth.py:32,51`, `orders.py:55,119,131` |
| `app` | `unhandled error rid=<id>` with the traceback | `main.py:67` |
| `app.db` | `index upgrade skipped: <statement>` at start | `db.py:54` |
| `uvicorn.*` | server lifecycle and uvicorn's own access line | uvicorn default (`access_log` on) |

Not logged: successful logins (only registrations and failures), the client address on the access line, and the user on the access line. There is no metrics endpoint and no tracing.

**Request id.** Every normal response carries `X-Request-ID`, and the same id ends the access line. A `500 internal_error` carries `request_id` in its JSON body; search the logs for it to find the traceback: `docker compose logs backend | grep <id>`. The 500 answer has no `X-Request-ID` header, no security headers and no CORS headers (verified in-process, [report section 10, item 17](00-implementation-report.md#10-points-found-while-writing-this-report)), so a browser on another origin will usually show a network error instead of reading it.

**First steps in an incident.**

1. Copy the logs: `docker compose logs --no-color --since 2h backend > backend.log`.
2. Take a database backup (section above) before changing anything.
3. Look for patterns: bursts of `login_failed` and `429` access lines (credential guessing), `unhandled error` (bugs or hostile input), `order_created` volume (abuse), unexpected `order_advanced` (only admins can do it).
4. Contain: block the address at the proxy, or `docker compose stop backend` (data stays on the volume), or rotate `JWT_SECRET` to sign everyone out.
5. Recover, then write down what happened and what control was missing.

## Health checks

| Check | Where | What it proves |
|---|---|---|
| Backend `GET /api/health` returns `{"status":"ok"}` | compose healthcheck: every 15 s, timeout 5 s, 5 retries, 10 s start period (`docker-compose.yml:53-58`); image check in `backend/Dockerfile:52-53` | the process answers; **it does not touch the database** (`main.py:72-74`) |
| Frontend `GET /` on port 3000 | `frontend/Dockerfile:55-56` | the Node server answers |
| Frontend waits for a healthy backend | `depends_on: service_healthy` (`docker-compose.yml:80-82`) | start order only |

Because health skips the database, add an external probe that reads it, for example `GET /api/materials?technology=FDM` (uncached, one query), alongside `/api/health`.

## Resource limits and sizing

| Limit | Value | Source |
|---|---|---|
| Backend memory, CPU, processes | 512 MB (no extra swap), 1.0 CPU, 128 | `docker-compose.yml:59-62` |
| Frontend memory, CPU, processes | 512 MB, 1.0 CPU, 256 | `docker-compose.yml:83-86` |
| Backend `/tmp` (multipart spool) | 128 MB tmpfs, `noexec` | `docker-compose.yml:49-50` |
| Frontend tmpfs | `/tmp` 16 MB, `/app/.next/cache` 64 MB | `docker-compose.yml:75-77` |
| Concurrent password hashes | 4 (32 MiB each) | `security.py:20,23` |
| Concurrent mesh parses | 2, then `503 busy` | `quotes.py:22,119-120` |
| Mesh size | 250,000 triangles | `geometry.py:23` |
| Request bodies | 64 KB JSON, 60 MB upload | `config.py:31-32` |

Peak memory of two parallel parses at the triangle cap, and of several concurrent 60 MB uploads against the 128 MB spool, were not measured. If the backend is killed for memory, lower `MAX_PARALLEL_PARSES` or raise the memory limit and measure again. Compose forwards only 9 of the 18 backend settings (`docker-compose.yml:36-46`). To change another one, such as `MAX_PARALLEL_PARSES`, add it to the `environment:` block (for example `MAX_PARALLEL_PARSES: ${MAX_PARALLEL_PARSES:-2}`) and recreate the container.

The API runs one uvicorn worker, and rate limits and the stats cache live in that process. Do not add workers or replicas without moving the limiter first ([ADR-3](01-architecture.md#adr-3-in-process-rate-limiter-and-its-ceiling)). Do not run two backend containers on one SQLite volume ([ADR-4](01-architecture.md#adr-4-sqlite-in-wal-mode-and-the-path-to-postgres)).

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| Backend restarts in a loop; log shows `RuntimeError: JWT_SECRET must be set to a random value of at least 32 characters` | `JWT_SECRET` empty, under 32 characters, or a known weak value, with `DEV` off (`config.py:40-47`) | set a strong value (`openssl rand -hex 32`) and recreate. Compose itself stops earlier with `set JWT_SECRET (openssl rand -hex 32)` when it is empty |
| `401 invalid_token` for every user at once | secret rotated, `JWT_ISSUER` changed, or `DEV=true` restarted (random secret per process) | users log in again; see Key rotation |
| `401 invalid_credentials` | wrong password or unknown email; the two are indistinguishable by design | none |
| `429 too_many_requests` on login or register, `Retry-After: 60` | more than 10 attempts per minute from one address (login and register share the bucket) | wait; raise `LOGIN_RATE_LIMIT` only with a reason |
| `429 too_many_requests` on login, `Retry-After: 600` | 10 failures for one email within 10 minutes; also blocks the right password | wait up to 10 minutes |
| `429` for many unrelated users | the limiter sees one address for everyone | fix `FORWARDED_ALLOW_IPS` (Reverse proxy section) |
| `429` on `/api/quotes/analyze`, `Retry-After: 60` | more than 30 analyses per minute from one address | wait; `ANALYZE_PER_MINUTE` needs a compose edit |
| `429` on `POST /api/orders`, `Retry-After: 3600` | more than 60 orders per hour for one user | wait or raise `ORDERS_PER_HOUR` |
| `503 busy`, `Retry-After: 2` | two mesh parses already running | retry; parsing a large mesh can hold a slot for a long time (a 90,000-triangle, 8.5 MB upload took 21.00 s on a heavily loaded machine) |
| `413 payload_too_large` | JSON body over 64 KB, or an upload request over 60 MiB plus 16 KiB, or a proxy limit | check `client_max_body_size` and `MAX_UPLOAD_MB` |
| `413 file_too_large` | the file is over `MAX_UPLOAD_MB`; the UI also checks 60 MB first (`quote/page.tsx:176`) | upload a smaller file. Raising `MAX_UPLOAD_MB` also needs frontend changes, which hard-code 60 MB (`quote/page.tsx:34`) |
| `422 unsupported_file_type` | extension is not `.stl .obj .step .stp .iges .igs .3mf` (`quotes.py:23`) | convert the file |
| `422 volume_out_of_range` | volume above 100,000 cm3 | split the part |
| `400 invalid_quote` when ordering | quote older than 24 h, altered, or secret rotated | price again; the UI does this automatically |
| `409 order_changed` | the order changed between page load and click | refresh |
| `403 forbidden` on `/advance` | caller is not an admin | promote the account (First run, step 5) |
| `404 order_not_found` | wrong id, or an order that belongs to another user (the two look the same) | none |
| `500 internal_error` with a `request_id` | unhandled exception | grep the logs for the id (Logs section) |
| UI shows the network message on every call | `CORS_ORIGINS` does not match the page origin exactly, or `NEXT_PUBLIC_API_BASE` in the built bundle points elsewhere | fix the value; rebuild the frontend for the second case. The browser console names the blocked origin |
| `sqlite3.OperationalError: database is locked` | another process writes the same file, or a long transaction; the app waits 5 s (`db.py:28`) | run one backend per volume; keep the volume on local disk |
| Permission errors writing under `/app/data` | volume created by an older root-running image | `docker run --rm -v <project>_backend-data:/data busybox chown -R 10001:10001 /data` (from `README.md`) |

## Before exposing it to the internet

- `JWT_SECRET` is unique, 32 or more characters, and not stored in git.
- `DEV=false`, `SEED_DEMO=false`, `NEXT_PUBLIC_DEMO` empty, and no demo user in the database.
- `CORS_ORIGINS` and `NEXT_PUBLIC_API_BASE` hold the real public origins, and the frontend was rebuilt.
- TLS terminates at the proxy, `FORWARDED_ALLOW_IPS` is verified with a `login_failed ip=` line, and `BIND` stays `127.0.0.1` unless the proxy is on another host.
- A backup runs on a schedule and a restore has been tested.
- `/docs` answers 404.
- Known gaps remain open (report section 9): there is no payment gateway, so orders only move when an admin advances them; there is no email verification or password reset; tokens cannot be revoked; `/privacy` and `/terms` are working drafts that say they have not been reviewed by counsel.
