# ScanDock WMS — requirements catalogue

Each requirement has an id that tests reference as a Playwright tag (`{ tag: ['@REQ-009'] }`).
`npm run traceability` builds [TRACEABILITY.md](TRACEABILITY.md) from these tags; `--check` fails CI when a
requirement has no automated test. The ids are also what you would put in Jira/X-ray as the "requirement" issue
that Test issues cover.

Acceptance criteria are written the way a scrum team would put them on the story: short, testable, in the user's words.

| Id | Requirement | Acceptance criteria (summary) | Priority |
|---|---|---|---|
| REQ-001 | Sign in with username and PIN | Valid credentials return a session; wrong PIN or unknown user is rejected the same way (401); `/auth/me` needs a token; sessions survive reload; protected routes bounce to sign-in and return afterwards | Must |
| REQ-002 | Deactivated users lose access | A deactivated user cannot sign in (403) and an existing session stops working on the next request | Must |
| REQ-003 | Role-based access | Operators use handheld workflows only; supervisors also manage counts/orders/ERP; admins also manage users and settings; forbidden calls return 403 and the UI hides what the role cannot do | Must |
| REQ-004 | Items identified by SKU or UPC-A barcode | Lookups accept SKU (any case) or barcode; 12-digit barcodes must have a valid check digit; barcodes are unique; new items get a generated barcode | Must |
| REQ-005 | Item master maintenance | Create/edit/deactivate items; duplicate SKUs are refused; validation names every bad field | Should |
| REQ-006 | Bins and zones | Bins belong to one of RECEIVING, STORAGE, PICKING, SHIPPING, QUARANTINE; duplicates refused; a bin holding stock cannot be deactivated | Must |
| REQ-007 | Inventory inquiry | Look up an item (all bins, total) or a bin (all items) from the handheld and the console; empty/unknown handled | Must |
| REQ-008 | Low-stock flag | An active item is "low" when its total on hand is at or below its reorder point; lists and the dashboard can filter on it | Should |
| REQ-009 | Receive against a purchase order | Scan PO → item → quantity → put-away bin; PO moves OPEN → PARTIAL → RECEIVED; stock and ledger updated; a receipt is atomic | Must |
| REQ-010 | Over-receipt control | Receiving more than remaining is refused (409 with remaining qty) unless the `allowOverReceipt` setting is on | Must |
| REQ-011 | Lot tracking | Lot-tracked items need a lot on receipt, pick, transfer and count; stock is kept per lot; the lot is offered/pre-filled where known | Must |
| REQ-012 | Put-away bin rules | Stock cannot be received into SHIPPING or inactive bins; QUARANTINE is allowed; unknown bins are reported | Should |
| REQ-013 | Closed orders are closed | RECEIVED or CLOSED POs refuse receipts; a PO can be closed by a supervisor; closing twice is an error | Should |
| REQ-014 | Pick suggestions | The handheld shows the forward-pick (PICKING) bin first, then STORAGE, oldest stock first; the pick list sorts in-progress and rush orders first | Must |
| REQ-015 | Pick validations | Wrong item, over-pick, insufficient stock, SHIPPING/QUARANTINE bins and unknown lines are refused with a specific code; nothing moves on failure | Must |
| REQ-016 | Complete and short picks | An order completes to PICKED when picked; a short pick needs a reason, is allowed only when `allowShortPick` is on, and the shortage stays on record | Must |
| REQ-017 | Shipping rules | Carrier/service follow weight (≤1 lb USPS, ≤70 UPS Ground, ≤150 FedEx, >150 freight), country (non-US → DHL) and priority (rush → Next Day Air); tracking numbers match carrier formats | Should |
| REQ-018 | Ship picked orders | Only PICKED orders ship, once; the operator may override the carrier; shipping posts an item fulfillment to the ERP with the picked quantities | Must |
| REQ-019 | Bin transfers | Move a quantity between two different bins atomically; two ledger rows share one reference; insufficient stock and inactive destinations are refused | Must |
| REQ-020 | Cycle counts | A count snapshots expected quantities; one count per bin at a time; the assignee (or a supervisor) submits; unreported lines count as 0; unexpected items get a line; variances are computed | Must |
| REQ-021 | Count approval | Approving posts an adjustment per variance line and tells the ERP; rejecting changes nothing and frees the bin for a recount | Must |
| REQ-022 | Blind counts | With `blindCounts` on, operators never see expected quantities or variances; supervisors still do | Should |
| REQ-023 | Transaction ledger | Every stock change writes a ledger row (type, delta, after, reference, user); on-hand always equals the ledger sum | Must |
| REQ-024 | ERP pull | Sync imports open ERP orders exactly once (idempotent, safe to run concurrently); orders with unknown SKUs are skipped with a reason and logged | Must |
| REQ-025 | ERP push and resilience | Receipts, fulfillments and adjustments are queued in an outbox and delivered to the ERP; an ERP outage never blocks warehouse work; failed documents retry and the console shows the state | Must |
| REQ-026 | Dashboard KPIs | Open POs, orders to pick/ship, counts to approve, units on hand, low-stock items, inventory accuracy (30 days) and ERP status are shown and link to their screens | Should |
| REQ-027 | ZPL labels | Bin labels (Code 128) and item labels (UPC-A) are generated as ZPL; free text cannot inject ZPL commands | Could |
| REQ-028 | Warehouse settings | Admin-only toggles (`allowShortPick`, `blindCounts`, `allowNegativeInventory`, `allowOverReceipt`) take effect immediately | Should |
| REQ-029 | Handheld usability | Every workflow works on a phone-sized screen with scan-and-Enter input, large tap targets and clear success/error feedback | Must |
| REQ-030 | Console lists | Admin lists search, filter and paginate; filters live in the URL so they survive reloads and can be shared | Should |
| REQ-031 | Accessibility | No serious or critical axe-core (WCAG 2.1 A/AA) violations on the main screens; dialogs are real dialogs | Should |
| REQ-032 | API error contract | Errors are `{ error: { code, message, details? } }` with the right HTTP status; validation lists every bad field; malformed JSON is 400 | Must |
| REQ-033 | User administration | Admins create users, change roles, reset PINs and deactivate accounts, but cannot lock themselves out | Should |
| REQ-034 | Concurrency safety | Two pickers racing for the last unit: exactly one succeeds and the ledger stays consistent | Must |
| REQ-035 | Order cancellation and PO close | Sales orders cancel only while OPEN; purchase orders can be closed by supervisors | Could |
