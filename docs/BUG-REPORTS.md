# Bug reports found while building ScanDock

Three real defects the test suite caught during development, written up the way they would go into Jira. Keeping
them is useful: they show the bug-report format and they are honest examples of what "the tests found it" means.

---

## SD-101 · `GET /api/settings` leaks the internal `lastSyncAt` key

**Severity:** Minor · **Priority:** P3 · **Component:** API / settings · **Found by:** `tests/api/settings.spec.ts`

**Environment:** local compose stack, API 0.1.0, after any ERP sync.

**Steps to reproduce**
1. `POST /api/erp/sync` as a supervisor.
2. `GET /api/settings` as any user.

**Expected:** exactly the four warehouse settings (`allowShortPick`, `blindCounts`, `allowNegativeInventory`, `allowOverReceipt`).

**Actual:** the response also contains `"lastSyncAt": "2026-11-03T00:44:35Z"`, a bookkeeping value the sync stores in the
same key/value table.

**Impact:** the settings screen could render an unexpected toggle; clients that validate the shape break after the first sync.

**Root cause:** `getSettings()` merged *every* row of the `settings` table over the defaults.
**Fix:** only merge keys that exist in `DEFAULT_SETTINGS` (commit "hide internal keys from settings").
**Regression test:** `settings (read side) › every role can read the four warehouse settings`.

---

## SD-102 · Two concurrent ERP syncs crash with a unique-constraint error

**Severity:** Major · **Priority:** P2 · **Component:** API / ERP sync · **Found by:** `tests/api/erp-sync.spec.ts` (parallel workers)

**Steps to reproduce**
1. Create a new sales order in the ERP (`POST /erp/sales-orders`).
2. Fire `POST /api/erp/sync` twice at the same time (two browser tabs, or the background flusher plus a manual sync).

**Expected:** both calls succeed; the order is imported once.

**Actual:** one call answers `409 DUPLICATE "Already exists (purchase_orders_po_number_key)"` and its remaining orders are
not processed.

**Root cause:** check-then-insert race in `pullOrders()`: both syncs saw "not imported yet" and both inserted.
**Fix:** `INSERT … ON CONFLICT DO NOTHING RETURNING id`; a sync that loses the race skips the order silently.
**Regression test:** `ERP synchronisation › new ERP orders are pulled once; a second sync does not duplicate them` (runs with 8 parallel workers).

---

## SD-103 · "Sync now" reports success while documents are still queued

**Severity:** Major · **Priority:** P2 · **Component:** API / outbox · **Found by:** `tests/api/shipping.spec.ts`, `erp-sync.spec.ts`

**Steps to reproduce**
1. Ship an order (this queues an `item-fulfillment` in the outbox).
2. Immediately click **Sync now** in the console while the 5-second background flusher happens to be running.

**Expected:** after "Synced" the fulfillment shows as **Sent** with an ERP reference.

**Actual:** the row stays **Pending** (attempts 0); it is only delivered on the next background pass.

**Root cause:** `flushOutbox()` returned early when another flush was in progress (a boolean guard), so the manual sync
pushed nothing and documents written during the running pass were missed.
**Fix:** serialize flushes with a promise chain: a caller waits for the running pass, then runs a fresh pass of its own.
**Regression tests:** `shipping orders › a picked order ships … and an ERP fulfillment`, `ERP synchronisation › warehouse documents reach the ERP through the outbox`.

---

## Template

```
Summary:      <what is wrong, in one line, from the user's point of view>
Severity:     Blocker / Critical / Major / Minor / Trivial   (impact on the product)
Priority:     P1..P4                                         (urgency for the team)
Component:    <area>            Found in: <version/build>     Environment: <where>
Steps:        1. … 2. … 3. …   (numbered, minimal, with data)
Expected:     …
Actual:       … (exact message / screenshot / trace link)
Frequency:    always / intermittent (n of m)
Attachments:  Playwright trace, screenshot, API response, logs
Root cause / Fix / Regression test:  filled in when known
```
