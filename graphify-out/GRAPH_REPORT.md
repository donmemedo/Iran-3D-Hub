# Graph Report - Iran-3D-Hub  (2026-10-22)

## Corpus Check
- 68 files · ~178,366 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: (none) 7, .woff2 3, .example 2)

## Summary
- 731 nodes · 1653 edges · 33 communities (29 shown, 4 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 334 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `938e7859`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app/page.tsx
- Test harness and regression suite
- orders.py
- security.py
- ratelimit.py
- Frontend dependencies
- current_user
- TypeScript compiler config
- Mesh geometry parsers
- Global exception handlers
- Service worker caching
- next
- useApp
- postcss.config.mjs
- docs/README.md
- 3D Hub Iran: implementation report
- 7. Phase 3: PWA hardening and store packaging
- Providers.tsx
- main.py
- Session handoff: security, performance and UX audit of Iran-3D-Hub
- middleware.py
- quote/page.tsx
- 3D Hub Iran: threat-intelligence lifecycle for dependencies
- 2. Controls: security gain against performance cost
- 3D Hub Iran: delivery pipeline and DevSecOps
- login/page.tsx
- هاب سه‌بعدی ایران — 3D Hub Iran
- 4. Register
- 1. Apple design principles as applied
- Penetration test
- RegisterIn
- config.py

## God Nodes (most connected - your core abstractions)
1. `4.2 Backend (HANDOFF section 5: items 1 to 16, then low and info)` - 37 edges
2. `6. Baseline comparison: original code against fixed code` - 35 edges
3. `User` - 28 edges
4. `useApp()` - 27 edges
5. `manual_quote()` - 23 edges
6. `Hub` - 21 edges
7. `register()` - 20 edges
8. `api()` - 20 edges
9. `login()` - 18 edges
10. `next` - 18 edges

## Surprising Connections (you probably didn't know these)
- `3. Coverage of HANDOFF` --references--> `utcnow()`  [INFERRED]
  docs/03-security-audit.md → backend/app/models.py
- `1.2 Repo-specific Semgrep rules (`.semgrep.yml`)` --references--> `utcnow()`  [INFERRED]
  docs/07-devsecops.md → backend/app/models.py
- `3. Red Team` --references--> `hit()`  [INFERRED]
  docs/09-role-reviews.md → backend/app/ratelimit.py
- `3. Trust boundaries` --references--> `advance()`  [INFERRED]
  docs/01-architecture.md → backend/app/routers/orders.py
- `Roadmap pointers` --references--> `advance()`  [INFERRED]
  README.md → backend/app/routers/orders.py

## Import Cycles
- None detected.

## Communities (33 total, 4 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.17
Nodes (28): Components and libraries, Card(), Dashboard(), errCode(), errText(), Row, errText(), Hub (+20 more)

### Community 1 - "Test harness and regression suite"
Cohesion: 0.08
Nodes (72): ascii_stl(), c(), _cleanup_tmp(), client(), cube_stl(), fresh_app(), login(), manual_quote() (+64 more)

### Community 2 - "orders.py"
Cohesion: 0.06
Nodes (54): analyse(), MeshStats, Hub, Material, Order, Quote, Review, User (+46 more)

### Community 3 - "security.py"
Cohesion: 0.18
Nodes (11): login(), me(), _public(), register(), create_token(), dummy_verify(), hash_password(), needs_rehash() (+3 more)

### Community 4 - "ratelimit.py"
Cohesion: 0.17
Nodes (9): auth_limit(), client_ip(), forget(), hit(), over(), _prune(), too_many(), 6.1 Goal and tasks (+1 more)

### Community 5 - "Frontend dependencies"
Cohesion: 0.06
Nodes (30): dependencies, framer-motion, next, react, react-dom, three, devDependencies, tailwindcss (+22 more)

### Community 6 - "current_user"
Cohesion: 0.05
Nodes (38): current_user(), require_admin(), 2. Request flow: quote to order, 3. Trust boundaries, 3D Hub Iran: architecture and decisions, 4. Architecture decision records, 5. Decisions deferred, ADR-1: Stateless signed quotes (+30 more)

### Community 7 - "TypeScript compiler config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 8 - "Mesh geometry parsers"
Cohesion: 0.22
Nodes (6): _parse_ascii_stl(), _parse_binary_stl(), _parse_obj(), _signed_volume(), _stats_from_triangles(), _tri_area()

### Community 10 - "Service worker caching"
Cohesion: 0.47
Nodes (4): cacheable(), networkFirst(), SHELL, staleWhileRevalidate()

### Community 11 - "next"
Cohesion: 0.07
Nodes (15): apiOrigin(), config, csp, immutable, metadata, metadata, metadata, metadata (+7 more)

### Community 12 - "useApp"
Cohesion: 0.14
Nodes (15): metadata, RootLayout(), viewport, CONTENT, DraftNotice(), PrivacyPage(), Section, Footer() (+7 more)

### Community 15 - "docs/README.md"
Cohesion: 0.10
Nodes (23): 3D Hub Iran: runbook, Backups, Before exposing it to the internet, Common errors, Demo mode, First run, Generate secrets, Health checks (+15 more)

### Community 16 - "3D Hub Iran: implementation report"
Cohesion: 0.07
Nodes (27): 10. Points found while writing this report, 1. Purpose and scope, 2. Stack and versions, 3. Features by user journey, 3D Hub Iran: implementation report, 5. API reference, 6. Configuration, 7. Frontend structure (+19 more)

### Community 17 - "7. Phase 3: PWA hardening and store packaging"
Cohesion: 0.08
Nodes (25): 1. Objective and the state the plan starts from, 2. Phases at a glance, 3. Estimate and scope summary, 3D Hub Iran: implementation plan, 4. Phase 0: this PR (done), 6.2 Design notes, 6.3 Acceptance criteria, 6.4 Risks (+17 more)

### Community 18 - "Providers.tsx"
Cohesion: 0.19
Nodes (16): Deferred (candidates for a cleanup PR), AppCtx, AuthRes, Ctx, Providers(), SkipLink(), Theme, User (+8 more)

### Community 19 - "main.py"
Cohesion: 0.14
Nodes (6): get_session(), init_db(), _pragmas(), health(), lifespan(), 2. Tech Lead

### Community 20 - "Session handoff: security, performance and UX audit of Iran-3D-Hub"
Cohesion: 0.11
Nodes (17): 1. The original request, 2. Status at a glance, 3. Environment problems to fix first, 4. Verified: vulnerable dependencies, 6. Frontend findings from code review, 7. Plan for the next session, Accessibility, Appendix A: in-process test harness (+9 more)

### Community 21 - "middleware.py"
Cohesion: 0.14
Nodes (5): BodyLimit, _reject(), SecureHeaders, peer_ip(), 1. Components

### Community 22 - "quote/page.tsx"
Cohesion: 0.17
Nodes (15): Cell(), errCode(), errText(), EXTS, FILE_WARNINGS, Hub, Match, Material (+7 more)

### Community 23 - "3D Hub Iran: threat-intelligence lifecycle for dependencies"
Cohesion: 0.13
Nodes (15): 1.1 What we protect, 1.2 Priority intelligence requirements, 1. Direction, 2. Collection, 3. Processing and triage, 3D Hub Iran: threat-intelligence lifecycle for dependencies, 4.1 Worked example: the Next.js flight-protocol RCE (GHSA-9qr9-h5gf-34mp), 4.2 Worked example: PyJWT advisories that did not apply (+7 more)

### Community 24 - "2. Controls: security gain against performance cost"
Cohesion: 0.14
Nodes (14): 1. What was measured, and what was not, 2.1 Password hashing and abuse limits, 2.4 Frontend delivery, 2.5 Container limits, 2.6 Upload path, 2. Controls: security gain against performance cost, 3. Limits that remain, 3D Hub Iran: security with performance (+6 more)

### Community 25 - "3D Hub Iran: delivery pipeline and DevSecOps"
Cohesion: 0.14
Nodes (14): 1.1 Gates, 1.2 Repo-specific Semgrep rules (`.semgrep.yml`), 1. Pipeline and gates, 2. Container hardening, 3. Supply chain, 3D Hub Iran: delivery pipeline and DevSecOps, 4. Secrets handling, 5. Branch protection recommendations (+6 more)

### Community 26 - "login/page.tsx"
Cohesion: 0.23
Nodes (12): 5. QA/QC, Edge cases worth a test, Minimal next tests, AuthError, authMessage(), Field(), LoginInner(), LoginPage() (+4 more)

### Community 27 - "هاب سه‌بعدی ایران — 3D Hub Iran"
Cohesion: 0.14
Nodes (13): API surface, CI and security pipeline, Configuration, Highlights, Local development, Project layout, Quick start (Docker), Roadmap pointers (+5 more)

### Community 28 - "4. Register"
Cohesion: 0.17
Nodes (12): 1. How to read this register, 2. Summary, 3. Coverage of HANDOFF, 4.1 Dependencies (HANDOFF section 4), 4.4 Frontend security (HANDOFF section 6), 4.5 Frontend performance (HANDOFF section 6), 4.6 UI/UX, apple-design (HANDOFF section 6), 4.7 Accessibility (HANDOFF section 6) (+4 more)

### Community 29 - "1. Apple design principles as applied"
Cohesion: 0.17
Nodes (12): 1.1 Reduced motion means gentler, not absent, 1.2 Reduced transparency and more contrast, 1.3 Typography: Persian against Latin, 1.4 Suspected defect, not tested in a browser, 1. Apple design principles as applied, 2. Accessibility checklist (WCAG 2.2), 3.1 Fixed since the audit, 3.2 Copy gaps that remain (+4 more)

### Community 30 - "Penetration test"
Cohesion: 0.18
Nodes (11): 10. Suggested next tests, 1. Scope and authorisation, 2. Rules of engagement, 3. Method, 5. Results: live probe, 7. Severity counts, before and after, 8. Tools, 9. What was not tested (+3 more)

### Community 31 - "RegisterIn"
Cohesion: 0.20
Nodes (8): RegisterIn, 1. Product Owner, 3. Red Team, 3D Hub Iran: role reviews, 4. Blue Team, How to read this document, Summary, Themes across the seats

## Knowledge Gaps
- **8 isolated node(s):** `react-dom`, `@tailwindcss/postcss`, `@types/node`, `@types/react`, `@types/react-dom` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 310 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `api()` connect `Providers.tsx` to `app/page.tsx`, `login/page.tsx`, `current_user`, `quote/page.tsx`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Are the 36 inferred relationships involving `4.2 Backend (HANDOFF section 5: items 1 to 16, then low and info)` (e.g. with `lifespan()` and `Quote`) actually correct?**
  _`4.2 Backend (HANDOFF section 5: items 1 to 16, then low and info)` has 36 INFERRED edges - model-reasoned connections that need verification._
- **What connects `react-dom`, `@tailwindcss/postcss`, `@types/node` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Test harness and regression suite` be split into smaller, more focused modules?**
  _Cohesion score 0.08039950062421973 - nodes in this community are weakly interconnected._
- **Why does `4.9 New in this pass` connect `Test harness and regression suite` to `app/page.tsx`, `4. Register`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 34 inferred relationships involving `6. Baseline comparison: original code against fixed code` (e.g. with `test_analyze_form_bounds()` and `test_analyze_is_not_an_async_def_blocking_the_loop()`) actually correct?**
  _`6. Baseline comparison: original code against fixed code` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Should `orders.py` be split into smaller, more focused modules?**
  _Cohesion score 0.061782661782661785 - nodes in this community are weakly interconnected._