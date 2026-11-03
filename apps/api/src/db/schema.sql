-- ScanDock WMS schema. Idempotent: applied on every API start.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'operator')),
  pin_hash      TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id    SERIAL PRIMARY KEY,
  code  TEXT UNIQUE NOT NULL,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id             SERIAL PRIMARY KEY,
  sku            TEXT UNIQUE NOT NULL,
  barcode        TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'General',
  uom            TEXT NOT NULL DEFAULT 'EA',
  unit_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  weight_lb      NUMERIC(10,3) NOT NULL DEFAULT 1,
  lot_tracked    BOOLEAN NOT NULL DEFAULT FALSE,
  reorder_point  INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bins (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INTEGER NOT NULL REFERENCES warehouses(id),
  code          TEXT NOT NULL,
  zone          TEXT NOT NULL CHECK (zone IN ('RECEIVING', 'STORAGE', 'PICKING', 'SHIPPING', 'QUARANTINE')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS inventory (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  bin_id       INTEGER NOT NULL REFERENCES bins(id),
  lot          TEXT NOT NULL DEFAULT '',
  qty_on_hand  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, bin_id, lot)
);
CREATE INDEX IF NOT EXISTS inventory_item_idx ON inventory(item_id);
CREATE INDEX IF NOT EXISTS inventory_bin_idx ON inventory(bin_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id             SERIAL PRIMARY KEY,
  po_number      TEXT UNIQUE NOT NULL,
  vendor         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'RECEIVED', 'CLOSED')),
  expected_date  DATE,
  erp_id         TEXT UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1101;

CREATE TABLE IF NOT EXISTS po_lines (
  id            SERIAL PRIMARY KEY,
  po_id         INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  qty_ordered   INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (po_id, line_no)
);

CREATE TABLE IF NOT EXISTS receipts (
  id           SERIAL PRIMARY KEY,
  po_id        INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  received_by  INTEGER REFERENCES users(id),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id          SERIAL PRIMARY KEY,
  receipt_id  INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  po_line_id  INTEGER NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  bin_id      INTEGER NOT NULL REFERENCES bins(id),
  lot         TEXT NOT NULL DEFAULT '',
  qty         INTEGER NOT NULL CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id               SERIAL PRIMARY KEY,
  so_number        TEXT UNIQUE NOT NULL,
  customer         TEXT NOT NULL,
  ship_to_country  TEXT NOT NULL DEFAULT 'US',
  priority         TEXT NOT NULL DEFAULT 'STANDARD' CHECK (priority IN ('STANDARD', 'RUSH')),
  status           TEXT NOT NULL CHECK (status IN ('OPEN', 'PICKING', 'PICKED', 'SHIPPED', 'CANCELLED')),
  erp_id           TEXT UNIQUE,
  carrier          TEXT,
  service          TEXT,
  tracking_number  TEXT,
  weight_lb        NUMERIC(10,3),
  short_reason     TEXT,
  picked_by        INTEGER REFERENCES users(id),
  picked_at        TIMESTAMPTZ,
  shipped_by       INTEGER REFERENCES users(id),
  shipped_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS so_number_seq START 5101;

CREATE TABLE IF NOT EXISTS so_lines (
  id           SERIAL PRIMARY KEY,
  so_id        INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  line_no      INTEGER NOT NULL,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  qty_ordered  INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_picked   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (so_id, line_no)
);

CREATE TABLE IF NOT EXISTS picks (
  id          SERIAL PRIMARY KEY,
  so_line_id  INTEGER NOT NULL REFERENCES so_lines(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  bin_id      INTEGER NOT NULL REFERENCES bins(id),
  lot         TEXT NOT NULL DEFAULT '',
  qty         INTEGER NOT NULL CHECK (qty > 0),
  picked_by   INTEGER REFERENCES users(id),
  picked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfers (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  from_bin_id  INTEGER NOT NULL REFERENCES bins(id),
  to_bin_id    INTEGER NOT NULL REFERENCES bins(id),
  lot          TEXT NOT NULL DEFAULT '',
  qty          INTEGER NOT NULL CHECK (qty > 0),
  user_id      INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cycle_counts (
  id            SERIAL PRIMARY KEY,
  bin_id        INTEGER NOT NULL REFERENCES bins(id),
  status        TEXT NOT NULL CHECK (status IN ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  assigned_to   INTEGER REFERENCES users(id),
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by  INTEGER REFERENCES users(id),
  submitted_at  TIMESTAMPTZ,
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  notes         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cycle_count_lines (
  id            SERIAL PRIMARY KEY,
  count_id      INTEGER NOT NULL REFERENCES cycle_counts(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  lot           TEXT NOT NULL DEFAULT '',
  expected_qty  INTEGER NOT NULL DEFAULT 0,
  counted_qty   INTEGER,
  UNIQUE (count_id, item_id, lot)
);

CREATE TABLE IF NOT EXISTS transactions (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('RECEIPT', 'PICK', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'SHIP')),
  item_id     INTEGER NOT NULL REFERENCES items(id),
  bin_id      INTEGER NOT NULL REFERENCES bins(id),
  lot         TEXT NOT NULL DEFAULT '',
  qty_delta   INTEGER NOT NULL,
  qty_after   INTEGER NOT NULL,
  reference   TEXT NOT NULL DEFAULT '',
  user_id     INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_item_idx ON transactions(item_id);

-- Transactional outbox: every ERP-bound document is written here in the same
-- transaction as the warehouse change, then pushed by a background flusher.
CREATE TABLE IF NOT EXISTS erp_outbox (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('item-receipt', 'item-fulfillment', 'inventory-adjustment')),
  reference   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  erp_ref     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS erp_sync_log (
  id          SERIAL PRIMARY KEY,
  direction   TEXT NOT NULL CHECK (direction IN ('PULL', 'PUSH', 'STATUS')),
  entity      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('OK', 'FAILED', 'SKIPPED')),
  message     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);
