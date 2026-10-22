# LAST_Report: security, performance and UX hardening of Iran-3D-Hub

Written 2026-10-22 on branch `audit/security-perf-ux`. This is the closing report for the whole request, from the first session to now. It is written to be read cold. The detailed documents are in [`docs/`](docs/README.md).

## 1. Summary

| Question | Answer |
|---|---|
| Was the audit done? | Yes. Code review, dependency scans, static analysis, an in-process regression suite, a live probe of a running instance, and an independent second attack pass on the fixed code. |
| Were the problems fixed? | The confirmed ones, yes: 84 register entries in [`docs/03-security-audit.md`](docs/03-security-audit.md), plus 12 more from the independent re-check. What is still open or accepted is listed in section 7. |
| Proof | The regression suite fails 48 of 50 tests on the original code and passes 60 of 60 on the fixed code ([`docs/evidence/`](docs/evidence)). Production build passes. Live probe: 27 of 28 checks, and the one failure was a measurement artefact that was re-measured. |
| Does it run? | Yes. I started the real backend and the built frontend together, loaded every page, and took screenshots in dark, light and phone width ([`docs/assets/`](docs/assets)). Docker images were **not** built because the Docker daemon was not running. |
| Is there a PR? | Yes, see section 10. |
| What was not done? | APK and IPA builds, Docker image builds, a CI run on GitHub, Lighthouse, a browser-driven upload test. Section 8 gives the reasons. |

## 2. What was asked

Audit the project with red-team and blue-team tactics, fix every problem, penetration-test it, and state the performance cost of every security change. Apply the `apple-design` skill to the UI and UX, with Persian copy following the UX-writing vocabulary. Use a long list of security, FastAPI, Python, DevSecOps, planning and review skills. Deliver a report, documentation in a `docs` folder, a backend and frontend folder with a README and a compose file, then open a pull request from a new branch.

## 3. Timeline, including what went wrong

**Session 1 (about 2026-10-01 and 02).** The codebase was read in full. Dependencies were scanned with OSV: `next` 15.5.4 had 31 advisories (3 critical), and `python-multipart`, `starlette` and `PyJWT` also had advisories. A test harness was built. Sixteen backend findings and a frontend list were drafted from reading the code and written to `HANDOFF.md`. **No project file was changed.** The session ended because the machine ran out of memory (31 duplicate Claude sessions were open) and usage limits were reached.

**Session 2 (2026-10-08 to 2026-10-22).** Resumed from `HANDOFF.md`.

| Event | Effect | What I did |
|---|---|---|
| A forked `/security-audit` skill agent died on a rate limit; two more stale ones reported later | No result, no repo changes (I checked) | Did the work directly and through workflows |
| The first red-team workflow lost all its agents to a network outage, then to the Fable usage limit | Only one finder (authentication) returned | Re-ran later; used my own full code read plus an independent re-verifier at the end |
| Two of my own responses were **stopped by a safety classifier** | The withheld text was not shown to me and I do not know what triggered it | I did not repeat it. Everything after is defensive: fixes, tests, documentation, and checks against my own local instance |
| Model switched from Fable to Opus 5.5 to Sonnet 5.5, effort set to xhigh | Worker agents inherited the model | I did not change models myself. Nothing was skipped because of a model safeguard that I am aware of |
| Weekly usage limit until 2026-10-22 | Work paused for days; three workers were cut off mid-run | On resume I inspected the half-done files, found one worker had in fact finished, and re-ran only the missing two |
| First regression baseline was wrong | Another agent deleted my temporary databases; the test harness redefined database tables on re-import | Fixed the harness (private temp directory, metadata reset, environment reset); re-ran a clean baseline in a throwaway worktree with the original dependencies |
| Original code fails to start on the upgraded dependencies | SQLModel 0.0.48 rejects naive datetimes | Switched the models to timezone-aware UTC |
| Machine load average 40 to 50 from 29 other Claude sessions | Builds took 5 to 6 minutes and timings were inflated | Did not touch the other sessions (they are not mine to stop). Re-measured where it mattered. They are still running |
| Automated review flagged unpinned GitHub Actions | Valid | Pinned every action to a commit SHA and found one tag that did not exist (trivy-action) |

## 4. What I remember (persistent memory)

Memory lives in `~/.claude/projects/-home-makhataei-Projects-Mine-Iran-3D-Hub/memory/`. Before this session it held one entry: *Security audit handoff*, saying the audit was in progress, that nothing was fixed yet, that `next` must be upgraded first, that the venv's `uvicorn` launcher is broken (use `python -m uvicorn`), and to avoid long background jobs while memory was tight. I updated that entry to say the work is finished and where it is. Project instructions in force: use the Persian UX vocabulary, and keep the graphify graph current after code changes. No other memories exist.

## 5. What changed

64 files, about 4,100 lines added and 840 removed against the original commit. Four commits on the branch.

| Area | Main changes | Evidence |
|---|---|---|
| Authentication | Server refuses to start with a missing, short, low-variety or shipped-default `JWT_SECRET`. scrypt password hashing with automatic upgrade of old hashes. Constant-time unknown-email path. Login and register rate limits per IP plus per-account failure budgets. Tokens carry issuer, type and expiry and are pinned to one algorithm. Role is read from the database, not the token. Demo account only in demo mode and locked afterwards. | tests `test_default_or_weak_jwt_secret…`, `test_login_and_register_are_rate_limited`, `test_demo_account…` |
| Orders and money | Quotes are signed, stateless and valid for 24 hours: anonymous quoting no longer writes to the database and the price cannot be changed by the client. Orders check hub existence and capability, use random unique ids, move status with compare-and-set, and are admin-only to advance. Reviews need a delivered order, one per order, atomic rating update. Commission equals the fee the customer saw. | `test_order_materialises_quote_and_rejects_tampering`, `test_only_admin_can_advance_orders`, `test_review_requires…` |
| Input and uploads | Every field bounded (ranges, lengths, allowed values, NaN and infinity). Body-size limit before parsing. Upload rate limit and in-flight cap before the body is read. Mesh parsers work on bytes with hard budgets (25 MB, 250,000 triangles, 3,000,000 lines). Upload runs in the thread pool. Filenames sanitised, extensions allow-listed. | `test_hostile_meshes_do_not_500`, `test_text_meshes_over_the_byte_budget…`, `test_oversized_upload…` |
| API hardening | Security headers, CORS allow-list without credentials, API docs off outside development, validation errors no longer echo input, access log with request id and no log forging, WAL mode and busy timeout, indexes, N+1 query removed. | `test_api_sends_security_headers…`, `test_cors_is_an_allowlist…`, `test_dashboard_listing_is_not_n_plus_one` |
| Dependencies | `next` 15.5.27, `react` 19.1.9, `fastapi` 0.142.4, `starlette` 1.8.0, `python-multipart` 0.0.32, `PyJWT` 2.15.1, `uvicorn` 0.54.0, `sqlmodel` 0.0.48. OSV reports no advisory for any shipped package. | [`dependency-and-sast.txt`](docs/evidence/dependency-and-sast.txt) |
| Frontend security | CSP and header set, open-redirect guard, API client with typed errors and timeouts, service worker that caches only good same-origin responses, image optimiser disabled, no third-party requests. | build output, `next.config.ts` |
| Performance | Fonts self-hosted instead of a render-blocking Google request. three.js lazy-loaded (home first-load JS 167 kB) and paused off-screen. No extra CORS preflight on GETs. `/auth/me` skipped without a token. Aurora without full-screen blur. Cache headers on catalog data. | [`docs/05-performance.md`](docs/05-performance.md) |
| UI and UX | apple-design applied: springs without bounce unless momentum, interruptible motion, reduced motion as gentle cross-fades, reduced transparency and contrast support, eased theme change, fixed the Tailwind `dark:` variant that ignored the manual toggle. Keyboard-operable dropzone, labels, aria states, focus ring, skip link, per-page titles, AA contrast on pills and errors. Persian copy fixes (including a wrong word in the thin-wall warning). Privacy and terms pages (marked as drafts). | [`docs/06-ux-apple-design.md`](docs/06-ux-apple-design.md) |
| Delivery | Non-root, read-only containers with dropped capabilities and limits. Compose refuses to start without a secret. CI with tests, bandit, pip-audit, npm audit, build, hadolint, Trivy, SBOM, gitleaks, Semgrep, CodeQL and Dependabot. All actions pinned to commit SHAs. | [`docs/07-devsecops.md`](docs/07-devsecops.md) |

Performance cost of the security changes is stated per control in `docs/05-performance.md`. The notable ones: scrypt is about 100 ms per login on an idle machine (measured 225 ms under load) and is capped at 4 concurrent hashes; everything else is O(1) or removes work.

## 6. Evidence

| Check | Result |
|---|---|
| Regression suite on the original code (clean run, original dependencies) | 48 failed, 2 passed |
| Same suite on the final code (now 60 tests) | 60 passed in 15.5 s |
| Independent re-verification of the fixed code | 13 controls held; 12 issues found (1 high, 2 medium, 7 low, 2 info); all fixed or consciously accepted |
| Live probe of a running instance | 27 of 28 passed; the failure was a rate-limiter artefact |
| Login timing, known against unknown email | before 232.7 ms against 6.8 ms; after the two overlap |
| `bandit -ll` | no medium or high findings |
| OSV on installed backend packages | only `pip` itself (build tooling, removed from the runtime image) |
| Production build | passes; home route 167 kB first-load JS |
| Frontend type check | clean |
| Docker | `compose config` validates and refuses to start without `JWT_SECRET`; images not built (daemon down) |

## 7. Still open, accepted, or found but not fixed

Fixed code is not the same as a finished product. These need an owner's decision.

- **Security trade-offs I accepted:** the auth token is in `localStorage` (CSP limits exfiltration; HttpOnly cookies with CSRF is the planned fix); the rate limiter is per process; CSP keeps `script-src 'unsafe-inline'` for Next's bootstrap; register still says "email already registered"; about 100 requests across many IPs can lock one account for 10 minutes; manual-volume quotes are customer-declared by design.
- **Product gaps the audit exposed:** there is **no payment flow**, yet the landing copy says "Secure payment". There is no hub operator console and no link between a user and a hub, so only admins advance orders and an order without a hub can never get one. Pricing ignores each hub's hourly rate. Quantity-break pricing is not monotonic (24 pieces can cost more than 25). Seed data (8 hubs, 5 reviews, order counts) is invented. The review endpoint has no screen. Account deletion is promised on the privacy page but has no endpoint. The "become a producer" button leads to the login page.
- **Not built:** email verification and password reset, refresh tokens and revocation, Postgres with migrations, APK and IPA.

## 8. What I did not do, and why

| Not done | Why | What would close it |
|---|---|---|
| APK and IPA | You asked for the web app first. These need payment and store-policy decisions and developer accounts | Phase 3 of [`docs/10-implementation-plan.md`](docs/10-implementation-plan.md) (Trusted Web Activity or Capacitor) |
| Docker image build and scan | The Docker daemon was not running | `docker compose up --build`, then the Trivy step in CI |
| CI run on GitHub | The workflows were just added | Open the PR and watch the first run; expect to tune Semgrep and CodeQL |
| Lighthouse and a browser-driven upload flow | Memory pressure, and no browser automation installed beyond headless screenshots | Run Lighthouse and add a Playwright test |
| Deferred simplifications | About 440 lines of possible cleanup, mostly frontend, each needing another 6-minute build | [`docs/12-ponytail-review.md`](docs/12-ponytail-review.md) |
| Stopping the 29 other Claude sessions | They belong to other projects | Close them; they hold about 12 GB |

## 9. Skills

Loaded by the workers that did the related work (their own reports list them): backend-architect, fastapi-expert, fastapi-templates, python-fastapi-development, implementation-planner, security-auditor, security-audit, fastapi-security-scan, fastapi-attack-probe, red-team-tactics, red-team-tools, attack-tree-construction, backend-security-coder, apple-design, accessibility, hardening-docker-containers-for-production, implementing-devsecops-security-scanning, implementing-threat-intelligence-lifecycle-management, python-observability, backend-development-feature-development, python-testing-patterns, python-error-handling, python-background-jobs, frontend-security-coder, nextjs-best-practices, web-performance-optimization, ponytail and ponytail-review, graphify. Directly by me: ponytail (kept every change minimal, one runnable check per risky path), graphify (code graph in `graphify-out/GRAPH_REPORT.md`, 731 nodes, 33 communities, built without model calls), security-scanning-security-sast (bandit, OSV). `/security-audit` as a forked skill never returned a usable result, so its work was done by the workflows. `python-fastapi-development` advises async database access; this codebase uses synchronous SQLModel in the thread pool on purpose, and the docs say so. `python-background-jobs` was reviewed and no job queue is needed yet; moving mesh parsing to a worker is in the plan.

## 10. Branch, PR, how to run

- Branch `audit/security-perf-ux` on `donmemedo/Iran-3D-Hub`. PR link is in the final message of this session and in the pull request list.
- Left untracked on purpose: `HANDOFF.md` (superseded by this report and `docs/`) and `skills-lock.json` (not part of this work).
- Run it:

```bash
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up --build            # http://localhost:3560  API http://localhost:8400/api/health
# demo account and demo button (never in production):
SEED_DEMO=true NEXT_PUBLIC_DEMO=1 docker compose up --build
# tests, no server needed:
cd backend && python -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt && ./.venv/bin/python -m pytest
```

Open the app at `http://localhost:3560`, not `127.0.0.1`: CORS allows only the configured origin, and the quote page will show a network error otherwise.

## 11. Recommended next steps

1. Open the PR, let CI run, fix what it finds.
2. Decide on payments and the producer side; without them the marketplace cannot complete an order.
3. Replace "Secure payment" copy until a gateway exists.
4. Email verification and password reset, then HttpOnly cookie sessions.
5. Postgres with Alembic, then a Redis-backed limiter and a worker for mesh parsing.
6. Build the PWA store packages once 2 to 5 are in.
