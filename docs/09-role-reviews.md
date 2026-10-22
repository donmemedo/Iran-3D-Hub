# 3D Hub Iran: role reviews

Reviews of the hardening pass (branch `audit/security-perf-ux`, base `215bc8c`, current `47ba9b9`) from five seats: Product Owner, Tech Lead, Red Team, Blue Team and QA/QC. Each seat has a table of numbered suggestions and ends with its top three priorities. The forward plan that picks these up is [10-implementation-plan.md](10-implementation-plan.md).

Related: [implementation report](00-implementation-report.md), [security audit register](03-security-audit.md), [penetration test](04-penetration-test.md), [performance](05-performance.md), [runbook](11-runbook.md), [index](README.md).

## How to read this document

Every status was set by opening the cited file in the working tree. Where a statement is reasoned from code but was not run, the evidence cell says so.

| Status | Meaning |
|---|---|
| Done | The control or change exists in the tree and the evidence cell shows how it is checked. |
| Partly | Some of it exists; the last column says what remains. |
| Deferred | Not done. The last column gives the reason and where the plan picks it up. |
| Rejected | Considered and not recommended. The last column gives the reason. |

| Evidence label | Meaning |
|---|---|
| `file:line` | Read in the working tree. |
| test name | A test in `backend/tests/test_security.py` that asserts it. |
| evidence file | A file under [evidence/](evidence/). Only numbers from there are quoted as measurements. |
| computed | Arithmetic on constants in the cited code, or a call to a pure function made during this review. Reproducible, but not a measurement and not stored in `evidence/`. |
| inferred | Reasoned from code or framework behaviour; not run. |

Path conventions: `auth.py`, `orders.py`, `quotes.py`, `catalog.py` are in `backend/app/routers/`; `config.py`, `db.py`, `geometry.py`, `main.py`, `middleware.py`, `models.py`, `pricing.py`, `ratelimit.py`, `schemas.py`, `security.py`, `seed.py` are in `backend/app/`; `test_security.py` and `conftest.py` are in `backend/tests/`; `api.ts` and `i18n.ts` are in `frontend/src/lib/`; `Providers.tsx` is in `frontend/src/components/`; `quote/page.tsx`, `login/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, `hubs/page.tsx`, `layout.tsx` and `app/page.tsx` (landing page) are in `frontend/src/app/`; `next.config.ts` and `public/sw.js` are in `frontend/`; `ci.yml` and `security.yml` are in `.github/workflows/`. `SEC-nn` refers to a row in [03-security-audit.md](03-security-audit.md); `P1-nn`, `P2-nn`, `P3-nn` and `D1` to `D6` refer to [10-implementation-plan.md](10-implementation-plan.md).

## Summary

| Seat | Suggestions | Done | Partly | Deferred | Rejected |
|---|---|---|---|---|---|
| Product Owner | 17 | 1 | 5 | 11 | 0 |
| Tech Lead | 16 | 2 | 6 | 8 | 0 |
| Red Team | 16 | 1 | 5 | 10 | 0 |
| Blue Team | 14 | 1 | 6 | 7 | 0 |
| QA/QC | 16 | 2 | 3 | 10 | 1 |
| **Total** | **79** | **7** | **25** | **46** | **1** |

### Themes across the seats

1. **The money loop is one dependency chain.** Payment (PO-05), an explicit order state machine (TL-01), a payments table (TL-03), producer visibility of paid orders only (RT-11) and the model file reaching the producer (PO-04) have to land together; none is useful alone.
2. **Price integrity has three gaps that the signature does not cover.** A signed quote can be replayed (RT-02), the geometry behind it is customer-declared (PO-07, RT-03), and the quantity discount makes 25 pieces cheaper than 24 (PO-16).
3. **Availability controls are enforced late.** The upload limiter runs after the body is received (TL-09), hashing waiters hold request threads (TL-08), and nobody has measured two parses against the 512 MB container (TL-07, RT-07).
4. **Detection depends on logs that rotate fast and lack identity.** Three 10 MB files per container, no client address on the access line, no account id on failed logins (BT-01 to BT-04).
5. **The product surface promises more than the product does.** «پرداخت امن», "Verified producers" and the delivered-orders counter are not backed by code (PO-11, PO-12).

Items that a keyword search of documents 00 to 08 did not find, so they are first recorded here: PO-02 (the `maker` role name), PO-04 (the model file never reaches the producer, as a gap), PO-14 (an order created without a producer can never get one), PO-16 (quantity-break inversion), RT-13 (log forging through the decoded path), QA-03 (the test named for cancel rules never cancels), and the memory estimate in TL-07.

## 1. Product Owner

Scope, buyer against producer, the MVP boundary, the missing producer side, pricing integrity, fee transparency, demo against production, and legal text.

| ID | Suggestion | Rationale | Status | Evidence | Reason or remainder |
|---|---|---|---|---|---|
| PO-01 | State the MVP boundary: instant quote and order intake with a by-hand back office, until payment, producer link and file handoff exist | The product surface reads as a finished marketplace; the code is an intake funnel with an admin step | Partly | `docs/00-implementation-report.md` section 9; `README.md:218-219`; copy that overstates: `i18n.ts:21,126` | The docs state the boundary; the UI copy does not (PO-11) |
| PO-02 | Rename the role `maker` (the default for every registered customer) to `customer`; keep `hub` for producers | In code `maker` means the buyer (`RegisterIn` has no role, so every sign-up is `maker`), while the UI calls producers «تولیدکننده». Two meanings of "maker" will leak into the producer console | Deferred | `models.py:18`; `auth.py:27-28`; `schemas.py:28-33`; `i18n.ts:23`; `test_security.py:112` | Needs a data migration. Cheapest inside the Alembic baseline (P1-02) while the user table is small |
| PO-03 | Build the producer side: onboarding, a console to accept, reject and advance jobs, a payout statement | Hubs cannot see or move their jobs; "Become a producer" links to `/login`; `Hub` has no owner column; only an admin can advance | Deferred | `app/page.tsx:306`; `models.py:23-45`; `security.py:143-147`; `test_only_admin_can_advance_orders` (`test_security.py:108-117`) | Depends on payment (PO-05) so producers see only paid jobs. Console in Phase 1 (P1-05), self-serve onboarding in Phase 2 (P2-09) |
| PO-04 | Deliver the customer's model file to the producer | No backend code writes an upload anywhere, so an order carries only a filename and the producer cannot print what was quoted. The privacy text promises memory-only handling | Deferred | no `open(`, `.write(`, `shutil` or `tempfile` in `backend/app`; `quotes.py:116-127`; `quote/page.tsx:201-203` (the order payload has no file); `privacy/page.tsx:20` | Needs storage, retention and a privacy-text change shipped together (P1-06) |
| PO-05 | Close the money loop: a payment gateway with an explicit `pending_payment` to paid transition | Orders start at `pending_payment`; only an admin moves them; `commission` is computed and never collected | Deferred | `orders.py:20,48,110-120`; SEC-81 | Provider onboarding and Rial integration carry lead time outside the code. Phase 1 (P1-04, decision D1) |
| PO-06 | Sign the price on the server so the client cannot change it | A client-set price was the original business-logic hole | Done | `security.py:87-105`; `orders.py:31-51`; `test_order_materialises_quote_and_rejects_tampering` (`test_security.py:132-148`); live probe check "tampered price rejected at order time" (evidence file) | |
| PO-07 | Make price inputs trustworthy: bind the quote to the uploaded file and label manual volumes as estimates | The signature protects the price for the declared geometry only. `/api/quotes/manual` accepts any volume and bounding box, and after one upload the page re-prices through that endpoint with the volume it holds | Partly | `quotes.py:130-134`; `quote/page.tsx:138-149`; `geometry.py:74-79,157-167` (flags only); SEC-80 | Flags (`non_manifold`, `needs_engineer_review`, `estimated_from_file`) exist. No file hash in the claims and no producer check (P1-06) |
| PO-08 | Use `Hub.hourly_rate` in pricing, or stop presenting it as a price signal | Machine time is a constant 45,000 Toman per hour, so every hub yields the same price. The rate is shown on hub cards and used as a sort key | Deferred | `pricing.py:61`; `catalog.py:74`; SEC-35 | Needs a pricing-model decision first (a quote per hub, or one platform table; D3). Decide in Phase 1, build in Phase 2 (P2-07) |
| PO-09 | Show the platform fee as its own line and derive the percentage from the server | The fee line exists. The "15%" in its label is hard-coded text, while `PLATFORM_COMMISSION` is configurable and forwarded by compose | Partly | `quote/page.tsx:421`; `terms/page.tsx:23-24`; `i18n.ts:42,147`; `config.py:29`; `docker-compose.yml:42` | The API response has no rate field, so changing the setting makes the label wrong (P1-08a) |
| PO-10 | Decide who pays the fee and store the rate on each order | Producer-facing copy says the platform takes 15% of each completed order, while the quote adds 15% on top of the customer price. The fee shown is rounded to 1,000 Toman but the stored commission is computed from the total: a subtotal of 85,000 Toman shows a fee of 13,000 and stores 12,782 (computed) | Deferred | `app/page.tsx:219-220`; `pricing.py:67-74`; `orders.py:48`; `docs/00-implementation-report.md` section 10 item 11 | Business decision (D2). A `fee_rate` column on `order` goes into the baseline migration (P1-02) |
| PO-11 | Remove claims the product cannot keep yet: «پرداخت امن» / "Secure payment", "Verified producers", the delivered-orders counter | No payment flow exists; `verified` defaults to true with no verification process; `orders_done` is set only by seed data and never incremented | Deferred | `i18n.ts:21,23,126,128`; `app/page.tsx:106,229`; `models.py:42`; `seed.py:86-92`; the only write to `orders_done` is `seed.py:90` | The copy was outside the hardening pass. Change it before any public link (P1-08c, half a day) |
| PO-12 | Separate demo from production: sample hubs, reviews and counters only on request | An empty database gets 8 invented hubs, 5 named reviews and `orders_done` counters at any start. The demo user is opt-in but stays after the flag is switched off, and the demo button is a build-time flag while the user is a run-time flag | Partly | `seed.py:86-95` (sample data, no flag); `seed.py:96-100` (demo user, opt-in); `login/page.tsx:13` | The demo credential is opt-in (done). Missing: a `SEED_SAMPLE_DATA` flag and a start-up warning when the demo user exists without a demo flag (P1-08c) |
| PO-13 | Legal pages: counsel review, and keep every statement true | Both pages say they are drafts. The privacy page also says account deletion is available on request, but no endpoint exists, and that the token sits in localStorage, which changes in Phase 2 | Partly | `privacy/page.tsx:8,20,28-30,36-37`; `terms/page.tsx:8,105-110`; `auth.py` has register, login and me only | Counsel review not done. Re-edit when files are stored (P1-06) and when cookies replace localStorage (P2-05). Deletion endpoint is P1-09 |
| PO-14 | Write down the order policy: cancel window, orders without a producer, shipping, tax | A customer can cancel while the job is in production; an order created without a hub can never get one (no assignment code); the price has no shipping line; tax and invoice duties are not modelled and were not assessed here | Deferred | `orders.py:34,50,127`; `pricing.py:22-25,68` | Policy decisions: capture in the Phase 1 decision log (D5). Hub assignment ships with the console (P1-05) |
| PO-15 | Add a review screen for delivered orders | Reviews exist only as an API; the ratings users see come from seed rows | Deferred | `orders.py:135-159`; `docs/00-implementation-report.md` section 3 | Nothing real to review until deliveries exist. Phase 2 (P2-09) |
| PO-16 | Fix the quantity-break inversion: 25 pieces cost less than 24 | The discount factor applies to the whole quantity. 24 x 0.86 = 20.64 unit prices against 25 x 0.78 = 19.50, and 49 x 0.78 = 38.22 against 50 x 0.70 = 35.00. A customer who needs 24 can order 25 and pay less | Deferred | `pricing.py:27-38,64`; computed from the constants and by calling `price_quote` for a 27 cm3 FDM part, which gives a higher total at 24 than at 25 | Product decision (marginal tiers or whole-order breaks). Small change plus a property test (QA-06); P1-08a |
| PO-17 | Define first-party success metrics: quote to order, order to paid, on-time delivery | No analytics by design (the privacy text says no third-party trackers) and no funnel counts exist | Deferred | `privacy/page.tsx:31-34` | Meaningful only once payment and producer states exist. Phase 2 (P2-08) |

**Top three priorities (Product Owner)**

1. Close the loop in one release: payment, producer link and console, and the file reaching the producer (PO-05, PO-03, PO-04). Until then the product takes quotes, not jobs.
2. Make the surface honest and the decisions explicit before any public link: remove unbacked claims and sample data (PO-11, PO-12), and decide the fee payer, the pricing model and the cancel policy (PO-10, PO-08, PO-14).
3. Finish price integrity: single-use quotes, file-bound volume and the quantity inversion (PO-07, PO-16, RT-02).

## 2. Tech Lead

Architecture, the order state machine, the system of record, failure modes and technical debt.

| ID | Suggestion | Rationale | Status | Evidence | Reason or remainder |
|---|---|---|---|---|---|
| TL-01 | Make the order lifecycle an explicit state machine: a transition table with allowed actors, plus an event history | `FLOW` is a linear list and the cancel rule is an `if` inside the route. There is no `paid` state, and history is only `updated_at` plus rotating log lines | Partly | `orders.py:20,98-107,110-132`; `models.py:86-98` | Compare-and-set transitions are done and give `409 order_changed`. The table, a `paid` state and an `order_event` table are P1-03 |
| TL-02 | Treat the database as the system of record for what was sold: copy the signed quote onto the order | Recomputing a price later would let catalog changes rewrite history | Done | `orders.py:43-51`; `test_order_materialises_quote_and_rejects_tampering` (`test_security.py:132-148`) | |
| TL-03 | Record payments, payouts and refunds in their own tables | Only `Order.amount` and `Order.commission` exist; there is no gateway reference and no producer payout | Deferred | `models.py:86-98` | No gateway yet. The `payment` table lands with P1-04; payout statements and refunds follow in Phase 2 |
| TL-04 | Replace the hand-written upgrade list with Alembic | `_UPGRADES` is four idempotent index statements plus one column check; there is no version table, and fresh databases get three duplicate unique indexes | Partly | `db.py:32-54`; `docs/00-implementation-report.md` section 10 item 9 | Works for the pre-audit upgrade only. The code comment already says to switch (`db.py:34`). Baseline with SQLite batch mode is P1-02 |
| TL-05 | Move the rate limiter out of process | Counters live in one process, so two workers double every limit. The login check and the record are two calls, not one atomic step | Partly | `ratelimit.py:3-4,14-16`; `auth.py:41,50`; `backend/Dockerfile:57` (one worker) | Correct for one worker, which is how it ships. Redis with the same function names is P2-02 |
| TL-06 | Move to Postgres, and run migrations and seed as a release step instead of inside app start-up | SQLite allows one writer on one node; `init_db()` and `seed()` run at every process start; `func.round(float, 2)` in the rating update may not exist for `double precision` | Partly | `db.py:22-30`; `main.py:19-23`; `orders.py:154-156`; `test_sqlite_runs_in_wal_mode_with_busy_timeout` (`test_security.py:387-391`) | SQLite is tuned (WAL, busy timeout). Driver pin, the rating query and a release command are P2-01. The `round` issue is unverified |
| TL-07 | Size the pure-Python parse against the container before raising any cap | The 250,000-triangle cap bounds time and memory but nothing measures either. Each triangle is three tuples of three floats: about 480 bytes by `sys.getsizeof` on CPython 3.12.3, so roughly 230 MiB for one parse and 460 MiB for two, against a 512 MB limit (computed for the binary-STL path, lists only, excluding file bytes, the upload spool and the interpreter; not a measurement) | Partly | `geometry.py:23,83-91`; `quotes.py:22,119-124`; `docker-compose.yml:60`; `docs/00-implementation-report.md` section 10 items 6 and 7 | The bounds exist. Measure peak memory under the compose limits with a cap-sized file, then lower `MAX_TRIANGLES` or the slot count (P1-10a). Worker process in P2-03 |
| TL-08 | Shed hashing load instead of queueing it | `_hash_slots` is a blocking semaphore, so waiting logins hold threadpool threads, and health and every other sync route share that pool | Deferred | `security.py:23,27`; `main.py:73`; `docs/05-performance.md:35` | Inferred, not measured. Use a timed acquire and answer `503`, as the parse slots do (`quotes.py:119-120`). P1-08b |
| TL-09 | Enforce the upload rate limit before the body is received | The limiter is inside the handler, and FastAPI parses and spools the multipart body before the handler runs | Deferred | `quotes.py:110`; `middleware.py:36-40`; `docs/05-performance.md:95` | Reasoned from framework behaviour, not tested. Move the check into `BodyLimit` or the proxy (`limit_req`). P1-08b |
| TL-10 | Give unhandled errors the same headers as every other answer | The 500 handler runs outside the header and CORS middleware, so the body has a request id but the response has no `X-Request-ID`, no security headers and no CORS headers | Deferred | `main.py:65-69`; `docs/00-implementation-report.md` section 10 item 17 | A cross-origin browser shows a network error for a 500. Catch in `SecureHeaders`. P1-08b |
| TL-11 | Pass every setting through compose | Compose forwards 9 of the 18 backend settings | Deferred | `docker-compose.yml:36-46`; `config.py:17-37` | Safe defaults make it low risk. Use `env_file` or list them (P1-08c) |
| TL-12 | Hash-pin Python dependencies and digest-pin base images | Pins are exact (`==`) but have no hashes, and images are pinned by tag | Deferred | `requirements.txt`; `backend/Dockerfile:1-5,16-18`; `.github/dependabot.yml` | Tag pins, weekly Dependabot and Trivy were accepted for the MVP. Revisit when releases are signed (Phase 2) |
| TL-13 | Add static analysis and a typed API client on the frontend | `next build` is the only gate: lint is disabled during builds and no ESLint dependency exists. Five backend error codes have no translation | Deferred | `next.config.ts:43-44`; `package.json:9`; `docs/00-implementation-report.md` section 7 (error mapping) | tsc is the only static check. ESLint and an error-code parity test are part of QA-08 (P1-10b) |
| TL-14 | Keep quoting stateless | Every anonymous slider move used to write a row; now nothing is written until an order exists | Done | `security.py:87-105`; `test_quoting_never_writes_to_the_database` (`test_security.py:120-129`) | |
| TL-15 | Coverage and CI gates beyond pytest | 50 backend tests, no frontend tests, no coverage figure, and CI never starts the built images | Partly | `ci.yml:18-119`; `package.json:5-9` | See the QA seat. No coverage threshold until a baseline exists (QA-15) |
| TL-16 | Give time-driven transitions a scheduler | A `pending_payment` order never expires, and the repository has no job runner | Deferred | no scheduler or queue in the tree; `orders.py:20` | Expiry is checked at pay time in P1-04; jobs arrive in P2-04 |

**Top three priorities (Tech Lead)**

1. State machine, event table and Alembic baseline before anything else touches order status (TL-01, TL-04, TL-03). Every later feature hangs on them.
2. Measure before scaling: peak memory at the parse cap under compose limits, then shed load early (TL-07, TL-08, TL-09). Postgres, Redis and a worker come after the numbers exist (TL-05, TL-06, P2-03).
3. Make CI prove the shipped artefact: start the containers, and cover cancel, lockout and pricing properties (TL-15, QA-03, QA-04, QA-10).

## 3. Red Team

Attack surface and abuse cases: what is closed and tested, what is open or accepted, and what to probe next.

| ID | Suggestion | Rationale | Status | Evidence | Reason or remainder |
|---|---|---|---|---|---|
| RT-01 | Keep the closed paths as a standing gate: default and forged secrets, `alg=none`, tokens without `sub`, a customer advancing their own order, foreign quotes and orders, negative quantity, oversize bodies | These were the confirmed findings. 48 of 50 tests failed on the original code and all 50 pass on the fixed code | Done | `test_security.py:30-64,100-117,181-212,222-238,290-302`; `evidence/baseline-original-code.txt`; `evidence/live-probe-result.json` (27 of 28 passed) | |
| RT-02 | Make a signed quote single-use | The token is a bearer credential valid for 24 h, and one token can place many orders. The dashboard test relies on that | Partly | `orders.py:29,31-56`; `test_security.py:396-401`; SEC-61 | Bounded by 60 orders per hour per user. Fix: add a `jti` claim and build `Quote.public_id` from it, so the existing unique index rejects the second order (P1-08a) |
| RT-03 | Probe price manipulation through declared geometry | Manual volume and bounding box are trusted as typed. A mesh with an inverted inner shell can lower the signed volume, because only the absolute value of the sum is used | Deferred | `quotes.py:130-134`; `geometry.py:58-69`; SEC-80 | Accepted in the audit for the MVP. The mesh case is inferred, not built. Fix: bind the file hash into the claims and let the producer check (P1-06). Next probe: build such a mesh and quote it |
| RT-04 | Stop account lock-out from being a denial of service | Ten wrong passwords lock one email for 600 s, even for its owner, and one IP can renew the lock | Deferred | `auth.py:40-42,50`; SEC-78 | Accepted in the audit. Key the budget on email plus IP, or add a challenge step after N failures (Phase 2, with sessions) |
| RT-05 | Remove the registration oracle | `409 email_already_registered` confirms that an account exists | Deferred | `auth.py:25-26`; SEC-17 | A generic reply needs an email channel and a registration flow that returns no session (decision D6). Phase 1 (P1-07) |
| RT-06 | Rate-limit `/api/quotes/manual` | Anonymous, no per-IP limit; each call is two queries and a signature | Deferred | `quotes.py:130-134`; SEC-79 | Open item. One `ratelimit.hit` call (P1-08a); size the limit from a load test (QA-11) |
| RT-07 | Probe memory and disk exhaustion under the real compose limits | Two parses at the cap, several in-flight 60 MB uploads and a 128 MB upload tmpfs share one 512 MB container; memory is bounded by thread count, not by parse slots. tmpfs pages are charged to the container (inferred) | Deferred | `docker-compose.yml:50,60`; `quotes.py:116-119`; `docs/05-performance.md:96`; `docs/02-threat-model-and-attack-tree.md:171` | Nobody has measured it. Run a cap-sized binary STL and three parallel 60 MB uploads, watch `docker stats` and OOM kills, then fix TL-07 and TL-09 (P1-10a) |
| RT-08 | Reduce what an XSS can steal | The token sits in `localStorage` and `script-src` allows `'unsafe-inline'`, so any injected script reads the token. The only `dangerouslySetInnerHTML` renders a constant script | Partly | `api.ts:22-32`; `next.config.ts:14-24`; `layout.tsx:52`; SEC-38; `.semgrep.yml:62,77` | No injection sink was found, but the blast radius is a whole session. HttpOnly cookie, CSRF defence and a nonce CSP are P2-05 and P2-06 |
| RT-09 | Plan rotation and revocation | One HS256 secret signs login tokens and, through a derived key, quotes. A leaked secret mints tokens for any user id, admins included; a stolen token lives 24 h | Deferred | `security.py:70-78,87-93,109-127`; `config.py:25`; `docs/11-runbook.md:174` | Add a per-user `tokens_valid_after` check against `iat` in Phase 1 (P1-07), and `kid` rotation with refresh and revoke in Phase 2 (P2-05) |
| RT-10 | Harden the admin path | The first admin is made with raw SQL that nothing logs; an admin can move any order; there is no second factor | Deferred | `docs/11-runbook.md:57-63`; `orders.py:110-120` | Admin advances are logged (`orders.py:119`), the only control. Add an admin CLI that logs, and a proxy IP allow-list or SSO before real money (P1-05, P2-08) |
| RT-11 | Pre-empt order spam and producer griefing | Sign-up is free (10 per minute per IP) and an order costs nothing today. Once producers see orders, spam wastes their time | Deferred | `ratelimit.py:63-66`; `orders.py:29`; `app/page.tsx:306` | Solved by design in Phase 1: producers see only paid orders, and payment needs a verified email (P1-04, P1-05, P1-07) |
| RT-12 | Verify proxy trust and client-IP derivation after every deployment | Every limit keys on `request.client.host`. `FORWARDED_ALLOW_IPS=*` lets clients spoof an address; too narrow merges all users into one bucket, and shared mobile addresses make that likelier (not measured) | Partly | `ratelimit.py:55-56`; `docker-compose.yml:46`; `docs/11-runbook.md:135-140` | Documented with a manual check (`login_failed ip=` line). No automated check. Add one to the smoke test (QA-10) |
| RT-13 | Stop log forging through the request path | The access line logs `scope["path"]`, which ASGI servers percent-decode, so an encoded line break could add a forged line to the log | Deferred | `middleware.py:94-95` | Inferred, not reproduced. Log an escaped path or `raw_path` (P1-08c) |
| RT-14 | Write abuse cases for Phase 1 before building it | New surface: forged or replayed payment callbacks, amount mismatch, file download by the wrong user, reset-token reuse, producer operators ordering from their own hub to farm reviews | Deferred | design-time; acceptance criteria in `docs/10-implementation-plan.md` | Each case is an acceptance criterion for its task; probes run when the task lands (P1-11) |
| RT-15 | Fuzz the parsers and the multipart layer | Hostile mesh cases are hand-picked; there is no randomised input and no many-parts or slow-body probe | Partly | `test_security.py:325-349`; `geometry.py:65` (NaN and infinity guard) | Add a Hypothesis or Atheris run over the three parsers, and many-parts and slow-body probes at the proxy (Phase 2, with the worker) |
| RT-16 | Re-measure login timing on an idle machine with a stated sample size | After the fix the known and unknown distributions overlap, but the run was under a load average of about 40 and the sample size was not recorded | Partly | `security.py:58-63`; `auth.py:44-46`; `evidence/login-timing-after.txt` | The control is in the code; the evidence is weak. Re-run with at least 200 samples per case and a rank test; keep it a manual probe (QA-13) |

**Top three priorities (Red Team)**

1. Price integrity before real money: single-use quotes, file-bound geometry and the quantity inversion (RT-02, RT-03, PO-16).
2. Cheap availability bypasses: the unmetered `/manual` route, the limiter that runs after the body, and the unmeasured memory ceiling (RT-06, TL-09, RT-07).
3. Shrink the session blast radius: per-user revocation now, HttpOnly cookies and a nonce CSP next, and an admin path that logs (RT-09, RT-08, RT-10).

## 4. Blue Team

Controls, logging and audit, detection, retention, incident response and backups.

| ID | Suggestion | Rationale | Status | Evidence | Reason or remainder |
|---|---|---|---|---|---|
| BT-01 | Audit-log every security-relevant event | Events exist for register, failed login, order created, advanced and canceled | Partly | `auth.py:32,51`; `orders.py:55,119,131`; `docs/11-runbook.md:222-244` | Missing: successful login, `429` events, review created, role changes. `login_failed` carries no account id, so an attack on one account is invisible in the log |
| BT-02 | Put the client address and the user id on the access line | `app.access` records method, path, status, duration and request id only | Deferred | `middleware.py:94-95` | uvicorn's own access line carries the peer address under default settings but never the user. Add both once IP derivation is verified (RT-12). P1-08c |
| BT-03 | Ship logs off the host and set retention | Logs stay in the container's json-file driver: three files of 10 MB per container, then older lines are lost. There is no off-host copy | Deferred | `docker-compose.yml:24-28`; `docs/11-runbook.md:222-224` | Needs a log shipper (Loki, syslog or a hosted service) and written retention. Proposal, not a requirement: 90 days for audit lines, 14 days for access lines. Phase 2 (P2-08) |
| BT-04 | Add detections on the log lines that already exist | Repeated `login_failed` per IP, `429` bursts, `unhandled error`, a `503` busy rate, any `order_advanced`, order volume per user | Deferred | `auth.py:51`; `middleware.py:94`; `main.py:67`; `orders.py:119` | Start with a fail2ban jail or log alerts keyed on `login_failed ip=` after IP derivation is verified. Thresholds come from a first week of traffic; starting points are in the table below. P2-08 |
| BT-05 | Scheduled, encrypted, off-host backups with a restore drill | The procedure is documented (online backup API, cold copy). Nothing is scheduled, no retention is set, and no restore run is recorded | Partly | `docs/11-runbook.md:143-172`; `docker-compose.yml:47-48` | Add a scheduled job, encryption and an off-host copy; state RPO and RTO once payments exist; run the restore drill and record the date (P2-04, P2-01) |
| BT-06 | Incident response beyond first steps | Five first steps exist. There is no severity scale, no roles or contact path, no communications template, no post-incident template, and no `SECURITY.md` or `security.txt` | Partly | `docs/11-runbook.md:222-244`; neither file exists in the tree; `docs/08-threat-intelligence-lifecycle.md:148` | Write a one-page IR plan and publish a disclosure address (P1-08c) |
| BT-07 | Secret lifecycle | Start-up refuses a weak or missing secret, compose refuses to start without one, and gitleaks has a rule for it | Partly | `config.py:40-49`; `docker-compose.yml:37`; `.gitleaks.toml:10-15` | One key, no overlap during rotation, and the value is visible through `docker inspect`. Secret store and `kid` rotation in Phase 2 (RT-09, P2-05) |
| BT-08 | Container and host hardening | Non-root users, read-only root filesystem, dropped capabilities, `no-new-privileges`, memory, CPU and pid limits, bounded logs | Partly | `docker-compose.yml:17-28,59-62`; `backend/Dockerfile:48`; `frontend/Dockerfile:51` | Configured, but CI never starts the containers (`docs/00-implementation-report.md` section 8). Smoke test: QA-10 |
| BT-09 | Guard the demo account in production | `demo@3dhub.ir` with a published password survives turning `SEED_DEMO` off | Deferred | `seed.py:96-100`; `docs/11-runbook.md:80-104` | A start-up check that logs an error, or refuses to start, when that user exists and neither `DEV` nor `SEED_DEMO` is set. P1-08c |
| BT-10 | A readiness check that touches the database | `/api/health` never reads the database, so a locked or missing database still reports healthy | Deferred | `main.py:72-74`; `docker-compose.yml:53-58` | Add `/api/ready` with `SELECT 1` for the proxy and the external probe the runbook already recommends (P1-08b) |
| BT-11 | Metrics and service-level objectives | There is no metrics endpoint and no tracing; the only latency numbers come from one probe | Deferred | `docs/11-runbook.md` ("Not logged" paragraph) | Phase 2: request duration and status counters, queue depth, hash and parse slot use. Set targets after a baseline load test (QA-11). P2-08 |
| BT-12 | Personal-data lifecycle | Email, phone and address are plaintext in SQLite; backups hold password hashes; there is no deletion endpoint and no retention job | Deferred | `models.py:12-20`; `docs/11-runbook.md:163`; `privacy/page.tsx:28-30` | Account deletion (anonymise, keep order rows for accounting) in P1-09, retention jobs in P2-04. Store review needs it too (Phase 3) |
| BT-13 | Edge controls at the proxy | HSTS is sent by the API only when the scope scheme is https; the nginx fragment in the runbook is marked untested; there are no edge rate limits | Partly | `middleware.py:83-84`; `next.config.ts:56`; `docs/11-runbook.md:105-141` | Test the proxy configuration, and add `limit_req` for `/api/auth` and `/api/quotes/analyze` to stop bodies earlier (TL-09) |
| BT-14 | Dependency and static-analysis scanning in the pipeline | Per-pull-request and weekly scans: pip-audit, npm audit, Trivy, Syft, gitleaks, Semgrep, CodeQL, Dependabot | Done | `ci.yml:36-41,59-62,99-119`; `security.yml:20-95`; `.github/dependabot.yml`; `evidence/dependency-and-sast.txt` | "Done" means configured, plus the local OSV and bandit runs in the evidence file. No result of a GitHub run is stored under `docs/evidence/` |

Detection starting points. These are proposals to tune against real traffic, not measured baselines.

| Signal | Source | Starting threshold | Action |
|---|---|---|---|
| Repeated failed logins from one address | `app.audit` `login_failed ip=` (`auth.py:51`) | 20 in 10 minutes | Ban at the proxy; check whether the address is the proxy's own (RT-12) |
| Limiter pressure | access lines with status `429` on `/api/auth` (`middleware.py:94`) | 5 from one address in 1 minute | Alert; review for a distributed guess |
| Unhandled errors | `app` `unhandled error rid=` (`main.py:67`) | any in 5 minutes | Page; search the request id |
| Parse capacity | access lines `503` on `/api/quotes/analyze` | 5 in 5 minutes | Check for slot hogging (`quotes.py:119-120`) |
| Admin activity | `app.audit` `order_advanced` (`orders.py:119`) | any outside business hours | Notify; confirm with the admin |
| Order burst per user | `app.audit` `order_created` (`orders.py:55`) | 30 in 1 hour (limit is 60) | Review account; consider payment gating |
| New admin account | none today: the role is set by raw SQL | n/a | Gap: needs the admin CLI that logs (RT-10) |

**Top three priorities (Blue Team)**

1. Make the logs usable: ship them off-host, add the client address and account identity, escape the path, and alert on the signals above (BT-01 to BT-04, RT-13).
2. Backups that have been restored at least once, with a stated RPO and RTO before payments go live (BT-05).
3. Credential and incident hygiene: a guard against the demo account, a rotation path with overlap, `security.txt` and a one-page IR plan (BT-09, BT-07, BT-06).

## 5. QA/QC

Testability, acceptance criteria, edge cases and test gaps.

| ID | Suggestion | Rationale | Status | Evidence | Reason or remainder |
|---|---|---|---|---|---|
| QA-01 | Keep a regression suite that asserts the safe behaviour | Each test failed on the original code and passes now: the red-team confirmation and the blue-team proof | Done | `test_security.py` (50 tests); `evidence/baseline-original-code.txt` (48 failed, 2 passed in 361.37 s) | |
| QA-02 | Run the real app in-process on a fresh database per test | No server, no network, no shared state | Done | `conftest.py:33-61`; `backend/pytest.ini` | Slow: real scrypt hashing and an app re-import per test. The original-code run took 361.37 s on a loaded machine; the current duration was not recorded |
| QA-03 | Test the cancel rules and the compare-and-set race | The test named `test_hub_detail_404_and_cancel_rules` only checks a hub 404 and a hub 200. Cancel, `too_late_to_cancel` and `409 order_changed` have no test | Deferred | `test_security.py:215-218`; `orders.py:98-107,123-132`; `docs/04-penetration-test.md:76` | Add the tests listed below and rename the misleading one |
| QA-04 | Cover the other untested controls: the per-account failure budget, orders per hour, `X-Request-ID`, HSTS on https, the 500 answer | A search of the tests finds none of them | Deferred | `auth.py:40-53`; `orders.py:29`; `middleware.py:65,83-84`; `main.py:65-69` | Cheap with the existing harness; listed below (P1-10a) |
| QA-05 | Stop the dashboard test from depending on quote replay | It places 20 orders from one signed token | Deferred | `test_security.py:396-401`; RT-02 | It turns red when replay is closed. Mint 20 quotes first (P1-08a) |
| QA-06 | Property tests for pricing | One point test exists. Total price is not monotonic in quantity: it fails today from 24 to 25 and from 49 to 50 (PO-16) | Partly | `test_security.py:241-243`; `pricing.py:27-38` | Add: monotonic in quantity (xfail strict until fixed), total equals subtotal plus fee, positive total, monotonic in volume and infill |
| QA-07 | Geometry edge cases beyond "does not 500" | `analyse` treats a file as ASCII STL when it starts with `solid` and has `facet` in the first 2 KB; some binary exporters also write `solid` at the start of the header. Persian file names pass the sanitiser regex untested | Partly | `geometry.py:148-151`; `quotes.py:24,32-35`; `test_security.py:338-358` | Add: binary STL with a `solid` header, Persian file name, reversed winding, two shells, unit sanity |
| QA-08 | Frontend unit tests for logic that has security meaning | There is no test runner. `safeNext` guards the open redirect, `api()` maps errors and clears the session, `format.ts` produces Persian digits | Deferred | `package.json:5-9`; `login/page.tsx:17-18`; `api.ts:37-95`; `lib/format.ts` | Vitest with a mocked `fetch`, half a day (P1-10b) |
| QA-09 | End-to-end tests for the main journeys | Nothing exercises browser, API and database together | Deferred | none in the tree | Playwright against the compose stack: guest quote, sign-up and order, keyboard-only upload, language switch, plus an axe accessibility scan (P1-10b) |
| QA-10 | A Docker smoke test in CI | CI builds, lints and scans the images but never starts them, so the read-only root, uid 10001 and volume ownership are untested | Deferred | `ci.yml:70-119`; `docs/00-implementation-report.md` section 8 | `compose up --wait` with a throwaway secret, then the checks listed below (P1-10a) |
| QA-11 | A load test | One heavy-parse probe exists; the login burst, quote rate and upload mix are unmeasured | Deferred | `evidence/live-probe-result.json` (checks 24 and 25); `docs/05-performance.md` section 1 | k6 scenarios below. Set budgets after the first run; none are invented here (P2-08) |
| QA-12 | Commit the live-probe script | Only its JSON output is stored, so the 28 checks cannot be repeated | Deferred | `evidence/live-probe-result.json`; `docs/04-penetration-test.md:84,220` | Add it as a script that writes the host, commit and date into its output (P1-10a) |
| QA-13 | Make login timing a CI gate | A timing assertion on shared runners is flaky, and the measured spread under load was wide (for one case 392 to 2339 ms) | Rejected | `evidence/login-timing-after.txt` | A flaky gate teaches people to ignore red builds. Keep it a manual probe with a sample size (RT-16) |
| QA-14 | Written acceptance criteria per journey, linked to tests | The suite is organised by finding, not by user journey | Partly | table below | First version below; link each row to a test ID as the next tests land |
| QA-15 | Measure coverage, as a report only | No coverage figure exists | Deferred | `ci.yml:33-35` | `pytest --cov` as a report; no threshold until a baseline exists |
| QA-16 | Real-device checks for Persian input, RTL, install and offline | Persian digits in a `type="number"` field, RTL layout around the 3D viewer, the install prompt and the service-worker fallback are untested on devices | Deferred | `quote/page.tsx:290`; `public/sw.js:34-43` | Manual matrix in the Phase 3 test plan; automate what Playwright can |

### Acceptance criteria, first version

Values in AC-01 and AC-02 come from the probe evidence (30 mm cube, 27.0 cm3, total 231,000 Toman).

| ID | Given, when, then | Covered by |
|---|---|---|
| AC-01 | Given a guest, when they send a 27 cm3 manual volume for FDM PLA, standard quality, 20% infill, quantity 1, Tehran, then the total is 231,000 Toman and nothing is written to the database | `test_quoting_never_writes_to_the_database`; probe check "30 mm cube measures 27.0 cm3 exactly" |
| AC-02 | Given a guest, when they upload a 30 mm cube STL, then the mesh volume is 27.0 cm3 | same test |
| AC-03 | Given a logged-in customer with a valid signed quote, when they order, then the order amount equals the quote total; a forged or expired token gives `400 invalid_quote` | `test_order_materialises_quote_and_rejects_tampering` |
| AC-04 | Given a customer's own order, when they call advance, then `403` and the status is unchanged | `test_customer_cannot_advance_their_own_order` |
| AC-05 | Given repeated bad logins, when the per-IP limit is reached, then `429` with `Retry-After`; when ten failures hit one email in 10 minutes, then `429` for that email | per-IP: `test_login_and_register_are_rate_limited`. Per-email: gap (QA-04) |
| AC-06 | Given an upload over the size cap, a mesh over the triangle cap, or a third parse while two run, then `413`, a truncation flag, or `503 busy` | `test_oversized_upload_is_rejected_early`, `test_every_parser_honours_the_triangle_cap`, `test_uploads_are_rate_limited_and_parses_are_capped`. Cap-sized memory: gap (RT-07) |
| AC-07 | Given an order that has not shipped, when the owner cancels, then it is canceled; once shipped, `400 too_late_to_cancel`; another user gets `404` | gap (QA-03); another-user case only in the live probe |
| AC-08 | Given a delivered order, when the customer reviews it twice, then the first is accepted and the second is `409`; before delivery it is `403` | `test_review_requires_a_delivered_order_and_is_one_per_order` |
| AC-09 | Given the Persian UI, then `dir` is `rtl`, digits are Persian, and every error code shows a translated message | gap: no automated check (QA-09) |
| AC-10 | Given no network, when the installed app opens, then the cached shell loads and data calls show the network message | gap: no automated check (QA-16) |

### Edge cases worth a test

| Area | Case | Expected |
|---|---|---|
| Pricing | Quantity 24 against 25, and 49 against 50 | Total never falls as quantity rises (fails today, PO-16) |
| Pricing | Volume 0.01 cm3 | Positive total (covered, `test_security.py:241-243`) |
| Quote token | Same token ordered twice | Second order refused (fails today, RT-02) |
| Quote token | Token used as a login token, and the reverse | `401` (covered, `test_security.py:50-52`) |
| Upload | Binary STL whose header starts with `solid` | Parsed as binary, volume correct |
| Upload | Persian file name, name of 300 characters, name with path separators | Sanitised to at most 120 characters (the last two covered, `test_security.py:352-358`) |
| Upload | Empty file, zero-volume mesh, NaN or huge coordinates | `200` with flags, never `500` (covered, `test_security.py:338-349`) |
| Auth | Email in mixed case; legacy PBKDF2 hash; legacy row stored with capitals | Case-folded; hash upgraded at login (covered); capitals row cannot log in (SEC-70, open) |
| Orders | `hub_id` absent | Order created with no producer, and no way to assign one later (PO-14) |
| Orders | Two simultaneous advances | One wins, the other `409 order_changed` (untested, QA-03) |
| Proxy | Forged `X-Forwarded-For` from outside | Ignored unless the peer is trusted (RT-12) |
| Frontend | `next` parameter `//host`, `/\host`, `javascript:`, tab inside the path | Falls back to `/dashboard` (`login/page.tsx:17-18`; untested) |

### Minimal next tests

Effort figures are estimates.

| # | Test | Asserts | Where | Effort |
|---|---|---|---|---|
| 1 | `test_cancel_rules` | Owner cancels from `pending_payment`; a second cancel is a no-op `200`; after admin advances to `shipped` the cancel is `400`; another user gets `404` | `test_security.py` | 1 h |
| 2 | `test_stale_transition_loses` | Call `_transition` with a stale order object after a real advance; the second raises `409 order_changed` | same | 1 h |
| 3 | `test_failure_budget_is_per_account` | With `LOGIN_RATE_LIMIT=3` and distinct client addresses (`TestClient(client=(ip, port))`), three failures on one email give `429` for it while a different email still logs in | same | 1.5 h |
| 4 | `test_orders_per_hour` | `ORDERS_PER_HOUR=2` gives `429` on the third order | same | 0.5 h |
| 5 | `test_quote_replay_is_rejected` | Second order with the same token is refused. Mark `xfail(strict=True)` until P1-08a | same | 0.5 h |
| 6 | `test_total_is_monotonic_in_quantity` | For quantity 1 to 100, `total(q+1) >= total(q)`. `xfail(strict=True)` until PO-16 is fixed | new `test_pricing.py` | 0.5 h |
| 7 | `test_error_answer_has_request_id_and_headers` | A route that raises returns `X-Request-ID` and the security headers. `xfail(strict=True)` until TL-10 | `test_security.py` | 1 h |
| 8 | `test_hsts_only_on_https` and `test_request_id_header` | `TestClient(base_url="https://testserver")` gets HSTS; plain http does not; every normal answer has `X-Request-ID` | same | 0.5 h |
| 9 | `test_binary_stl_with_solid_header` | Parsed as binary with the right volume | same | 0.5 h |
| 10 | Vitest: `safeNext`, `api()` mapping, `num` and `money` | Table of accepted and refused `next` values; 413 and 429 without a body map to codes; a 401 with a token clears it and fires `h3d:logout`, while `invalid_credentials` does not | `frontend/src` | 4 h |
| 11 | Docker smoke test | With a throwaway `JWT_SECRET`: health `200`; CSP on `/` and security headers on the API; a write to `/app` fails and a write to `/app/data` succeeds as uid 10001; one register, quote and order by `curl`; no `Traceback` in the logs; the `login_failed ip=` line shows the expected address | `.github/workflows/ci.yml` | 4 h |
| 12 | k6 scenarios (run on a CI or staging host, not on a developer laptop) | Login burst; manual quote at a steady arrival rate; small STL uploads at the per-IP limit; a mixed run, reading `docker stats` for memory | `scripts/` | 1 day |

**Top three priorities (QA/QC)**

1. The Docker smoke test in CI, then the backend gap tests (items 1 to 9 above), so the shipped artefact and the controls that moved money are checked (QA-10, QA-03, QA-04).
2. Property and edge tests for pricing and geometry, starting with the quantity inversion and replay as strict expected failures (QA-06, QA-07, QA-05).
3. A minimal frontend net: Vitest for the security-relevant functions, then Playwright for the guest-quote and sign-up-and-order journeys (QA-08, QA-09).
