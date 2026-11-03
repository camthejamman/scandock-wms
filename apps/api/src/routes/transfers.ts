import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, q, withTx } from '../db/pool.js';
import { badRequest, conflict } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { applyMovement } from '../services/inventory.js';
import { getBin, getItem, getSettings } from '../services/lookups.js';

const transferSchema = z.object({
  sku: z.string().trim().min(1, 'sku is required'),
  fromBin: z.string().trim().min(1, 'fromBin is required'),
  toBin: z.string().trim().min(1, 'toBin is required'),
  qty: z.number().int().positive('qty must be a positive whole number'),
  lot: z.string().trim().max(40).optional(),
});

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function transferRoutes(app: FastifyInstance): Promise<void> {
  app.post('/transfers', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = parse(transferSchema, req.body ?? {}, 'transfer');
    const result = await withTx(async (client) => {
      const item = await getItem(client, body.sku);
      const from = await getBin(client, body.fromBin);
      const to = await getBin(client, body.toBin);
      if (from.id === to.id)
        throw badRequest('SAME_BIN', 'Source and destination bins must differ');
      if (!to.active) throw conflict('BIN_INACTIVE', `Bin ${to.code} is inactive`);
      const lot = item.lotTracked ? (body.lot ?? '').trim() : '';
      if (item.lotTracked && !lot)
        throw badRequest('LOT_REQUIRED', `${item.sku} is lot tracked; a lot number is required`, {
          sku: item.sku,
        });
      const settings = await getSettings(client);
      const ref = `TRF-${Date.now().toString(36).toUpperCase()}`;
      const out = await applyMovement(client, {
        itemId: item.id,
        binId: from.id,
        lot,
        delta: -body.qty,
        type: 'TRANSFER_OUT',
        reference: ref,
        userId: req.auth.id,
        allowNegative: settings.allowNegativeInventory,
      });
      const inn = await applyMovement(client, {
        itemId: item.id,
        binId: to.id,
        lot,
        delta: body.qty,
        type: 'TRANSFER_IN',
        reference: ref,
        userId: req.auth.id,
      });
      const row = await client.query<{ id: number }>(
        `INSERT INTO transfers (item_id, from_bin_id, to_bin_id, lot, qty, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [item.id, from.id, to.id, lot, body.qty, req.auth.id],
      );
      await client.query(`UPDATE transactions SET reference = $1 WHERE reference = $2`, [
        `TRF-${row.rows[0]!.id}`,
        ref,
      ]);
      return {
        id: row.rows[0]!.id,
        reference: `TRF-${row.rows[0]!.id}`,
        sku: item.sku,
        lot,
        qty: body.qty,
        from: { bin: from.code, qtyAfter: out.qtyAfter },
        to: { bin: to.code, qtyAfter: inn.qtyAfter },
      };
    });
    return reply.status(201).send(result);
  });

  app.get('/transfers', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const rows = await q(
      pool,
      `SELECT t.id, i.sku, i.name, f.code AS "fromBin", d.code AS "toBin", t.lot, t.qty, u.display_name AS "user", t.created_at AS "createdAt"
       FROM transfers t JOIN items i ON i.id = t.item_id JOIN bins f ON f.id = t.from_bin_id JOIN bins d ON d.id = t.to_bin_id
       LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT $1`,
      [p.limit],
    );
    return { data: rows, total: rows.length };
  });
}
