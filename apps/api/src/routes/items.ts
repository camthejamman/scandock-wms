import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { conflict, badRequest } from '../lib/errors.js';
import { pageQuery, paged } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { isValidUpcA, randomUpcA } from '../lib/barcode.js';
import { findItem, getItem, ITEM_COLS } from '../services/lookups.js';

const listQuery = pageQuery.extend({
  q: z.string().trim().max(80).optional(),
  active: z.enum(['true', 'false']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  category: z.string().trim().max(80).optional(),
});

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'SKU must be 2-40 characters: letters, digits and dashes');

const barcodeSchema = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .refine((v) => !/^\d{12}$/.test(v) || isValidUpcA(v), 'Invalid UPC-A check digit');

const createSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(120),
  barcode: barcodeSchema.optional(),
  description: z.string().trim().max(500).optional().default(''),
  category: z.string().trim().min(1).max(80).optional().default('General'),
  uom: z.string().trim().min(1).max(10).optional().default('EA'),
  unitCost: z.number().min(0).optional().default(0),
  weightLb: z.number().positive().max(10_000).optional().default(1),
  lotTracked: z.boolean().optional().default(false),
  reorderPoint: z.number().int().min(0).optional().default(0),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    barcode: barcodeSchema.optional(),
    description: z.string().trim().max(500).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    uom: z.string().trim().min(1).max(10).optional(),
    unitCost: z.number().min(0).optional(),
    weightLb: z.number().positive().max(10_000).optional(),
    lotTracked: z.boolean().optional(),
    reorderPoint: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'At least one field is required');

const PATCH_COLUMNS: Record<string, string> = {
  name: 'name',
  barcode: 'barcode',
  description: 'description',
  category: 'category',
  uom: 'uom',
  unitCost: 'unit_cost',
  weightLb: 'weight_lb',
  lotTracked: 'lot_tracked',
  reorderPoint: 'reorder_point',
  active: 'active',
};

export async function itemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/items', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const where = `WHERE ($1::text IS NULL OR i.sku ILIKE '%' || $1 || '%' OR i.name ILIKE '%' || $1 || '%' OR i.barcode = $1)
      AND ($2::boolean IS NULL OR i.active = $2)
      AND ($3::boolean IS NOT TRUE OR COALESCE(s.on_hand, 0) <= i.reorder_point)
      AND ($4::text IS NULL OR i.category = $4)`;
    const from = `FROM items i LEFT JOIN (SELECT item_id, SUM(qty_on_hand) AS on_hand FROM inventory GROUP BY item_id) s ON s.item_id = i.id`;
    const params = [
      p.q || null,
      p.active === undefined ? null : p.active === 'true',
      p.lowStock === 'true',
      p.category || null,
    ];
    const rows = await q(
      pool,
      `SELECT ${ITEM_COLS}, COALESCE(s.on_hand, 0)::int AS "qtyOnHand",
         (i.active AND COALESCE(s.on_hand, 0) <= i.reorder_point) AS "lowStock"
       ${from} ${where} ORDER BY i.sku LIMIT $5 OFFSET $6`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const total = await one<{ n: number }>(
      pool,
      `SELECT count(*)::int AS n ${from} ${where}`,
      params,
    );
    return paged(rows, total?.n ?? 0, p);
  });

  app.get('/items/categories', { preHandler: [app.authenticate] }, async () => {
    const rows = await q<{ category: string; n: number }>(
      pool,
      `SELECT category, count(*)::int AS n FROM items GROUP BY category ORDER BY category`,
    );
    return { data: rows };
  });

  app.get<{ Params: { key: string } }>(
    '/items/:key',
    { preHandler: [app.authenticate] },
    async (req) => {
      const item = await getItem(pool, req.params.key);
      const stock = await q(
        pool,
        `SELECT b.code AS bin, b.zone, inv.lot, inv.qty_on_hand AS "qtyOnHand", inv.updated_at AS "updatedAt"
       FROM inventory inv JOIN bins b ON b.id = inv.bin_id
       WHERE inv.item_id = $1 AND inv.qty_on_hand <> 0 ORDER BY b.zone, b.code, inv.lot`,
        [item.id],
      );
      const total = stock.reduce((sum, r) => sum + Number(r.qtyOnHand), 0);
      return {
        ...item,
        qtyOnHand: total,
        lowStock: item.active && total <= item.reorderPoint,
        stock,
      };
    },
  );

  app.post(
    '/items',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req, reply) => {
      const body = parse(createSchema, req.body ?? {}, 'item');
      if (await findItem(pool, body.sku))
        throw conflict('DUPLICATE_SKU', `SKU ${body.sku} already exists`);
      const barcode = body.barcode ?? randomUpcA();
      if (await one(pool, 'SELECT 1 FROM items WHERE barcode = $1', [barcode])) {
        throw conflict(
          'DUPLICATE_BARCODE',
          `Barcode ${barcode} is already assigned to another item`,
        );
      }
      const row = await one<{ id: number }>(
        pool,
        `INSERT INTO items (sku, barcode, name, description, category, uom, unit_cost, weight_lb, lot_tracked, reorder_point)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          body.sku,
          barcode,
          body.name,
          body.description,
          body.category,
          body.uom,
          body.unitCost,
          body.weightLb,
          body.lotTracked,
          body.reorderPoint,
        ],
      );
      const item = await one(pool, `SELECT ${ITEM_COLS} FROM items i WHERE i.id = $1`, [row!.id]);
      return reply.status(201).send(item);
    },
  );

  app.patch<{ Params: { key: string } }>(
    '/items/:key',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req) => {
      const item = await getItem(pool, req.params.key);
      const body = parse(patchSchema, req.body ?? {}, 'item');
      if (body.barcode && body.barcode !== item.barcode) {
        if (
          await one(pool, 'SELECT 1 FROM items WHERE barcode = $1 AND id <> $2', [
            body.barcode,
            item.id,
          ])
        ) {
          throw conflict(
            'DUPLICATE_BARCODE',
            `Barcode ${body.barcode} is already assigned to another item`,
          );
        }
      }
      const sets: string[] = [];
      const params: unknown[] = [item.id];
      for (const [key, value] of Object.entries(body)) {
        const col = PATCH_COLUMNS[key];
        if (!col) throw badRequest('VALIDATION_ERROR', `Unknown field ${key}`);
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      }
      await pool.query(`UPDATE items SET ${sets.join(', ')} WHERE id = $1`, params);
      return one(pool, `SELECT ${ITEM_COLS} FROM items i WHERE i.id = $1`, [item.id]);
    },
  );
}
