# ScanDock WMS — end-to-end test plan

*Owner: QA · Version 1.0 · Status: living document, updated with every sprint*

This is the plan a QA engineer would write for a release of ScanDock: what we test, how, with what data, where it
runs, and what "done" means. It is written to be reusable: swap the product name and most of it applies to any
scanning/WMS application that sits on top of an ERP.

## 1. Objectives

1. Prove that the three warehouse flows that move money (**receive → pick → ship**) and the two that protect accuracy
   (**transfers, cycle counts**) work end to end on the device operators actually use (handheld, scan + Enter).
2. Prove the **ERP contract**: orders come in exactly once, documents go out exactly once, and an ERP outage never
   stops the floor.
3. Catch regressions early and cheaply: most rules are checked at the API level in seconds, the UI suite checks what
   only the UI can break, and a handful of journeys check the whole thing together.
4. Leave a traceable record: every requirement in [REQUIREMENTS.md](REQUIREMENTS.md) maps to tests
   ([TRACEABILITY.md](TRACEABILITY.md)), and every run produces a JUnit file Jira/X-ray can import.

## 2. Scope

**In scope:** handheld workflows (receiving, picking, shipping, transfers, cycle counts, inquiry, labels), admin console
(dashboard, inventory, items, bins, orders, counts, users, ERP sync, transactions, settings), REST API, ERP sync in both
directions, role-based access, settings-driven behaviour, accessibility of main screens, visual stability of key screens,
basic performance of read endpoints, resilience to ERP failure.

**Out of scope (this release):** real ERP connectors (NetSuite/SuiteScript), real printers and scanners (we test the
ZPL and the keyboard-wedge behaviour, not hardware), license plates, packing/cartonization, manufacturing, offline mode,
localisation, penetration testing (a basic auth/RBAC check is in scope).

## 3. Test approach (the pyramid, with numbers)

| Layer | Tool | Count | What it is for | Runs in |
|---|---|---:|---|---|
| Unit | Jasmine (API), Vitest (web) | ~50 | Pure rules: UPC check digits, shipping rules at every boundary, variance math, ZPL escaping, scan normalisation, API client error mapping | < 2 s, every push |
| API / contract | Playwright `request` (no browser) | ~125 | Every business rule and error code through the public API; RBAC matrix; zod contracts; idempotency; a concurrency race | ~6 s, every push |
| UI — handheld | Playwright, Pixel 7 emulation, Chromium | ~65 | What a scanner operator does: scan → feedback → next step; wrong scans; stepper limits; status screens | ~10 s |
| UI — console | Playwright, desktop Chromium | ~30 | Lists/filters/pagination in the URL, modals and their validation, approvals, sync | ~10 s |
| Journeys | Playwright, role switching | 3 | ERP order → receive → pick → ship → ERP fulfillment; count → approve → ERP adjustment; short pick → ship | ~15 s |
| Accessibility | @axe-core/playwright | 4 scans / 25 screens | WCAG 2.1 A/AA, fail on serious/critical | ~10 s |
| Visual | Playwright screenshots (Docker image only) | 3 | Login, handheld menu/transfer, console settings/dashboard (dynamic regions masked) | CI / docker |
| Cross-browser smoke | Playwright Firefox + WebKit | 2 × 2 | The critical path renders and works outside Chromium | ~10 s |
| Serial / global-state | Playwright, one worker, last | 7 | Settings that change behaviour for everyone; ERP outage, retry, latency | ~20 s |
| Performance smoke | k6 | 1 script | p95 < 300 ms on inquiry/pick-list/dashboard under 10 VUs | manual / nightly |

Principles:

* **Test data is created, not assumed.** A `Factory` creates items/bins/orders with unique codes through the public API,
  so hundreds of tests run in parallel on one database and never fight over seed rows. Seed data is used read-only
  (e.g. "KITE-DELTA is low stock").
* **Assert through the API after acting through the UI** (and vice versa). The UI test that receives a PO checks the
  stock via `GET /api/inventory/bin/:code`; the API picking tests check the ledger. Cheap and unambiguous.
* **Locators are what users see**: roles, labels, text; `data-testid` only for containers without a natural name.
* **Retrying assertions only** (`expect(locator).toHaveText…`), never `allTextContents()` snapshots after a navigation
  (that was a real flake we removed).
* **Global state is isolated**: anything that flips a setting or breaks the ERP runs in the `serial` project after
  everything else and restores the defaults.
* **The ledger invariant is a test**: `GET /api/inventory/invariants` proves on-hand equals the sum of transactions.

## 4. Test environments

| Environment | How | Used for |
|---|---|---|
| Local dev | `npm run dev` (Vite + tsx watch + ERP mock + Postgres container) | writing tests, debugging with `--ui` / trace viewer |
| Local Docker | `npm run up` then `npm run test:e2e` or `npm run test:e2e:docker` | what CI does, visual baselines |
| CI (GitHub Actions) | compose stack per job, Playwright image, 3 shards, merged HTML + JUnit | every push / PR |

Browsers: Chromium (all projects), Firefox and WebKit (smoke). Devices: Pixel 7 emulation for the handheld
(viewport, touch, UA), 1280×800 desktop for the console.

## 5. Test data strategy

* **Seed** (`apps/api/src/db/seed-data.ts`): 41 items (5 lot-tracked, 4 low-stock), 37 bins in 5 zones, 6 POs and 9
  SOs in every status, 5 cycle counts in every status, 5 users (one inactive). Rebuilt by `POST /api/test/reset`
  before every suite run (global setup).
* **Factory** (`e2e/support/factory.ts`): `item()`, `bin()`, `purchaseOrder()`, `salesOrder()`, `stock()` (a PO received
  into a bin), `stockedItem()`, `cycleCount()`, `user()`. Codes are unique per call (`T-<time><random>`).
* **ERP mock data**: `POST /erp/purchase-orders|sales-orders` to create upstream orders; `/erp/_chaos` for outages.
* **Secrets:** none. Demo PINs are `1234` and only exist in the toy.

## 6. Entry and exit criteria

**Entry (a build is testable):** `docker compose up --wait` reports every service healthy; `/api/health` is `ok`;
`npm run typecheck`, `lint` and unit tests pass; the seed loads.

**Exit (release candidate):** 100% of must-have requirements have passing automated coverage; no open Blocker/Critical
defects; no serious/critical accessibility violations on main screens; visual baselines reviewed; k6 smoke within
thresholds; exploratory session notes attached to the release ticket; traceability check green.

## 7. Defect management

* Logged in Jira with the template in [BUG-REPORTS.md](BUG-REPORTS.md): steps, expected/actual, environment, severity
  (impact) and priority (urgency) kept separate, trace/screenshot attached (Playwright keeps traces on first retry
  and screenshots/videos on failure).
* Every fixed bug gets a regression test named after the ticket (`SD-123 …`) or tagged with its requirement.
* Triage daily in stand-up; Blockers interrupt the sprint.

## 8. Jira / X-ray workflow

1. Requirements are Jira stories; each has an id (`REQ-0xx` here, the story key in real life).
2. X-ray **Test** issues map 1:1 to automated tests (title = test title); **Test Sets** group them by area; a **Test Plan**
   per release lists what must pass.
3. CI publishes `junit/results.xml`; `scripts/xray-import.ts` posts it to X-ray as a **Test Execution** (one per run), so
   the Test Plan shows live pass/fail per requirement.
4. Manual/exploratory tests are X-ray tests too, executed by hand and recorded in the same plan.

## 9. Shift-left practices

* Tests live next to the code and run on every PR; a PR cannot merge with red API/UI suites.
* The API has a **contract suite** so front-end and back-end can change independently and find out immediately.
* QA pairs with developers on acceptance criteria before coding (the REQ table is written in Given/When/Then spirit).
* Developers can run the exact CI command locally (`npm run test:e2e:docker`).
* Fast feedback order: typecheck → unit → API (6 s) → UI; most mistakes surface before a browser opens.

## 10. Non-functional

* **Performance:** `perf/smoke.js` (k6): 10 virtual users, item/bin inquiry, pick list, dashboard; thresholds p95 < 300 ms,
  errors < 1 %. Run on demand (`workflow_dispatch`) or nightly.
* **Reliability:** ERP outage, slow ERP (latency > timeout), transient 500 on push, concurrent syncs, two pickers racing.
* **Accessibility:** axe on 25 screens + dialog semantics.
* **Security basics:** auth required everywhere but `/health`; RBAC matrix per role; inactive users rejected on the next
  request; no user enumeration on login; ZPL injection escaped; (not in scope: rate limiting, CSRF — token in header, pen test).

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Parallel tests interfering through shared data | factory-created unique data; serial project for global state |
| Flaky UI timing | retrying assertions, no sleeps, trace on retry, 1 retry in CI only |
| Visual tests differing across machines | baselines only from the Playwright Docker image |
| ERP mock diverging from a real ERP | contract kept small and documented; chaos endpoints mirror real failure modes |
| Seed drift | `POST /api/test/reset` in global setup; seed facts used read-only |

## 12. Schedule and roles (illustrative for a 2-week sprint)

Day 1–2 acceptance criteria review with PO/devs (QA writes REQ rows) · Day 3–8 automation alongside development (API
tests first, UI when screens stabilise) · Day 9 exploratory session on the handheld with real scanner emulation · Day 10
release candidate run in CI, X-ray execution attached, go/no-go in sprint review.

## 13. Metrics we watch

Pass rate per project, flaky-test count (Playwright marks retries), time to feedback (unit → API → UI), requirements
covered (traceability), open defects by severity, escaped defects (found after release).
