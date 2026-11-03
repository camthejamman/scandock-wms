import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { accuracyPct } from '../lib/variance.js';
import { parse } from '../lib/validate.js';
import { erpReachable } from '../services/erp.js';

const TX_TYPES = ['RECEIPT', 'PICK', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'SHIP'] as const;

const txQuery = z.object({
  type: z.enum(TX_TYPES).optional(),
  sku: z.string().trim().max(40).optional(),
  bin: z.string().trim().max(20).optional(),
  reference: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/dashboard', { preHandler: [app.authenticate] }, async () => {
    const k = await one<Record<string, number>>(
      pool,
      `SELECT
        (SELECT count(*) FROM purchase_orders WHERE status IN ('OPEN', 'PARTIAL'))::int AS "openPurchaseOrders",
        (SELECT count(*) FROM sales_orders WHERE status IN ('OPEN', 'PICKING'))::int AS "ordersToPick",
        (SELECT count(*) FROM sales_orders WHERE status = 'PICKED')::int AS "ordersToShip",
        (SELECT count(*) FROM sales_orders WHERE status = 'SHIPPED' AND shipped_at >= date_trunc('day', now()))::int AS "shippedToday",
        (SELECT count(*) FROM cycle_counts WHERE status = 'OPEN')::int AS "openCounts",
        (SELECT count(*) FROM cycle_counts WHERE status = 'SUBMITTED')::int AS "countsPendingApproval",
        (SELECT COALESCE(SUM(qty_on_hand), 0) FROM inventory)::int AS "unitsOnHand",
        (SELECT count(DISTINCT item_id) FROM inventory WHERE qty_on_hand > 0)::int AS "skusInStock",
        (SELECT count(*) FROM items i WHERE i.active
           AND COALESCE((SELECT SUM(qty_on_hand) FROM inventory WHERE item_id = i.id), 0) <= i.reorder_point)::int AS "lowStockItems",
        (SELECT count(*) FROM transactions WHERE created_at >= date_trunc('day', now()))::int AS "transactionsToday",
        (SELECT count(*) FROM erp_outbox WHERE status <> 'SENT')::int AS "erpOutboxPending"`,
    );
    const acc = await one<{ matching: number; total: number }>(
      pool,
      `SELECT count(*) FILTER (WHERE l.counted_qty = l.expected_qty)::int AS matching, count(*)::int AS total
       FROM cycle_count_lines l JOIN cycle_counts c ON c.id = l.count_id
       WHERE c.status = 'APPROVED' AND c.reviewed_at >= now() - interval '30 days'`,
    );
    const erp = await erpReachable();
    return {
      ...k,
      inventoryAccuracyPct: accuracyPct(acc?.matching ?? 0, acc?.total ?? 0),
      countedLines30d: acc?.total ?? 0,
      erpReachable: erp.reachable,
      generatedAt: new Date().toISOString(),
    };
  });

  app.get('/transactions', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(txQuery, req.query, 'query');
    const rows = await q(
      pool,
      `SELECT t.id, t.type, i.sku, i.name, b.code AS bin, t.lot, t.qty_delta AS "qtyDelta", t.qty_after AS "qtyAfter",
         t.reference, u.display_name AS "user", t.created_at AS "createdAt"
       FROM transactions t
       JOIN items i ON i.id = t.item_id JOIN bins b ON b.id = t.bin_id LEFT JOIN users u ON u.id = t.user_id
       WHERE ($1::text IS NULL OR t.type = $1)
         AND ($2::text IS NULL OR upper(i.sku) = upper($2) OR i.barcode = $2)
         AND ($3::text IS NULL OR upper(b.code) = upper($3))
         AND ($4::text IS NULL OR t.reference = $4)
       ORDER BY t.id DESC LIMIT $5`,
      [p.type ?? null, p.sku || null, p.bin || null, p.reference || null, p.limit],
    );
    return { data: rows, total: rows.length };
  });
}
