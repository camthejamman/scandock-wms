/**
 * ERP connector: pulls orders from the ERP and pushes warehouse documents back through a
 * transactional outbox. The ERP here is the Nimbus ERP mock, standing in for NetSuite.
 */
import type { PoolClient } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { one, pool, q, withTx } from '../db/pool.js';
import { badGateway } from '../lib/errors.js';

export type OutboxKind = 'item-receipt' | 'item-fulfillment' | 'inventory-adjustment';

const ENDPOINTS: Record<OutboxKind, string> = {
  'item-receipt': '/erp/item-receipts',
  'item-fulfillment': '/erp/item-fulfillments',
  'inventory-adjustment': '/erp/inventory-adjustments',
};

export async function erpFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 4000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(config.erpUrl + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function erpReachable(): Promise<{ reachable: boolean; error?: string }> {
  try {
    const res = await erpFetch('/erp/health', {}, 1500);
    if (!res.ok) return { reachable: false, error: `ERP answered HTTP ${res.status}` };
    return { reachable: true };
  } catch (err) {
    return { reachable: false, error: (err as Error).message };
  }
}

export async function logSync(
  direction: 'PULL' | 'PUSH' | 'STATUS',
  entity: string,
  status: 'OK' | 'FAILED' | 'SKIPPED',
  message: string,
): Promise<void> {
  await pool.query(
    'INSERT INTO erp_sync_log (direction, entity, status, message) VALUES ($1, $2, $3, $4)',
    [direction, entity, status, message],
  );
}

/** Write an ERP-bound document in the caller's transaction. */
export async function enqueueOutbox(
  client: PoolClient,
  kind: OutboxKind,
  reference: string,
  payload: unknown,
): Promise<number> {
  const row = await one<{ id: number }>(
    client,
    `INSERT INTO erp_outbox (kind, reference, payload) VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [kind, reference, JSON.stringify(payload)],
  );
  return row!.id;
}

let inFlight: Promise<{ sent: number; failed: number }> | null = null;

/**
 * Push every PENDING/FAILED outbox row to the ERP. Concurrent callers are serialized:
 * a call made while a flush is running waits for it and then runs its own pass, so a
 * document written during the first pass is still delivered before the caller returns.
 */
export function flushOutbox(): Promise<{ sent: number; failed: number }> {
  const run = async (): Promise<{ sent: number; failed: number }> => {
    let sent = 0;
    let failed = 0;
    const rows = await q<{
      id: number;
      kind: OutboxKind;
      reference: string;
      payload: unknown;
      attempts: number;
    }>(
      pool,
      `SELECT id, kind, reference, payload, attempts FROM erp_outbox
       WHERE status <> 'SENT' AND attempts < 50 ORDER BY id`,
    );
    for (const row of rows) {
      try {
        const res = await erpFetch(ENDPOINTS[row.kind], {
          method: 'POST',
          body: JSON.stringify(row.payload),
        });
        if (!res.ok) throw new Error(`ERP answered HTTP ${res.status}`);
        const body = (await res.json()) as { id?: string };
        await pool.query(
          `UPDATE erp_outbox SET status = 'SENT', erp_ref = $2, sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`,
          [row.id, body.id ?? null],
        );
        await logSync('PUSH', row.kind, 'OK', `${row.reference} -> ${body.id ?? 'accepted'}`);
        sent++;
      } catch (err) {
        const message = (err as Error).message;
        await pool.query(
          `UPDATE erp_outbox SET status = 'FAILED', attempts = attempts + 1, last_error = $2 WHERE id = $1`,
          [row.id, message],
        );
        await logSync('PUSH', row.kind, 'FAILED', `${row.reference}: ${message}`);
        failed++;
      }
    }
    return { sent, failed };
  };
  const next = (inFlight ?? Promise.resolve()).then(run, run);
  inFlight = next;
  void next.finally(() => {
    if (inFlight === next) inFlight = null;
  });
  return next;
}

export function startOutboxFlusher(intervalMs: number, log: FastifyBaseLogger): () => void {
  if (intervalMs <= 0) return () => undefined;
  const timer = setInterval(() => {
    flushOutbox().catch((err) => log.warn({ err }, 'outbox flush failed'));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

interface ErpPoLine {
  lineNo: number;
  sku: string;
  qty: number;
}
interface ErpPo {
  id: string;
  poNumber: string;
  vendor: string;
  expectedDate?: string;
  lines: ErpPoLine[];
}
interface ErpSo {
  id: string;
  soNumber: string;
  customer: string;
  shipToCountry?: string;
  priority?: 'STANDARD' | 'RUSH';
  lines: ErpPoLine[];
}

export interface PullResult {
  purchaseOrders: number;
  salesOrders: number;
  skipped: Array<{ number: string; reason: string }>;
}

/** Pull open orders from the ERP. Idempotent: orders already imported (by ERP id or number) are ignored. */
export async function pullOrders(): Promise<PullResult> {
  let pos: ErpPo[];
  let sos: ErpSo[];
  try {
    const [poRes, soRes] = await Promise.all([
      erpFetch('/erp/purchase-orders?status=OPEN'),
      erpFetch('/erp/sales-orders?status=OPEN'),
    ]);
    if (!poRes.ok || !soRes.ok)
      throw new Error(`ERP answered HTTP ${poRes.ok ? soRes.status : poRes.status}`);
    pos = (await poRes.json()) as ErpPo[];
    sos = (await soRes.json()) as ErpSo[];
  } catch (err) {
    const message = (err as Error).message;
    await logSync('PULL', 'orders', 'FAILED', message);
    throw badGateway('ERP_UNREACHABLE', `Could not reach the ERP: ${message}`);
  }

  const result: PullResult = { purchaseOrders: 0, salesOrders: 0, skipped: [] };

  for (const po of pos) {
    const exists = await one(
      pool,
      'SELECT 1 FROM purchase_orders WHERE erp_id = $1 OR po_number = $2',
      [po.id, po.poNumber],
    );
    if (exists) continue;
    const items = await resolveSkus(po.lines);
    if (!items.ok) {
      result.skipped.push({ number: po.poNumber, reason: items.reason });
      await logSync('PULL', 'purchase-order', 'SKIPPED', `${po.poNumber}: ${items.reason}`);
      continue;
    }
    const imported = await withTx(async (client) => {
      // ON CONFLICT: a concurrent sync may have imported the same order a moment ago.
      const header = await one<{ id: number }>(
        client,
        `INSERT INTO purchase_orders (po_number, vendor, status, expected_date, erp_id)
         VALUES ($1, $2, 'OPEN', $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
        [po.poNumber, po.vendor, po.expectedDate ?? null, po.id],
      );
      if (!header) return false;
      for (const line of po.lines) {
        await client.query(
          `INSERT INTO po_lines (po_id, line_no, item_id, qty_ordered) VALUES ($1, $2, $3, $4)`,
          [header.id, line.lineNo, items.ids.get(line.sku), line.qty],
        );
      }
      return true;
    });
    if (!imported) continue;
    result.purchaseOrders++;
    await logSync(
      'PULL',
      'purchase-order',
      'OK',
      `${po.poNumber} imported (${po.lines.length} lines)`,
    );
  }

  for (const so of sos) {
    const exists = await one(
      pool,
      'SELECT 1 FROM sales_orders WHERE erp_id = $1 OR so_number = $2',
      [so.id, so.soNumber],
    );
    if (exists) continue;
    const items = await resolveSkus(so.lines);
    if (!items.ok) {
      result.skipped.push({ number: so.soNumber, reason: items.reason });
      await logSync('PULL', 'sales-order', 'SKIPPED', `${so.soNumber}: ${items.reason}`);
      continue;
    }
    const imported = await withTx(async (client) => {
      const header = await one<{ id: number }>(
        client,
        `INSERT INTO sales_orders (so_number, customer, ship_to_country, priority, status, erp_id)
         VALUES ($1, $2, $3, $4, 'OPEN', $5) ON CONFLICT DO NOTHING RETURNING id`,
        [so.soNumber, so.customer, so.shipToCountry ?? 'US', so.priority ?? 'STANDARD', so.id],
      );
      if (!header) return false;
      for (const line of so.lines) {
        await client.query(
          `INSERT INTO so_lines (so_id, line_no, item_id, qty_ordered) VALUES ($1, $2, $3, $4)`,
          [header.id, line.lineNo, items.ids.get(line.sku), line.qty],
        );
      }
      return true;
    });
    if (!imported) continue;
    result.salesOrders++;
    await logSync(
      'PULL',
      'sales-order',
      'OK',
      `${so.soNumber} imported (${so.lines.length} lines)`,
    );
  }

  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('lastSyncAt', to_jsonb(now()))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  return result;
}

async function resolveSkus(
  lines: ErpPoLine[],
): Promise<{ ok: true; ids: Map<string, number> } | { ok: false; reason: string }> {
  const ids = new Map<string, number>();
  if (lines.length === 0) return { ok: false, reason: 'order has no lines' };
  for (const line of lines) {
    const row = await one<{ id: number }>(
      pool,
      'SELECT id FROM items WHERE upper(sku) = upper($1)',
      [line.sku],
    );
    if (!row) return { ok: false, reason: `unknown SKU ${line.sku}` };
    if (!(line.qty > 0)) return { ok: false, reason: `invalid quantity on ${line.sku}` };
    ids.set(line.sku, row.id);
  }
  return { ok: true, ids };
}
