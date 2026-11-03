import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, pool, q } from '../db/pool.js';
import { conflict } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { BIN_COLS, findBin, getBin } from '../services/lookups.js';

export const ZONES = ['RECEIVING', 'STORAGE', 'PICKING', 'SHIPPING', 'QUARANTINE'] as const;

const listQuery = z.object({
  zone: z.enum(ZONES).optional(),
  q: z.string().trim().max(40).optional(),
  active: z.enum(['true', 'false']).optional(),
});

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9-]{1,19}$/,
      'Bin code must be 2-20 characters: letters, digits and dashes',
    ),
  zone: z.enum(ZONES),
});

const patchSchema = z
  .object({ zone: z.enum(ZONES).optional(), active: z.boolean().optional() })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'At least one field is required');

export async function binRoutes(app: FastifyInstance): Promise<void> {
  app.get('/bins', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const rows = await q(
      pool,
      `SELECT ${BIN_COLS},
         COALESCE(s.item_count, 0)::int AS "itemCount", COALESCE(s.units, 0)::int AS "unitsOnHand"
       FROM bins b JOIN warehouses w ON w.id = b.warehouse_id
       LEFT JOIN (SELECT bin_id, count(*) FILTER (WHERE qty_on_hand <> 0) AS item_count, SUM(qty_on_hand) AS units
                  FROM inventory GROUP BY bin_id) s ON s.bin_id = b.id
       WHERE ($1::text IS NULL OR b.zone = $1)
         AND ($2::text IS NULL OR b.code ILIKE '%' || $2 || '%')
         AND ($3::boolean IS NULL OR b.active = $3)
       ORDER BY b.code`,
      [p.zone ?? null, p.q || null, p.active === undefined ? null : p.active === 'true'],
    );
    return { data: rows, total: rows.length };
  });

  app.get<{ Params: { code: string } }>(
    '/bins/:code',
    { preHandler: [app.authenticate] },
    async (req) => {
      const bin = await getBin(pool, req.params.code);
      const contents = await q(
        pool,
        `SELECT i.sku, i.name, i.barcode, i.lot_tracked AS "lotTracked", inv.lot, inv.qty_on_hand AS "qtyOnHand", inv.updated_at AS "updatedAt"
       FROM inventory inv JOIN items i ON i.id = inv.item_id
       WHERE inv.bin_id = $1 AND inv.qty_on_hand <> 0 ORDER BY i.sku, inv.lot`,
        [bin.id],
      );
      return {
        ...bin,
        contents,
        unitsOnHand: contents.reduce((s, r) => s + Number(r.qtyOnHand), 0),
      };
    },
  );

  app.post(
    '/bins',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req, reply) => {
      const body = parse(createSchema, req.body ?? {}, 'bin');
      if (await findBin(pool, body.code))
        throw conflict('DUPLICATE_BIN', `Bin ${body.code} already exists`);
      const wh = await one<{ id: number }>(pool, 'SELECT id FROM warehouses ORDER BY id LIMIT 1');
      await pool.query('INSERT INTO bins (warehouse_id, code, zone) VALUES ($1, $2, $3)', [
        wh!.id,
        body.code,
        body.zone,
      ]);
      return reply.status(201).send(await getBin(pool, body.code));
    },
  );

  app.patch<{ Params: { code: string } }>(
    '/bins/:code',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req) => {
      const bin = await getBin(pool, req.params.code);
      const body = parse(patchSchema, req.body ?? {}, 'bin');
      if (body.active === false) {
        const stock = await one<{ n: number }>(
          pool,
          'SELECT COALESCE(SUM(qty_on_hand), 0)::int AS n FROM inventory WHERE bin_id = $1',
          [bin.id],
        );
        if ((stock?.n ?? 0) !== 0)
          throw conflict('BIN_NOT_EMPTY', 'Move the stock out before deactivating this bin');
      }
      await pool.query(
        'UPDATE bins SET zone = COALESCE($2, zone), active = COALESCE($3, active) WHERE id = $1',
        [bin.id, body.zone ?? null, body.active ?? null],
      );
      return getBin(pool, bin.code);
    },
  );
}
