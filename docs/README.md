# 3D Hub Iran: documentation index

Documentation for the hardening pass on branch `audit/security-perf-ux` (base commit `215bc8c`, current `47ba9b9`). Everything is written against the code as it is now; each claim cites `file:line` or a file in [evidence/](evidence/).

Documents 02 to 10 and `LAST_Report.md` are written by separate passes. A link stays dead until its file lands.

## Start here

| File | What it is |
|---|---|
| [00-implementation-report.md](00-implementation-report.md) | What the system is and does today: stack and versions, features by user journey, data model, API reference, configuration, frontend structure, build and run, what is not built, and points where code and notes disagree. Includes screenshots. |
| [01-architecture.md](01-architecture.md) | Component diagram, quote-to-order sequence, trust boundaries, and eight decision records (signed quotes, scrypt, rate limiter, SQLite, CSP, token storage, mesh parsing, roles). |
| [11-runbook.md](11-runbook.md) | Operating it: secrets, first run, demo mode, reverse proxy, backups, key rotation, dependency upgrades, logs and incident basics, health checks, limits, common errors. |

## Security, performance and UX analysis

| File | What it is |
|---|---|
| [02-threat-model-and-attack-tree.md](02-threat-model-and-attack-tree.md) | Assets, actors, trust boundaries and an attack tree for the marketplace. |
| [03-security-audit.md](03-security-audit.md) | The audit findings, their severity, the fix applied and the regression test for each. |
| [04-penetration-test.md](04-penetration-test.md) | Penetration test method and results, including the live probe. |
| [05-performance.md](05-performance.md) | Performance findings and fixes, with the measurements that exist and the ones that do not. |
| [06-ux-apple-design.md](06-ux-apple-design.md) | UI and UX pass: motion, materials, accessibility, Persian copy. |

## Process and planning

| File | What it is |
|---|---|
| [07-devsecops.md](07-devsecops.md) | CI, scanning, container hardening and repository guardrails. |
| [08-threat-intelligence-lifecycle.md](08-threat-intelligence-lifecycle.md) | How advisories and threat information are collected, triaged and acted on for this project. |
| [09-role-reviews.md](09-role-reviews.md) | Reviews of the result from the point of view of each role. |
| [10-implementation-plan.md](10-implementation-plan.md) | What to do next, in order, with risks and verification. |

## Other files

| File | What it is |
|---|---|
| [../LAST_Report.md](../LAST_Report.md) | Final report at the repository root. |
| [../HANDOFF.md](../HANDOFF.md) | The original audit findings and session notes (untracked), the starting point of this pass. |
| [../README.md](../README.md) | Project overview, quick start, configuration and security model. |

## Evidence

Raw results kept as files. Only numbers found here are quoted in the documents.

| File | What it holds |
|---|---|
| [evidence/baseline-original-code.txt](evidence/baseline-original-code.txt) | The 50-test regression suite run against the original code: 48 failed, 2 passed, with the failing test names. |
| [evidence/live-probe-result.json](evidence/live-probe-result.json) | 28 checks against a running stack; 27 passed. The one failure (login timing) was a rate-limiter measurement artefact. |
| [evidence/login-timing-after.txt](evidence/login-timing-after.txt) | Known against unknown email login timing after the fix, measured under a load average of about 40. |
| [evidence/frontend-build-routes.txt](evidence/frontend-build-routes.txt) | `next build` route table: sizes and first-load JS, all routes static. |
| [evidence/dependency-and-sast.txt](evidence/dependency-and-sast.txt) | OSV dependency scan and bandit result. |

## Assets

Screenshots in [assets/](assets/), used by the implementation report.

| File | Shows |
|---|---|
| [assets/home-dark.png](assets/home-dark.png) | Home page, dark theme, desktop. |
| [assets/home-light.png](assets/home-light.png) | Home page, light theme, desktop. |
| [assets/home-mobile.png](assets/home-mobile.png) | Home page at phone width. |
| [assets/quote-dark.png](assets/quote-dark.png) | Quote page, dark theme, empty state. |
| [assets/quote-light-en.png](assets/quote-light-en.png) | Quote page, light theme, empty state. The UI in the capture is Persian despite the file name. |
| [assets/hubs-dark.png](assets/hubs-dark.png) | Producer network page, dark theme. |
| [assets/login-dark.png](assets/login-dark.png) | Login page, dark theme, from a demo build. |

- [12-ponytail-review.md](12-ponytail-review.md): the simplicity review of the whole diff, what was applied and what is deferred.

> `file:line` references inside these documents were captured at commit `47ba9b9`; the later fix commit moved some lines by a few positions. The regression suite in `backend/tests/test_security.py` is the authoritative description of the enforced behaviour.
