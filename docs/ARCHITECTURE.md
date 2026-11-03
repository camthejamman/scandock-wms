# Architecture

ScanDock is a deliberately small warehouse management system that mimics the shape of a product like
RF-SMART: a **handheld scanning app** for people on the floor, an **admin console** for supervisors, and an
**ERP integration** underneath, because in that world inventory truth ultimately lives in the ERP (NetSuite,
Oracle Cloud SCM, JD Edwards, Dynamics). Nothing here is production software; it exists so the test suite has
something realistic to test.

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│ web (React + Vite, nginx)   │      │ e2e (Playwright, Docker img) │
│  /scan/*  handheld UI       │      │  api · scanner · admin ·     │
│  /admin/* console           │      │  journeys · a11y · visual    │
└──────────────┬──────────────┘      └──────────────┬───────────────┘
               │ /api (same origin, nginx proxy)     │ http
┌──────────────▼──────────────┐      ┌──────────────▼───────────────┐
│ api (Fastify 5, TypeScript) │─────▶│ erp-mock "Nimbus ERP"        │
│  auth · items · bins ·      │ pull │  (Express) orders live here; │
│  receiving · picking ·      │ push │  receipts/fulfillments/      │
│  shipping · transfers ·     │◀─────│  adjustments are posted back │
│  cycle counts · outbox      │      │  /erp/_chaos for outages     │
└──────────────┬──────────────┘      └──────────────────────────────┘
               │ pg
┌──────────────▼──────────────┐
│ Postgres 16                 │
└─────────────────────────────┘
```

## Services

| Service | Stack | Port (host) | Notes |
|---|---|---|---|
| `apps/web` | React 19, Vite 8, react-router 7, plain CSS; served by nginx in Docker | 5180 | One SPA, two shells: the handheld frame (`/scan`) and the console (`/admin`). nginx proxies `/api` to the API so the browser only ever talks to one origin. |
| `apps/api` | Node 24, Fastify 5, `pg`, zod 4, `@fastify/jwt`, bcryptjs | 4000 | Applies `schema.sql` on boot, seeds demo data when empty, exposes `POST /api/test/reset` when `TEST_HOOKS=true`. |
| `apps/erp-mock` | Express 5 | 4100 | In-memory stand-in for the ERP. `POST /erp/_chaos {down, latencyMs, failNextPosts}` simulates outages. `GET /` is a tiny status page. |
| `db` | Postgres 16 (alpine) | 5433 | Named volume `dbdata`; `docker compose down -v` wipes it. |
| `e2e` | `mcr.microsoft.com/playwright:v1.64.1-noble` | – | `docker compose --profile test run --rm e2e`. Same image as CI, so screenshots are comparable. |
| `k6` | `grafana/k6` | – | `docker compose --profile perf run --rm k6` runs `perf/smoke.js`. |

## Domain model

* **Items** (`sku`, `barcode` UPC-A, `uom`, `weight_lb`, `lot_tracked`, `reorder_point`) and **bins** (code, zone).
* **Inventory** is one row per (item, bin, lot). It is never written directly: `services/inventory.ts#applyMovement`
  locks the row (`SELECT … FOR UPDATE`), applies the delta, refuses to go negative unless allowed, and writes a
  **transactions** (ledger) row. The seed, receipts, picks, transfers and count approvals all go through it, so
  `GET /api/inventory/invariants` can prove on-hand == Σ ledger at any time.
* **Purchase orders** → **receipts**; **sales orders** → **picks** → ship; **transfers**; **cycle counts** with lines
  (expected snapshot vs counted). Status machines: PO `OPEN→PARTIAL→RECEIVED` (+`CLOSED`), SO `OPEN→PICKING→PICKED→SHIPPED`
  (+`CANCELLED`), count `OPEN→SUBMITTED→APPROVED|REJECTED`.
* **ERP outbox** (`erp_outbox`): every ERP-bound document is written in the *same transaction* as the warehouse
  change (transactional outbox pattern). A background flusher (every `OUTBOX_INTERVAL_MS`) and `POST /api/erp/sync`
  deliver it; failures are recorded per row and retried. `erp_sync_log` is the human-readable history.
* **Settings** are a key/value table merged over defaults (`allowShortPick`, `blindCounts`, `allowNegativeInventory`,
  `allowOverReceipt`).

## Request flow examples

**Receive a line** (`POST /api/purchase-orders/:po/receipts`): lock PO → check status → resolve line (by `lineNo`
or SKU/barcode) → over-receipt rule → bin exists/active/zone → lot rule → insert receipt line → `applyMovement(+qty)`
→ update `qty_received` → recompute PO status → enqueue `item-receipt` → commit. Any failure rolls the whole receipt back.

**Pick a line** (`POST /api/sales-orders/:so/picks`): lock SO → status OPEN/PICKING → line exists → scanned SKU matches
→ qty ≤ remaining → bin zone → lot → `applyMovement(-qty)` (409 `INSUFFICIENT_STOCK` if short) → record pick → SO=PICKING.
Two pickers racing for the last unit serialize on the inventory row lock; the second one gets the 409.

## Error contract

Every error is `{ "error": { "code": "UPPER_SNAKE", "message": "human text", "details": … } }` with the matching HTTP
status: 400 validation/bad request, 401 no/invalid token, 403 wrong role or inactive user, 404 unknown resource,
409 business-rule conflict (over-receipt, insufficient stock, wrong status, duplicates), 502 ERP unreachable.
Codes are stable and the UI shows the message as a toast.

## Why these choices

* **Fastify + raw SQL** instead of an ORM: the business rules *are* the SQL and the locking; hiding them would hide the
  thing the tests are about.
* **One React app, two shells**: a handheld and a console share the API client, types and components but have different
  layouts (device frame vs sidebar), which is also how real WMS vendors ship (mobile client + web admin).
* **Scan input = text field + Enter**: real barcode scanners are keyboard wedges. This keeps the UI honest and makes the
  Playwright tests representative (`fill` + `press('Enter')`).
* **ERP mock in the stack**: integration behaviour (idempotent pulls, outbox retries, outages) is where WMS bugs hurt
  most, so it needs to be testable without a real NetSuite account.
* **Test hooks behind an env flag**: `POST /api/test/reset` gives the suite a known starting point; it is simply not
  registered unless `TEST_HOOKS=true`.

## Local development

```bash
npm install
npm run dev            # db container + erp-mock + api + web with hot reload
npm run up             # the same, but everything in Docker (what CI uses)
npm run test:unit      # Jasmine (api) + Vitest (web)
npm run test:e2e       # Playwright against whatever is running on 5180/4000/4100
npm run test:e2e:docker
```

Ports: web 5180, api 4000, erp-mock 4100, Postgres 5433 (host) / 5432 (compose network).
