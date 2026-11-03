import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { one, pool, q, withTx } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { pageQuery, paged } from '../lib/pagination.js';
import { makeTrackingNumber, suggestCarrier } from '../lib/shipping.js';
import { parse } from '../lib/validate.js';
import { enqueueOutbox } from '../services/erp.js';
import { applyMovement } from '../services/inventory.js';
import { findItem, getBin, getSettings } from '../services/lookups.js';

const SO_STATUSES = ['OPEN', 'PICKING', 'PICKED', 'SHIPPED', 'CANCELLED'] as const;

const listQuery = pageQuery.extend({
  status: z.enum(SO_STATUSES).optional(),
  pickable: z.enum(['true', 'false']).optional(),
  shippable: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(80).optional(),
});

const createSchema = z.object({
  soNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/)
    .optional(),
  customer: z.string().trim().min(1).max(120),
  country: z.string().trim().toUpperCase().length(2).optional().default('US'),
  priority: z.enum(['STANDARD', 'RUSH']).optional().default('STANDARD'),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1), qty: z.number().int().positive() }))
    .min(1)
    .max(100),
});

const pickSchema = z.object({
  lineNo: z.number().int().positive(),
  bin: z.string().trim().min(1, 'bin is required'),
  qty: z.number().int().positive('qty must be a positive whole number'),
  lot: z.string().trim().max(40).optional(),
  sku: z.string().trim().optional(),
});

const completeSchema = z.object({ shortReason: z.string().trim().max(200).optional() });

const shipSchema = z.object({
  weightLb: z.number().positive().max(10_000).optional(),
  carrier: z.string().trim().min(1).max(40).optional(),
  service: z.string().trim().min(1).max(60).optional(),
  trackingNumber: z.string().trim().min(4).max(60).optional(),
});

const suggestQuery = z.object({
  weightLb: z.coerce.number().positive(),
  country: z.string().trim().length(2).default('US'),
  priority: z.enum(['STANDARD', 'RUSH']).default('STANDARD'),
});

const HEADER_COLS = `so.id, so.so_number AS "soNumber", so.customer, so.ship_to_country AS "country", so.priority, so.status,
  so.erp_id AS "erpId", so.carrier, so.service, so.tracking_number AS "trackingNumber", so.weight_lb AS "weightLb",
  so.short_reason AS "shortReason", so.picked_at AS "pickedAt", so.shipped_at AS "shippedAt", so.created_at AS "createdAt",
  (SELECT display_name FROM users WHERE id = so.picked_by) AS "pickedBy",
  (SELECT display_name FROM users WHERE id = so.shipped_by) AS "shippedBy"`;

interface SoHeader {
  id: number;
  soNumber: string;
  customer: string;
  country: string;
  priority: 'STANDARD' | 'RUSH';
  status: string;
}

interface SoLine {
  id: number;
  lineNo: number;
  itemId: number;
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  weightLb: number;
  qtyOrdered: number;
  qtyPicked: number;
  qtyRemaining: number;
}

async function loadLines(db: PoolClient | typeof pool, soId: number): Promise<SoLine[]> {
  return q<SoLine>(
    db,
    `SELECT l.id, l.line_no AS "lineNo", l.item_id AS "itemId", i.sku, i.name, i.barcode, i.lot_tracked AS "lotTracked",
       i.weight_lb AS "weightLb", l.qty_ordered AS "qtyOrdered", l.qty_picked AS "qtyPicked", (l.qty_ordered - l.qty_picked) AS "qtyRemaining"
     FROM so_lines l JOIN items i ON i.id = l.item_id WHERE l.so_id = $1 ORDER BY l.line_no`,
    [soId],
  );
}

async function loadHeader(
  db: PoolClient | typeof pool,
  soNumber: string,
  lock = false,
): Promise<SoHeader> {
  const so = await one<SoHeader>(
    db,
    `SELECT ${HEADER_COLS} FROM sales_orders so WHERE upper(so.so_number) = upper($1)${lock ? ' FOR UPDATE OF so' : ''}`,
    [soNumber],
  );
  if (!so) throw notFound('SO_NOT_FOUND', `No sales order "${soNumber}"`);
  return so;
}

function estimateWeight(lines: SoLine[]): number {
  const total = lines.reduce(
    (sum, l) => sum + (l.qtyPicked > 0 ? l.qtyPicked : l.qtyOrdered) * Number(l.weightLb),
    0,
  );
  return Math.max(0.1, Math.round(total * 100) / 100);
}

export async function salesOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sales-orders', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const where = `WHERE ($1::text IS NULL OR so.status = $1)
      AND ($2::boolean IS NOT TRUE OR so.status IN ('OPEN', 'PICKING'))
      AND ($3::boolean IS NOT TRUE OR so.status = 'PICKED')
      AND ($4::text IS NULL OR so.so_number ILIKE '%' || $4 || '%' OR so.customer ILIKE '%' || $4 || '%')`;
    const params = [p.status ?? null, p.pickable === 'true', p.shippable === 'true', p.q || null];
    const rows = await q(
      pool,
      `SELECT ${HEADER_COLS},
         (SELECT count(*) FROM so_lines l WHERE l.so_id = so.id)::int AS "lineCount",
         (SELECT COALESCE(SUM(qty_ordered), 0) FROM so_lines l WHERE l.so_id = so.id)::int AS "qtyOrdered",
         (SELECT COALESCE(SUM(qty_picked), 0) FROM so_lines l WHERE l.so_id = so.id)::int AS "qtyPicked"
       FROM sales_orders so ${where}
       ORDER BY CASE so.status WHEN 'PICKING' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'PICKED' THEN 2 WHEN 'SHIPPED' THEN 3 ELSE 4 END,
         CASE so.priority WHEN 'RUSH' THEN 0 ELSE 1 END, so.so_number
       LIMIT $5 OFFSET $6`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const total = await one<{ n: number }>(
      pool,
      `SELECT count(*)::int AS n FROM sales_orders so ${where}`,
      params,
    );
    return paged(rows, total?.n ?? 0, p);
  });

  app.get('/shipping/suggest', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(suggestQuery, req.query, 'query');
    return suggestCarrier(p);
  });

  app.get<{ Params: { soNumber: string } }>(
    '/sales-orders/:soNumber',
    { preHandler: [app.authenticate] },
    async (req) => {
      const so = await loadHeader(pool, req.params.soNumber);
      const lines = await loadLines(pool, so.id);
      const detailed = [];
      for (const l of lines) {
        const suggestions = await q(
          pool,
          `SELECT b.code AS bin, b.zone, inv.lot, inv.qty_on_hand AS "qtyOnHand"
         FROM inventory inv JOIN bins b ON b.id = inv.bin_id
         WHERE inv.item_id = $1 AND inv.qty_on_hand > 0 AND b.active AND b.zone IN ('PICKING', 'STORAGE', 'RECEIVING')
         ORDER BY CASE b.zone WHEN 'PICKING' THEN 0 WHEN 'STORAGE' THEN 1 ELSE 2 END, inv.updated_at, b.code`,
          [l.itemId],
        );
        const { itemId: _itemId, ...rest } = l;
        detailed.push({
          ...rest,
          available: suggestions.reduce((s, r) => s + Number(r.qtyOnHand), 0),
          suggestions,
        });
      }
      const picks = await q(
        pool,
        `SELECT p.id, l.line_no AS "lineNo", i.sku, b.code AS bin, p.lot, p.qty, u.display_name AS "pickedBy", p.picked_at AS "pickedAt"
       FROM picks p JOIN so_lines l ON l.id = p.so_line_id JOIN items i ON i.id = p.item_id JOIN bins b ON b.id = p.bin_id
       LEFT JOIN users u ON u.id = p.picked_by WHERE l.so_id = $1 ORDER BY p.id`,
        [so.id],
      );
      const estimatedWeightLb = estimateWeight(lines);
      return {
        ...so,
        lines: detailed,
        picks,
        estimatedWeightLb,
        shippingSuggestion: suggestCarrier({
          weightLb: estimatedWeightLb,
          country: so.country,
          priority: so.priority,
        }),
      };
    },
  );

  app.post(
    '/sales-orders',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req, reply) => {
      const body = parse(createSchema, req.body ?? {}, 'sales order');
      const itemIds: number[] = [];
      for (const line of body.lines) {
        const item = await findItem(pool, line.sku);
        if (!item) throw badRequest('UNKNOWN_SKU', `Unknown SKU ${line.sku}`, { sku: line.sku });
        itemIds.push(item.id);
      }
      const soNumber = await withTx(async (client) => {
        const number =
          body.soNumber ??
          (await one<{ n: string }>(client, `SELECT 'SO-' || nextval('so_number_seq') AS n`))!.n;
        if (
          await one(client, 'SELECT 1 FROM sales_orders WHERE upper(so_number) = upper($1)', [
            number,
          ])
        ) {
          throw conflict('DUPLICATE_SO', `Sales order ${number} already exists`);
        }
        const header = await one<{ id: number }>(
          client,
          `INSERT INTO sales_orders (so_number, customer, ship_to_country, priority, status) VALUES ($1, $2, $3, $4, 'OPEN') RETURNING id`,
          [number, body.customer, body.country, body.priority],
        );
        for (let i = 0; i < body.lines.length; i++) {
          await client.query(
            `INSERT INTO so_lines (so_id, line_no, item_id, qty_ordered) VALUES ($1, $2, $3, $4)`,
            [header!.id, i + 1, itemIds[i], body.lines[i]!.qty],
          );
        }
        return number;
      });
      const so = await loadHeader(pool, soNumber);
      const lines = await loadLines(pool, so.id);
      return reply
        .status(201)
        .send({ ...so, lines: lines.map(({ itemId: _itemId, ...rest }) => rest) });
    },
  );

  app.post<{ Params: { soNumber: string } }>(
    '/sales-orders/:soNumber/picks',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = parse(pickSchema, req.body ?? {}, 'pick');
      const result = await withTx(async (client) => {
        const so = await loadHeader(client, req.params.soNumber, true);
        if (so.status !== 'OPEN' && so.status !== 'PICKING') {
          throw conflict('SO_NOT_PICKABLE', `Sales order ${so.soNumber} is ${so.status}`);
        }
        const settings = await getSettings(client);
        const lines = await loadLines(client, so.id);
        const line = lines.find((l) => l.lineNo === body.lineNo);
        if (!line) throw notFound('LINE_NOT_FOUND', `Line ${body.lineNo} is not on ${so.soNumber}`);
        if (body.sku) {
          const scanned = await findItem(client, body.sku);
          if (!scanned)
            throw notFound('ITEM_NOT_FOUND', `No item with SKU or barcode "${body.sku}"`);
          if (scanned.id !== line.itemId) {
            throw conflict(
              'WRONG_ITEM',
              `Scanned ${scanned.sku}, but line ${line.lineNo} is ${line.sku}`,
              {
                expected: line.sku,
                scanned: scanned.sku,
              },
            );
          }
        }
        if (body.qty > line.qtyRemaining) {
          throw conflict(
            'OVER_PICK',
            `Line ${line.lineNo} (${line.sku}) needs ${line.qtyRemaining} more; cannot pick ${body.qty}`,
            {
              lineNo: line.lineNo,
              qtyRemaining: line.qtyRemaining,
              requested: body.qty,
            },
          );
        }
        const bin = await getBin(client, body.bin);
        if (!bin.active) throw conflict('BIN_INACTIVE', `Bin ${bin.code} is inactive`);
        if (bin.zone === 'SHIPPING' || bin.zone === 'QUARANTINE') {
          throw conflict('INVALID_BIN_ZONE', `Cannot pick from a ${bin.zone} bin (${bin.code})`);
        }
        const lot = line.lotTracked ? (body.lot ?? '').trim() : '';
        if (line.lotTracked && !lot)
          throw badRequest('LOT_REQUIRED', `${line.sku} is lot tracked; a lot number is required`, {
            sku: line.sku,
          });

        const moved = await applyMovement(client, {
          itemId: line.itemId,
          binId: bin.id,
          lot,
          delta: -body.qty,
          type: 'PICK',
          reference: so.soNumber,
          userId: req.auth.id,
          allowNegative: settings.allowNegativeInventory,
        });
        await client.query(
          `INSERT INTO picks (so_line_id, item_id, bin_id, lot, qty, picked_by) VALUES ($1, $2, $3, $4, $5, $6)`,
          [line.id, line.itemId, bin.id, lot, body.qty, req.auth.id],
        );
        await client.query(`UPDATE so_lines SET qty_picked = qty_picked + $2 WHERE id = $1`, [
          line.id,
          body.qty,
        ]);
        await client.query(`UPDATE sales_orders SET status = 'PICKING' WHERE id = $1`, [so.id]);
        const qtyPicked = line.qtyPicked + body.qty;
        return {
          soNumber: so.soNumber,
          status: 'PICKING',
          line: {
            lineNo: line.lineNo,
            sku: line.sku,
            qtyOrdered: line.qtyOrdered,
            qtyPicked,
            qtyRemaining: line.qtyOrdered - qtyPicked,
          },
          bin: bin.code,
          lot,
          binQtyAfter: moved.qtyAfter,
          allLinesPicked: lines.every((l) =>
            l.lineNo === line.lineNo ? qtyPicked >= l.qtyOrdered : l.qtyRemaining <= 0,
          ),
        };
      });
      return reply.status(201).send(result);
    },
  );

  app.post<{ Params: { soNumber: string } }>(
    '/sales-orders/:soNumber/complete-pick',
    { preHandler: [app.authenticate] },
    async (req) => {
      const body = parse(completeSchema, req.body ?? {}, 'complete pick');
      return withTx(async (client) => {
        const so = await loadHeader(client, req.params.soNumber, true);
        if (so.status !== 'PICKING')
          throw conflict(
            'SO_NOT_PICKING',
            `Sales order ${so.soNumber} is ${so.status}; nothing to complete`,
          );
        const settings = await getSettings(client);
        const lines = await loadLines(client, so.id);
        const shortLines = lines.filter((l) => l.qtyRemaining > 0);
        if (shortLines.length > 0) {
          if (!settings.allowShortPick) {
            throw conflict(
              'SHORT_PICK_NOT_ALLOWED',
              'Short picks are disabled; pick every line in full',
              {
                shortLines: shortLines.map((l) => ({
                  lineNo: l.lineNo,
                  sku: l.sku,
                  qtyRemaining: l.qtyRemaining,
                })),
              },
            );
          }
          if (!body.shortReason) {
            throw badRequest(
              'SHORT_REASON_REQUIRED',
              'A reason is required when completing a short pick',
              {
                shortLines: shortLines.map((l) => ({
                  lineNo: l.lineNo,
                  sku: l.sku,
                  qtyRemaining: l.qtyRemaining,
                })),
              },
            );
          }
        }
        await client.query(
          `UPDATE sales_orders SET status = 'PICKED', picked_by = $2, picked_at = now(), short_reason = $3 WHERE id = $1`,
          [so.id, req.auth.id, shortLines.length > 0 ? body.shortReason : null],
        );
        return {
          soNumber: so.soNumber,
          status: 'PICKED',
          short: shortLines.length > 0,
          shortReason: shortLines.length > 0 ? body.shortReason : null,
          shortLines: shortLines.map((l) => ({
            lineNo: l.lineNo,
            sku: l.sku,
            qtyOrdered: l.qtyOrdered,
            qtyPicked: l.qtyPicked,
          })),
        };
      });
    },
  );

  app.post<{ Params: { soNumber: string } }>(
    '/sales-orders/:soNumber/ship',
    { preHandler: [app.authenticate] },
    async (req) => {
      const body = parse(shipSchema, req.body ?? {}, 'shipment');
      return withTx(async (client) => {
        const so = await loadHeader(client, req.params.soNumber, true);
        if (so.status !== 'PICKED')
          throw conflict(
            'SO_NOT_PICKED',
            `Sales order ${so.soNumber} is ${so.status}; only PICKED orders ship`,
          );
        const lines = await loadLines(client, so.id);
        const weightLb = body.weightLb ?? estimateWeight(lines);
        const suggestion = suggestCarrier({ weightLb, country: so.country, priority: so.priority });
        const carrier = body.carrier ?? suggestion.carrier;
        const service =
          body.service ??
          (body.carrier && body.carrier !== suggestion.carrier ? 'Standard' : suggestion.service);
        const trackingNumber = body.trackingNumber ?? makeTrackingNumber(carrier, so.soNumber);
        await client.query(
          `UPDATE sales_orders SET status = 'SHIPPED', carrier = $2, service = $3, tracking_number = $4, weight_lb = $5,
           shipped_by = $6, shipped_at = now() WHERE id = $1`,
          [so.id, carrier, service, trackingNumber, weightLb, req.auth.id],
        );
        await enqueueOutbox(client, 'item-fulfillment', so.soNumber, {
          soNumber: so.soNumber,
          carrier,
          service,
          trackingNumber,
          weightLb,
          shippedBy: req.auth.username,
          lines: lines
            .filter((l) => l.qtyPicked > 0)
            .map((l) => ({ sku: l.sku, qty: l.qtyPicked })),
        });
        return {
          soNumber: so.soNumber,
          status: 'SHIPPED',
          carrier,
          service,
          trackingNumber,
          weightLb,
          suggestion,
          erpQueued: true,
        };
      });
    },
  );

  app.post<{ Params: { soNumber: string } }>(
    '/sales-orders/:soNumber/cancel',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req) => {
      return withTx(async (client) => {
        const so = await loadHeader(client, req.params.soNumber, true);
        if (so.status !== 'OPEN')
          throw conflict(
            'SO_NOT_CANCELLABLE',
            `Only OPEN orders can be cancelled; ${so.soNumber} is ${so.status}`,
          );
        await client.query(`UPDATE sales_orders SET status = 'CANCELLED' WHERE id = $1`, [so.id]);
        return { soNumber: so.soNumber, status: 'CANCELLED' };
      });
    },
  );
}
