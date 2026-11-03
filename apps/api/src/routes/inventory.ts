import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { pageQuery, paged } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { getBin, getItem } from '../services/lookups.js';
import { ZONES } from './bins.js';

const listQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  sku: z.string().trim().max(40).optional(),
  bin: z.string().trim().max(20).optional(),
  zone: z.enum(ZONES).optional(),
  lot: z.string().trim().max(40).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
});

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/inventory', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const from = `FROM inventory inv
      JOIN items i ON i.id = inv.item_id
      JOIN bins b ON b.id = inv.bin_id
      LEFT JOIN (SELECT item_id, SUM(qty_on_hand) AS on_hand FROM inventory GROUP BY item_id) s ON s.item_id = i.id`;
    const where = `WHERE inv.qty_on_hand <> 0
      AND ($1::text IS NULL OR i.sku ILIKE '%' || $1 || '%' OR i.name ILIKE '%' || $1 || '%' OR i.barcode = $1 OR b.code ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR upper(i.sku) = upper($2) OR i.barcode = $2)
      AND ($3::text IS NULL OR upper(b.code) = upper($3))
      AND ($4::text IS NULL OR b.zone = $4)
      AND ($5::text IS NULL OR inv.lot = $5)
      AND ($6::boolean IS NOT TRUE OR COALESCE(s.on_hand, 0) <= i.reorder_point)`;
    const params = [
      p.q || null,
      p.sku || null,
      p.bin || null,
      p.zone ?? null,
      p.lot || null,
      p.lowStock === 'true',
    ];
    const rows = await q(
      pool,
      `SELECT i.sku, i.name, i.barcode, i.lot_tracked AS "lotTracked", i.reorder_point AS "reorderPoint",
         b.code AS bin, b.zone, inv.lot, inv.qty_on_hand AS "qtyOnHand",
         COALESCE(s.on_hand, 0)::int AS "itemQtyOnHand",
         (COALESCE(s.on_hand, 0) <= i.reorder_point) AS "lowStock", inv.updated_at AS "updatedAt"
       ${from} ${where} ORDER BY i.sku, b.code, inv.lot LIMIT $7 OFFSET $8`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const total = await one<{ n: number }>(
      pool,
      `SELECT count(*)::int AS n ${from} ${where}`,
      params,
    );
    return paged(rows, total?.n ?? 0, p);
  });

  app.get<{ Params: { key: string } }>(
    '/inventory/item/:key',
    { preHandler: [app.authenticate] },
    async (req) => {
      const item = await getItem(pool, req.params.key);
      const rows = await q(
        pool,
        `SELECT b.code AS bin, b.zone, inv.lot, inv.qty_on_hand AS "qtyOnHand", inv.updated_at AS "updatedAt"
       FROM inventory inv JOIN bins b ON b.id = inv.bin_id
       WHERE inv.item_id = $1 AND inv.qty_on_hand <> 0
       ORDER BY CASE b.zone WHEN 'PICKING' THEN 0 WHEN 'STORAGE' THEN 1 ELSE 2 END, b.code, inv.lot`,
        [item.id],
      );
      const total = rows.reduce((s, r) => s + Number(r.qtyOnHand), 0);
      return { item, rows, qtyOnHand: total, lowStock: item.active && total <= item.reorderPoint };
    },
  );

  app.get<{ Params: { code: string } }>(
    '/inventory/bin/:code',
    { preHandler: [app.authenticate] },
    async (req) => {
      const bin = await getBin(pool, req.params.code);
      const rows = await q(
        pool,
        `SELECT i.sku, i.name, i.barcode, i.lot_tracked AS "lotTracked", inv.lot, inv.qty_on_hand AS "qtyOnHand", inv.updated_at AS "updatedAt"
       FROM inventory inv JOIN items i ON i.id = inv.item_id
       WHERE inv.bin_id = $1 AND inv.qty_on_hand <> 0 ORDER BY i.sku, inv.lot`,
        [bin.id],
      );
      return { bin, rows, unitsOnHand: rows.reduce((s, r) => s + Number(r.qtyOnHand), 0) };
    },
  );

  /** Self-check: on-hand must equal the sum of the ledger for every (item, bin, lot). */
  app.get('/inventory/invariants', { preHandler: [app.authenticate] }, async () => {
    const mismatches = await q(
      pool,
      `SELECT i.sku, b.code AS bin, inv.lot, inv.qty_on_hand AS "qtyOnHand", COALESCE(t.total, 0)::int AS "ledgerTotal"
       FROM inventory inv
       JOIN items i ON i.id = inv.item_id JOIN bins b ON b.id = inv.bin_id
       LEFT JOIN (SELECT item_id, bin_id, lot, SUM(qty_delta) AS total FROM transactions GROUP BY item_id, bin_id, lot) t
         ON t.item_id = inv.item_id AND t.bin_id = inv.bin_id AND t.lot = inv.lot
       WHERE inv.qty_on_hand <> COALESCE(t.total, 0)
       ORDER BY i.sku, b.code`,
    );
    const negatives = await q(
      pool,
      `SELECT i.sku, b.code AS bin, inv.lot, inv.qty_on_hand AS "qtyOnHand"
       FROM inventory inv JOIN items i ON i.id = inv.item_id JOIN bins b ON b.id = inv.bin_id
       WHERE inv.qty_on_hand < 0`,
    );
    return { ok: mismatches.length === 0, mismatches, negatives };
  });
}
