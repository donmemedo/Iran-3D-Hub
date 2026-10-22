# Penetration test

State of the code: commit `47ba9b9` on branch `audit/security-perf-ux`; baseline `215bc8c`. This is the defensive record of the test: scope, rules, method, results and what was left untested. It describes weaknesses by class and gives no exploit payloads.

Related: [finding register](03-security-audit.md) (SEC-nn ids), [threat model and attack tree](02-threat-model-and-attack-tree.md), [implementation report](00-implementation-report.md). A bare file name follows the path key in section 1 of the register. Evidence files are in [evidence/](evidence/).

## 1. Scope and authorisation

**Target.** This repository: the FastAPI backend, the Next.js frontend, the Docker Compose files and the GitHub Actions workflows. The code under test is `47ba9b9`; the baseline for before and after comparisons is the MVP commit `215bc8c`.

**Where it ran.** On the tester's own machine, against the ASGI application loaded in a test process (`backend/tests/conftest.py`) and against a local running instance for the live probe. Every pytest case uses a fresh SQLite file in a private temporary directory (`conftest.py:21-22,39`). No real users, real orders or production data exist or were touched. No third-party system was a target. The only outbound traffic was the OSV.dev advisory lookup, which sends package names and versions (`HANDOFF.md`, appendix B).

**Authorisation.** The repository owner asked for this work. The request (`HANDOFF.md`, section 1) reads: "use red team agents and blue team agents and security skills to audit and solve all problems and of course do pen test for this project". The test is defensive: each backend weakness that could be exercised in-process became a test that asserts the safe behaviour, which fails on the vulnerable code and passes on the fixed code. Frontend findings were verified by reading code.

| In scope | Out of scope |
|---|---|
| The 20 HTTP routes (section 3), authentication and token handling, ordering and review logic, upload parsing, validation, headers and CORS, rate limits | TLS, a reverse proxy, DNS, the host and backups (none is in the repository) |
| Backend and frontend dependencies, static analysis of the backend | Docker image scanning and runtime (the Docker daemon was unavailable in this session) |
| Frontend configuration: CSP and headers, service worker, token storage | Browser-side XSS fuzzing, mobile builds, load testing at scale |

## 2. Rules of engagement

1. Local targets only. Nothing outside the tester's machine was probed.
2. Synthetic accounts and data only. Registered users get generated emails; the demo account is created only when `DEV` or `SEED_DEMO` is set (`seed.py:96-100`).
3. Denial-of-service tests stay small and bounded: one heavy upload (a 90k-triangle, 8.5 MB model), 214 health pings alongside it, a twelve-request login burst for the limiter, and an oversized-body check. No flood was generated.
4. The machine was short of memory during the work (`HANDOFF.md`, section 3), so servers were avoided where possible and the regression suite ran in-process. Absolute timings in the evidence are inflated by load (average about 40 for `login-timing-after.txt`).
5. No exploit payloads are published. Findings are recorded as a weakness, an evidence class, a fix and a test.
6. Stop and report if a real credential, secret or personal record turns up. None was encountered while reading the tree; gitleaks has not been run (no run record), so this is not a scan result.

## 3. Method

| Step | What was done | Output |
|---|---|---|
| 1. Recon from code | Read every router, schema, middleware and config file; listed routes and their dependencies | 20 routes: 12 public, 7 Bearer, 1 admin (section 4) |
| 2. Findings to tests | Turned each reported or newly found backend weakness into a pytest case that asserts the safe behaviour | `backend/tests/test_security.py`, 50 cases |
| 3. Baseline run | Ran that suite against `215bc8c` with its original pinned dependencies, in an isolated temporary directory | 48 failed, 2 passed (section 6) |
| 4. Authorisation matrix | Built the role by endpoint matrix from the routers and checked each cell against a test or a probe check | Section 4 |
| 5. Input and validation classes | Boundary numbers, NaN and Infinity, wrong types, oversized strings and bodies, enum violations, malformed JSON, hostile meshes, path-like filenames, malformed tokens | 15 parametrised cases plus targeted tests |
| 6. DoS resilience | One heavy parse with concurrent health pings; body limits; rate limits; parse-slot cap | Probe checks 22, 24, 25, 27, 28 and tests (section 5) |
| 7. Headers and CORS | API headers and CORS read from code and observed in the probe; Next.js headers read from `next.config.ts` and the local build's `.next/routes-manifest.json` | Probe checks 1 to 8; no live request to the Next server |
| 8. Dependencies and SAST | OSV query of every installed backend package; OSV check of `next`; `bandit -r backend/app -ll` | `evidence/dependency-and-sast.txt` |
| 9. Visual and UX checks | Headless Chrome screenshots of the main pages in both themes and a phone width | Images in `docs/assets/` |
| 10. Fix, re-test, re-probe | Fixes landed in three commits; the suite and the live probe were re-run; the timing check was re-measured | Sections 5 and 6 |

### Fuzz classes applied to the API

| Class | Where it applies | Cases |
|---|---|---|
| Numeric bounds, zero, negative, huge | quantity, infill, volume, bounding box | `test_manual_quote_rejects_bad_input` (15 cases), `test_analyze_form_bounds` |
| NaN and Infinity in JSON | volume, bounding box | `test_manual_quote_rejects_nan_and_inf` |
| Enum and pattern violations | quality, city, material slug, SQL-meta characters in a text field | in the 15 cases above |
| Oversize strings | names, phone, address, note, review body, filename | `test_password_policy_and_field_limits`, `test_order_field_limits` |
| Oversize bodies | JSON and multipart | `test_oversized_upload_is_rejected_early`; probe 'oversized JSON body' |
| Hostile meshes | zero bytes, a header that lies about the triangle count, out-of-range OBJ indices, empty file, random STEP bytes | `test_hostile_meshes_do_not_500` |
| Token abuse | no `sub`, non-numeric `sub`, wrong `typ`, `alg=none`, the old default secret, a quote used as a login token | `test_token_without_sub_is_401_not_500`, `test_quote_token_cannot_be_used_as_auth_token`; probe checks 10 and 11 |
| Parser limits | triangle cap in binary STL, ASCII STL and OBJ | `test_every_parser_honours_the_triangle_cap` |
| Filename handling | path separators, dot runs, length | `test_upload_filename_is_sanitised` |

## 4. Authorisation matrix

Roles: anonymous; customer who owns the object; customer who does not; a user whose role is `hub` (it has no extra rights, `security.py:143-147`); admin. "Allow" means 2xx. Expected values come from the routers; the last column says what was observed.

| Endpoint | Anonymous | Owner | Other customer | Hub role | Admin | Observed by |
|---|---|---|---|---|---|---|
| `GET /api/materials`, `/technologies`, `/qualities`, `/cities`, `/hubs`, `/hubs/{id}`, `/stats`, `/health` | allow | allow | allow | allow | allow | `test_cors_is_an_allowlist_without_credentials` (stats), `test_hub_detail_404_and_cancel_rules` (hubs), `test_material_and_technology_filters_match_whole_tokens`, `test_health_does_not_leak_configuration`; the rest by code (`catalog.py`) |
| `POST /api/auth/register` | allow, 429 after 10 per minute per IP | allow | allow | allow | allow | `test_login_and_register_are_rate_limited`; probe 'register ok' |
| `POST /api/auth/login` | allow, same bucket, plus 10 failures per email | allow | allow | allow | allow | same test; probe 'brute force throttled' |
| `GET /api/auth/me` | 401 | own data | own data | own data | own data | `test_token_without_sub_is_401_not_500`, `test_quote_token_cannot_be_used_as_auth_token`; probe checks 10 and 11 |
| `POST /api/quotes/analyze` | allow, 30 per minute per IP, 2 parses | allow | allow | allow | allow | `test_uploads_are_rate_limited_and_parses_are_capped`, `test_hostile_meshes_do_not_500` |
| `POST /api/quotes/manual` | allow, no per-IP limit (SEC-79) | allow | allow | allow | allow | `test_manual_quote_rejects_bad_input` |
| `GET /api/quotes/{id}` | 401 | allow | 404 | 404 | 404 | `test_persisted_quote_is_owner_only` covers anonymous, other customer and owner; hub and admin by code (`quotes.py:141-142`) |
| `POST /api/orders` | 401 | allow with a valid signed quote | allow with a quote token they hold | allow | allow | probe 'orders require auth'; `test_order_materialises_quote_and_rejects_tampering` |
| `GET /api/orders` | 401 | own rows only | own rows only | own rows only | own rows only | code (`orders.py:80`); isolation between users has no dedicated test |
| `GET /api/orders/{id}` | 401 | allow | 404 | 404 | 404 | probe 'another user cannot read or cancel the order'; owner read in `test_customer_cannot_advance_their_own_order` |
| `POST /api/orders/{id}/advance` | 401 | 403 | 403 | 403 | allow | `test_customer_cannot_advance_their_own_order`, `test_only_admin_can_advance_orders` (hub role 403, admin 200); anonymous by code (`security.py:113-114`) |
| `POST /api/orders/{id}/cancel` | 401 | allow until shipped, then 400 | 404 | 404 | 404 | other customer: probe. Owner cancel and the 400 after shipping have no test (see the register, section 5) |
| `POST /api/orders/reviews` | 401 | allow once, delivered orders only | 403 | 403 | 403 | `test_review_requires_a_delivered_order_and_is_one_per_order` (owner before delivery 403, other customer 403, repeat 409, rating 99 gives 422); anonymous and admin by code |
| `GET /docs`, `/openapi.json`, `/redoc` | 404 | 404 | 404 | 404 | 404 | `test_api_sends_security_headers_and_hides_docs`; probe 'docs hidden' |

No difference between expected and observed was found. Admin accounts have no read access to other customers' orders or quotes, which is intended. Cells that rest on code reading only are named in the last column.

## 5. Results: live probe

Source: `evidence/live-probe-result.json`, 28 checks, 27 passed. The JSON records each check, a pass flag and a detail string. It does not record the host, commit, timestamp or the response status of every request, and the script that produced it is not in the repository. The last column maps each check to a register row.

| # | Check | Result | Detail from the JSON | Register |
|---|---|---|---|---|
| 1 | security headers present | pass | - | SEC-67 |
| 2 | no server banner | pass | - | SEC-67 |
| 3 | /docs and /openapi.json hidden | pass | - | SEC-29 |
| 4 | validation errors do not echo input | pass | - | SEC-65 |
| 5 | CORS preflight denied for https://evil.example | pass | status 400 | SEC-21 |
| 6 | CORS preflight denied for http://localhost:1337 | pass | status 400 | SEC-21 |
| 7 | CORS allows configured origin, no credentials flag | pass | - | SEC-21 |
| 8 | catalog GET is cacheable, auth is no-store | pass | - | SEC-67 |
| 9 | orders require auth | pass | - | guard: the original also required a Bearer token |
| 10 | token signed with the old public default secret is rejected | pass | - | SEC-08 |
| 11 | alg=none token rejected | pass | - | guard: the original already pinned `algorithms` |
| 12 | register ok | pass | - | guard |
| 13 | empty / short password rejected | pass | - | SEC-15 |
| 14 | 30 mm cube measures 27.0 cm3 exactly | pass | total 231000 | guard: HANDOFF's smoke test of the original also gave 27.0 cm3 and 231,000 |
| 15 | quote returns signed token and stores nothing | pass | - | SEC-19, SEC-61 |
| 16 | tampered price rejected at order time | pass | - | SEC-12, SEC-61 |
| 17 | legit order created at signed price | pass | H3D-C0B9FCE98892A639 | guard |
| 18 | customer cannot advance own order to delivered | pass | - | SEC-09 |
| 19 | another user cannot read or cancel the order | pass | - | guard: the original also checked the owner |
| 20 | review before delivery refused | pass | - | SEC-18 |
| 21 | negative quantity refused | pass | - | SEC-10 |
| 22 | oversized JSON body -> 413 before parsing | pass | - | SEC-11 |
| 23 | unsupported extension refused | pass | - | SEC-64 |
| 24 | heavy 90k-triangle upload parsed | pass | 8.5 MB in 21.00s | SEC-11, SEC-62 |
| 25 | API stays responsive during the parse | pass | health p50 51 ms, max 1022 ms over 214 pings | SEC-11 |
| 26 | login timing: known vs unknown email within 2x | **FAIL** | known 1535 ms, unknown 16 ms | SEC-16 |
| 27 | brute force throttled with 429 + Retry-After | pass | [401, 401, 401, 401, 401, 401, 401, 401, 429, 429, 429, 429] | SEC-13 |
| 28 | Retry-After header sent | pass | - | SEC-13 |

### The one failing check

Check 26, 'login timing: known vs unknown email within 2x', failed with `known 1535 ms, unknown 16 ms`. This is a measurement artefact, not a regression:

1. On the fixed code the handler cannot answer an unknown email in 16 ms: it always runs a full dummy hash (`auth.py:44-46`, `security.py:58-63`), which costs about what a real check costs.
2. The only quick answers are the two early exits that run before any hashing: the per-IP bucket, a route dependency (`ratelimit.py:63-66`), and the per-email failure budget at the top of the handler (`auth.py:41-42`). Both return 429.
3. The probe's checks share one client address, and register and login share one bucket. Check 27 saw eight 401s before the first 429 instead of ten (assuming the default `LOGIN_RATE_LIMIT` of 10), so earlier requests from the same probe had already used part of that bucket in the same minute. The probe was running close to the limit when it timed the unknown email.
4. The JSON stores neither the status code of the two timing requests nor the commit under test. The cause (a 429 that skipped hashing) is therefore an inference from the code path, not a recorded fact.

The check was re-measured with throttling out of the way in `evidence/login-timing-after.txt`. Every request in both runs returned 401:

| Run | Known email, wrong password | Unknown email, wrong password |
|---|---|---|
| 1 | median 1283 ms, min 769, max 1732 | median 1162 ms, min 392, max 2339 |
| 2 | median 770 ms, min 469, max 1293 | median 843 ms, min 666, max 1243 |

The ranges overlap in both runs and the larger median swaps sides between runs, so no timing difference between known and unknown emails is visible. The machine load average was about 40, so the absolute numbers are inflated and say nothing about scrypt cost on an idle machine. The sample count is not recorded in the file. For scale, on the original code the same comparison gave 232.7 ms for a known email and 6.8 ms for an unknown one, about 34 times (the HANDOFF finder run; its raw output is not in `docs/evidence/`).

## 6. Baseline comparison: original code against fixed code

`evidence/baseline-original-code.txt`: the regression suite (50 cases) run against `215bc8c` with its original pinned dependencies in an isolated temporary directory: **48 failed, 2 passed in 361.37 s**. On the fixed code all 50 pass (project record; not re-run while writing this document). The 48 failures grouped by finding:

| Finding | Tests that failed on the original code | Failed |
|---|---|---|
| SEC-08 | `test_default_or_weak_jwt_secret_refuses_to_start`, `test_dev_mode_generates_a_random_secret_instead_of_the_default` | 2 |
| SEC-26 | `test_token_without_sub_is_401_not_500` | 1 |
| SEC-13 | `test_login_and_register_are_rate_limited` | 1 |
| SEC-15 | `test_password_policy_and_field_limits`, `test_order_field_limits` | 2 |
| SEC-69 | `test_email_is_case_normalised_so_no_duplicate_accounts` | 1 |
| SEC-14 | `test_legacy_pbkdf2_hash_still_logs_in_and_is_upgraded_to_scrypt` | 1 |
| SEC-09 | `test_customer_cannot_advance_their_own_order`, `test_only_admin_can_advance_orders` | 2 |
| SEC-19 | `test_quoting_never_writes_to_the_database` | 1 |
| SEC-12 | `test_order_materialises_quote_and_rejects_tampering`, `test_order_rejects_a_hub_that_cannot_make_the_part`, `test_order_requires_existing_hub`, `test_order_ids_are_long_and_unique_in_schema` (the last test also asserts the `user_id` index (SEC-32)) | 4 |
| SEC-18 | `test_review_requires_a_delivered_order_and_is_one_per_order` | 1 |
| SEC-20 | `test_persisted_quote_is_owner_only` | 1 |
| SEC-25 | `test_hub_detail_404_and_cancel_rules` (the test name mentions cancel rules, but only the hub 404 and 200 are asserted) | 1 |
| SEC-10 | `test_manual_quote_rejects_bad_input[over0..over14]`, `test_manual_quote_rejects_nan_and_inf`, `test_analyze_form_bounds` (15 parametrised cases, one NaN and Infinity test, one form-bounds test) | 17 |
| SEC-22 | `test_zero_bbox_does_not_crash` | 1 |
| SEC-23 | `test_material_and_technology_filters_match_whole_tokens` | 1 |
| SEC-11 | `test_analyze_is_not_an_async_def_blocking_the_loop`, `test_oversized_upload_is_rejected_early`, `test_every_parser_honours_the_triangle_cap`, `test_hostile_meshes_do_not_500` (`test_hostile_meshes_do_not_500` also depends on the zero-box fix (SEC-22)) | 4 |
| SEC-62 | `test_uploads_are_rate_limited_and_parses_are_capped` | 1 |
| SEC-63 | `test_upload_filename_is_sanitised` | 1 |
| SEC-67 | `test_api_sends_security_headers_and_hides_docs` (also asserts that `/docs` and `/openapi.json` are hidden (SEC-29)) | 1 |
| SEC-21 | `test_cors_is_an_allowlist_without_credentials` | 1 |
| SEC-66 | `test_health_does_not_leak_configuration` | 1 |
| SEC-33 | `test_sqlite_runs_in_wal_mode_with_busy_timeout` | 1 |
| SEC-31 | `test_dashboard_listing_is_not_n_plus_one` | 1 |
| **Total** | | **48** |

The two cases that passed on the original code are guards, not findings: `test_quote_token_cannot_be_used_as_auth_token` (quote tokens did not exist yet) and `test_price_is_never_negative_or_zero` (a tiny volume with quantity 1 already hit the minimum charge; the negative-quantity hole is proved by the parametrised cases in SEC-10).

A failing test shows the safe behaviour was absent; it does not by itself show an exploit. For the findings reported as exploitable (default secret, self-advance, negative price, event-loop stall) the original code paths are cited in the register.

## 7. Severity counts, before and after

Counts are rows of the register (`03-security-audit.md`). "Before" counts rows present on `215bc8c`; four rows describe gaps introduced by the fixes and are excluded from "Before" and included in "Still carried". "Still carried" is Mitigated plus Accepted plus Open.

| Severity | Before (on `215bc8c`) | Fixed | Still carried | of which Open |
|---|---|---|---|---|
| Critical | 2 | 2 | 0 | 0 |
| High | 8 | 8 | 0 | 0 |
| Medium | 27 | 20 | 7 | 1 |
| Low | 34 | 23 | 16 | 3 |
| Info | 8 | 4 | 4 | 1 |
| **Total** | **79** | **57** | **27** | **5** |

Reading it: every Critical and High row is Fixed. What remains is Medium and below: 7 Medium, 16 Low and 4 Info rows are still carried (5 of them Open). The remaining rows are listed with reasons in section 6 of the register.

## 8. Tools

| Tool | Used for | Result recorded |
|---|---|---|
| In-process pytest harness (`backend/tests/conftest.py`, FastAPI `TestClient`, `httpx`) | The regression suite: real app, middleware and start-up seed on a fresh SQLite file; no server, no network | Baseline 48 of 50 failing; current 50 of 50 passing (project record) |
| `curl` and `httpx` probes against a local instance | The live probe: headers, CORS, auth, ordering, uploads, throttling | `evidence/live-probe-result.json`, 27 of 28 |
| OSV.dev API | Advisory lookup for every installed backend package and for `next` | `evidence/dependency-and-sast.txt` |
| `bandit -r backend/app -ll` | Python SAST, medium severity and above | No medium or high findings |
| Headless Chrome | Screenshots for visual checks in both themes and at phone width | `docs/assets/` |
| `next build` output | Route sizes and static prerendering | `evidence/frontend-build-routes.txt` |

Configured in the repository but with no run record in `docs/evidence/`: `pip-audit` and `npm audit` (`ci.yml:40-41,61-62`), Semgrep with `.semgrep.yml` and the OWASP pack, gitleaks, CodeQL, dependency review, hadolint, Trivy and Syft (`ci.yml`, `security.yml`). They are listed in the register as gates, not as results.

To re-run what exists: from `backend/`, `python -m pytest` (or `make test`) runs the suite; `make audit` runs bandit, pip-audit and npm audit.

## 9. What was not tested

- **Browser XSS fuzzing.** No payload was injected into any page. The statement "no data-bearing injection sink" rests on reading the code (one `dangerouslySetInnerHTML`, a constant string) and on a Semgrep rule that is configured but has no run record, not on an attack.
- **TLS and the proxy layer.** None exists in the repository. HSTS, forwarded headers, proxy body limits and real client addresses were not exercised.
- **Load at scale.** One heavy parse and a twelve-request burst only. The 250,000-triangle worst case, its memory against the 512 MB limit, many simultaneous 60 MiB uploads against the 128 MB upload tmpfs, and sustained load were not measured.
- **Docker images.** The Docker daemon was unavailable in this session: no image was built, scanned (Trivy) or run, and the non-root, read-only and capability settings were read, not exercised.
- **Mobile builds.** Only the installable PWA exists; no native build was tested.
- **The Next.js server.** Its headers were read from the config and the local build manifest; no request was made to a running Next server, and there are no frontend tests.
- **Concurrency races.** The compare-and-set status update (`orders.py:98-107`) and the duplicate-review race have no concurrent test.
- **Legacy data.** The upgrade path on a database created before the audit, including mixed-case emails (SEC-70), was not exercised. Only the PBKDF2 to scrypt hash upgrade is tested (`test_legacy_pbkdf2_hash_still_logs_in_and_is_upgraded_to_scrypt`).
- **Postgres.** Only SQLite was used.
- **Authenticated multi-user flows in a browser.** The matrix was checked through the API.

## 10. Suggested next tests

1. Cancel rules and the `409 order_changed` path, with a concurrent client.
2. Absence of the demo account by default, the extension allow-list, the validation-error shape and reviewer privacy: each is fixed but has no regression test.
3. A request-level check of the Next.js response headers on a built image.
4. A parse-time and memory measurement at the 250,000-triangle cap, with two parses in parallel inside the 512 MB container.
5. A frontend test runner for the redirect guard and the service worker.
6. Commit the probe script next to its output so the live probe can be repeated.


## Addendum: independent re-verification of the fixed code

After the fixes, a second reviewer with no stake in the implementation re-attacked the final backend code. It read every file, then ran ten in-process scripts using the pytest harness (no server, no network, own temporary database) against these questions: can the body limit or the limiters be bypassed or abused, can quote tokens be reused harmfully, does any route leak data, can logs be forged, can a hostile mesh still exhaust memory, are there races or integer edge cases, does the config guard hold.

Result: thirteen controls held (JWT algorithm, issuer, expiry and type pinning; quote key separation; role taken from the database; ownership checks; request validation; WAL and compare-and-set transitions; CORS and headers; and others). Twelve issues were reproduced and are listed as RT-01 to RT-12 in `03-security-audit.md`, one high (mesh parsers), two medium, the rest low or informational. All were fixed or consciously accepted in the commit that followed, with a regression test each. Final state: 60 of 60 regression tests pass.

Severity count of confirmed findings. Original code: 3 critical, 7 high, 12 medium, the rest low or informational (register in `03`). After the fixes and the re-verification: 0 critical, 0 high, the medium and low items listed as Accepted in `03`.
