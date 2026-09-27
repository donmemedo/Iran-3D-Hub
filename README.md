<div dir="rtl">

# هاب سه‌بعدی ایران — 3D Hub Iran

بازارگاه آنلاین سفارش چاپ سه‌بعدی و ساخت افزایشی؛ ساخته‌شده بر پایه مدل کسب‌وکار **3D Hubs** و بومی‌سازی‌شده برای بازار ایران (بر اساس `56_3D_Hubs.pdf` و `56-Business-plan-toolkit_3D-Hubs_Iran_filled.pdf` در همین پوشه).

</div>

---

## What it is

A two-sided marketplace that unlocks idle 3D-printing capacity: makers and companies upload a
model, get a **transparent instant price** and lead time, and the job is matched to the nearest
verified workshop. The platform takes a **15% fee per completed order** — exactly the 3D Hubs model
from the source business plan, localised for Iran (Toman pricing, Persian-first UI, in-city delivery).

| | |
|---|---|
| **Frontend** | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · three.js |
| **Backend** | FastAPI · SQLModel · SQLite (swap `DATABASE_URL` for Postgres) · JWT auth |
| **Design** | Apple-style fluid interaction (springs, interruptible motion, translucent materials), full light/dark, fully responsive |
| **Languages** | فارسی (RTL) + English (LTR), switchable live — wording follows the [Persian UX-writing vocabulary](https://github.com/Aylarrazzaghi/Persian-vocabulary-in-UXwriting) |

## Highlights

- **Real geometry, not a guess.** Uploaded STL/OBJ files are parsed server-side in pure Python and
  the volume is computed with a signed-tetrahedron sum — a 30 mm cube returns exactly `27.0 cm³`.
  STEP/IGES fall back to a flagged estimate for engineer review.
- **Live 3D preview.** Your own uploaded mesh renders in the browser (three.js) and can be grabbed
  and spun; release velocity hands off to the idle spin with no seam.
- **Instant quoting engine.** Material cost + machine time + quality multiplier + quantity breaks,
  with the 15% platform fee always shown separately. Every knob re-quotes continuously.
- **Producer matching.** Scores the network on technology, material, build volume, rating, workload
  and city proximity, and ranks local hubs first.
- **Order flow.** `در انتظار پرداخت → در حال آماده‌سازی → کنترل کیفیت → ارسال‌شده → تحویل‌شده`
- **PWA-ready.** Manifest, icons, offline app-shell service worker, `standalone` display.

## Run it

### Docker (recommended)

```bash
docker compose up --build
```

- Frontend → <http://localhost:3560>
- API → <http://localhost:8400>  ·  API docs → <http://localhost:8400/docs>

### Local development

```bash
# Backend
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --reload --port 8400

# Frontend (second terminal)
cd frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8400 npm run dev -- -p 3560
```

**Demo account:** `demo@3dhub.ir` / `demo1234` (or press «ورود با حساب نمونه» on the login page).

> Ports 3560/8400 are used because 3000/8000 were already taken on this machine.
> Change them in `docker-compose.yml` and `NEXT_PUBLIC_API_BASE` if you prefer the defaults.

## Project layout

```
backend/
  app/
    main.py          FastAPI app, CORS, startup seed
    models.py        User · Hub · Material · Quote · Order · Review
    geometry.py      binary/ASCII STL + OBJ parsers, volume & bbox
    pricing.py       instant-quote engine (Toman)
    security.py      PBKDF2 password hashing + JWT
    seed.py          8 verified hubs across 6 cities, 8 materials
    routers/         auth · catalog · quotes · orders
frontend/
  src/app/           landing · /quote · /hubs · /dashboard · /login
  src/components/    Providers (theme+i18n+auth) · Header · Hero3D · StlViewer · …
  src/lib/           i18n dictionary (fa/en) · API client · number formatting
  public/            manifest.webmanifest · sw.js · icons
docker-compose.yml
```

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` · `/login` · `GET /me` | JWT auth |
| `GET` | `/api/materials` `/technologies` `/cities` `/qualities` | catalogue |
| `GET` | `/api/hubs` `?city&technology&material&q&sort` | network search |
| `GET` | `/api/hubs/{id}` | hub detail + reviews |
| `POST` | `/api/quotes/analyze` | upload a model → mesh stats, price, matches |
| `POST` | `/api/quotes/manual` | quote from an approximate volume |
| `POST` | `/api/orders` · `GET /api/orders` | place / list orders |
| `POST` | `/api/orders/{id}/advance` · `/cancel` | move the production flow |
| `GET` | `/api/stats` | network KPIs |

## Next: PWA → APK → IPA

The web app already ships the PWA layer (manifest, icons, offline shell), so the mobile steps are:

1. **PWA** — installable today. Serve over HTTPS and it can be added to the home screen.
2. **APK** — wrap with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (TWA) or Capacitor:
   `npx @bubblewrap/cli init --manifest https://<domain>/manifest.webmanifest && npx @bubblewrap/cli build`
3. **IPA** — Capacitor iOS shell (`npx cap add ios`), opened and signed in Xcode.

Say the word and I'll wire up Capacitor with the native splash/icon sets and build scripts.
