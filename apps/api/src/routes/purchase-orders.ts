import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { one, pool, q, withTx } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { pageQuery, paged } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { enqueueOutbox } from '../services/erp.js';
import { applyMovement } from '../services/inventory.js';
import { findItem, getBin, getSettings } from '../services/lookups.js';

const PO_STATUSES = ['OPEN', 'PARTIAL', 'RECEIVED', 'CLOSED'] as const;

const listQuery = pageQuery.extend({
  status: z.enum(PO_STATUSES).optional(),
  open: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(80).optional(),
});

const createSchema = z.object({
  poNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/)
    .optional(),
  vendor: z.string().trim().min(1).max(120),
  expectedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expectedDate must be YYYY-MM-DD')
    .optional(),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1), qty: z.number().int().positive() }))
    .min(1)
    .max(100),
});

const receiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineNo: z.number().int().positive().optional(),
        sku: z.string().trim().min(1).optional(),
        qty: z.number().int().positive('qty must be a positive whole number'),
        bin: z.string().trim().min(1, 'bin is required'),
        lot: z.string().trim().max(40).optional(),
      }),
    )
    .min(1, 'At least one line is required')
    .max(100),
});

const HEADER_COLS = `po.id, po.po_number AS "poNumber", po.vendor, po.status, po.expected_date AS "expectedDate",
  po.erp_id AS "erpId", po.created_at AS "createdAt"`;

interface PoHeader {
  id: number;
  poNumber: string;
  vendor: string;
  status: string;
  expectedDate: string | null;
  erpId: string | null;
  createdAt: string;
}

interface PoLine {
  id: number;
  lineNo: number;
  itemId: number;
  sku: string;
  name: string;
  barcode: string;
  lotTracked: boolean;
  qtyOrdered: number;
  qtyReceived: number;
  qtyRemaining: number;
}

async function loadLines(db: PoolClient | typeof pool, poId: number): Promise<PoLine[]> {
  return q<PoLine>(
    db,
    `SELECT l.id, l.line_no AS "lineNo", l.item_id AS "itemId", i.sku, i.name, i.barcode, i.lot_tracked AS "lotTracked",
       l.qty_ordered AS "qtyOrdered", l.qty_received AS "qtyReceived", (l.qty_ordered - l.qty_received) AS "qtyRemaining"
     FROM po_lines l JOIN items i ON i.id = l.item_id WHERE l.po_id = $1 ORDER BY l.line_no`,
    [poId],
  );
}

export async function purchaseOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/purchase-orders', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    const where = `WHERE ($1::text IS NULL OR po.status = $1)
      AND ($2::boolean IS NOT TRUE OR po.status IN ('OPEN', 'PARTIAL'))
      AND ($3::text IS NULL OR po.po_number ILIKE '%' || $3 || '%' OR po.vendor ILIKE '%' || $3 || '%')`;
    const params = [p.status ?? null, p.open === 'true', p.q || null];
    const rows = await q(
      pool,
      `SELECT ${HEADER_COLS},
         (SELECT count(*) FROM po_lines l WHERE l.po_id = po.id)::int AS "lineCount",
         (SELECT COALESCE(SUM(qty_ordered), 0) FROM po_lines l WHERE l.po_id = po.id)::int AS "qtyOrdered",
         (SELECT COALESCE(SUM(qty_received), 0) FROM po_lines l WHERE l.po_id = po.id)::int AS "qtyReceived"
       FROM purchase_orders po ${where}
       ORDER BY CASE po.status WHEN 'OPEN' THEN 0 WHEN 'PARTIAL' THEN 1 WHEN 'RECEIVED' THEN 2 ELSE 3 END, po.expected_date NULLS LAST, po.po_number
       LIMIT $4 OFFSET $5`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const total = await one<{ n: number }>(
      pool,
      `SELECT count(*)::int AS n FROM purchase_orders po ${where}`,
      params,
    );
    return paged(rows, total?.n ?? 0, p);
  });

  app.get<{ Params: { poNumber: string } }>(
    '/purchase-orders/:poNumber',
    { preHandler: [app.authenticate] },
    async (req) => {
      const po = await one<PoHeader>(
        pool,
        `SELECT ${HEADER_COLS} FROM purchase_orders po WHERE upper(po.po_number) = upper($1)`,
        [req.params.poNumber],
      );
      if (!po) throw notFound('PO_NOT_FOUND', `No purchase order "${req.params.poNumber}"`);
      const lines = await loadLines(pool, po.id);
      const receipts = await q(
        pool,
        `SELECT r.id, r.received_at AS "receivedAt", u.display_name AS "receivedBy",
         json_agg(json_build_object('lineNo', pl.line_no, 'sku', i.sku, 'qty', rl.qty, 'bin', b.code, 'lot', rl.lot) ORDER BY pl.line_no) AS lines
       FROM receipts r
       LEFT JOIN users u ON u.id = r.received_by
       JOIN receipt_lines rl ON rl.receipt_id = r.id
       JOIN po_lines pl ON pl.id = rl.po_line_id
       JOIN items i ON i.id = rl.item_id
       JOIN bins b ON b.id = rl.bin_id
       WHERE r.po_id = $1 GROUP BY r.id, u.display_name ORDER BY r.id`,
        [po.id],
      );
      return { ...po, lines: lines.map(({ itemId: _itemId, ...rest }) => rest), receipts };
    },
  );

  app.post(
    '/purchase-orders',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req, reply) => {
      const body = parse(createSchema, req.body ?? {}, 'purchase order');
      const itemIds: number[] = [];
      for (const line of body.lines) {
        const item = await findItem(pool, line.sku);
        if (!item) throw badRequest('UNKNOWN_SKU', `Unknown SKU ${line.sku}`, { sku: line.sku });
        itemIds.push(item.id);
      }
      const poNumber = await withTx(async (client) => {
        const number =
          body.poNumber ??
          (await one<{ n: string }>(client, `SELECT 'PO-' || nextval('po_number_seq') AS n`))!.n;
        if (
          await one(client, 'SELECT 1 FROM purchase_orders WHERE upper(po_number) = upper($1)', [
            number,
          ])
        ) {
          throw conflict('DUPLICATE_PO', `Purchase order ${number} already exists`);
        }
        const header = await one<{ id: number }>(
          client,
          `INSERT INTO purchase_orders (po_number, vendor, status, expected_date) VALUES ($1, $2, 'OPEN', $3) RETURNING id`,
          [number, body.vendor, body.expectedDate ?? null],
        );
        for (let i = 0; i < body.lines.length; i++) {
          await client.query(
            `INSERT INTO po_lines (po_id, line_no, item_id, qty_ordered) VALUES ($1, $2, $3, $4)`,
            [header!.id, i + 1, itemIds[i], body.lines[i]!.qty],
          );
        }
        return number;
      });
      const po = await one<PoHeader>(
        pool,
        `SELECT ${HEADER_COLS} FROM purchase_orders po WHERE po.po_number = $1`,
        [poNumber],
      );
      const lines = await loadLines(pool, po!.id);
      return reply
        .status(201)
        .send({ ...po, lines: lines.map(({ itemId: _itemId, ...rest }) => rest), receipts: [] });
    },
  );

  app.post<{ Params: { poNumber: string } }>(
    '/purchase-orders/:poNumber/receipts',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = parse(receiveSchema, req.body ?? {}, 'receipt');
      const result = await withTx(async (client) => {
        const po = await one<PoHeader>(
          client,
          `SELECT ${HEADER_COLS} FROM purchase_orders po WHERE upper(po.po_number) = upper($1) FOR UPDATE`,
          [req.params.poNumber],
        );
        if (!po) throw notFound('PO_NOT_FOUND', `No purchase order "${req.params.poNumber}"`);
        if (po.status === 'RECEIVED' || po.status === 'CLOSED') {
          throw conflict(
            'PO_NOT_OPEN',
            `Purchase order ${po.poNumber} is ${po.status} and cannot receive more`,
          );
        }
        const settings = await getSettings(client);
        const lines = await loadLines(client, po.id);
        const receipt = await one<{ id: number }>(
          client,
          `INSERT INTO receipts (po_id, received_by) VALUES ($1, $2) RETURNING id`,
          [po.id, req.auth.id],
        );
        const posted: Array<{
          lineNo: number;
          sku: string;
          qty: number;
          bin: string;
          lot: string;
          qtyReceived: number;
          qtyRemaining: number;
        }> = [];

        for (const input of body.lines) {
          let line: PoLine | undefined;
          if (input.lineNo !== undefined) {
            line = lines.find((l) => l.lineNo === input.lineNo);
            if (!line)
              throw badRequest('LINE_NOT_ON_PO', `Line ${input.lineNo} is not on ${po.poNumber}`, {
                lineNo: input.lineNo,
              });
            if (input.sku && (await findItem(client, input.sku))?.id !== line.itemId) {
              throw badRequest(
                'LINE_ITEM_MISMATCH',
                `Line ${input.lineNo} is ${line.sku}, not ${input.sku}`,
              );
            }
          } else if (input.sku) {
            const item = await findItem(client, input.sku);
            if (!item)
              throw notFound('ITEM_NOT_FOUND', `No item with SKU or barcode "${input.sku}"`);
            const matches = lines.filter((l) => l.itemId === item.id);
            if (matches.length === 0)
              throw badRequest('LINE_NOT_ON_PO', `${item.sku} is not on ${po.poNumber}`, {
                sku: item.sku,
              });
            if (matches.length > 1)
              throw badRequest('AMBIGUOUS_LINE', `${item.sku} is on several lines; send lineNo`, {
                sku: item.sku,
              });
            line = matches[0];
          } else {
            throw badRequest('VALIDATION_ERROR', 'Each line needs a lineNo or a sku');
          }
          const l = line!;
          if (l.qtyRemaining < input.qty && !settings.allowOverReceipt) {
            throw conflict(
              'OVER_RECEIPT',
              `Line ${l.lineNo} (${l.sku}) has ${l.qtyRemaining} remaining; cannot receive ${input.qty}`,
              {
                lineNo: l.lineNo,
                sku: l.sku,
                qtyRemaining: l.qtyRemaining,
                requested: input.qty,
              },
            );
          }
          const bin = await getBin(client, input.bin);
          if (!bin.active) throw conflict('BIN_INACTIVE', `Bin ${bin.code} is inactive`);
          if (bin.zone === 'SHIPPING')
            throw conflict(
              'INVALID_BIN_ZONE',
              `Cannot receive into a ${bin.zone} bin (${bin.code})`,
            );
          const lot = l.lotTracked ? (input.lot ?? '').trim() : '';
          if (l.lotTracked && !lot)
            throw badRequest('LOT_REQUIRED', `${l.sku} is lot tracked; a lot number is required`, {
              sku: l.sku,
            });

          await client.query(
            `INSERT INTO receipt_lines (receipt_id, po_line_id, item_id, bin_id, lot, qty) VALUES ($1, $2, $3, $4, $5, $6)`,
            [receipt!.id, l.id, l.itemId, bin.id, lot, input.qty],
          );
          await applyMovement(client, {
            itemId: l.itemId,
            binId: bin.id,
            lot,
            delta: input.qty,
            type: 'RECEIPT',
            reference: po.poNumber,
            userId: req.auth.id,
          });
          await client.query(`UPDATE po_lines SET qty_received = qty_received + $2 WHERE id = $1`, [
            l.id,
            input.qty,
          ]);
          l.qtyReceived += input.qty;
          l.qtyRemaining -= input.qty;
          posted.push({
            lineNo: l.lineNo,
            sku: l.sku,
            qty: input.qty,
            bin: bin.code,
            lot,
            qtyReceived: l.qtyReceived,
            qtyRemaining: l.qtyRemaining,
          });
        }

        const allReceived = lines.every((l) => l.qtyRemaining <= 0);
        const anyReceived = lines.some((l) => l.qtyReceived > 0);
        const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'OPEN';
        await client.query('UPDATE purchase_orders SET status = $2 WHERE id = $1', [po.id, status]);
        await enqueueOutbox(client, 'item-receipt', `${po.poNumber}/RCPT-${receipt!.id}`, {
          poNumber: po.poNumber,
          receiptId: receipt!.id,
          receivedBy: req.auth.username,
          lines: posted.map((x) => ({ sku: x.sku, qty: x.qty, bin: x.bin, lot: x.lot })),
        });
        return {
          receiptId: receipt!.id,
          poNumber: po.poNumber,
          poStatus: status,
          lines: posted,
          erpQueued: true,
        };
      });
      return reply.status(201).send(result);
    },
  );

  app.post<{ Params: { poNumber: string } }>(
    '/purchase-orders/:poNumber/close',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async (req) => {
      const po = await one<PoHeader>(
        pool,
        `SELECT ${HEADER_COLS} FROM purchase_orders po WHERE upper(po.po_number) = upper($1)`,
        [req.params.poNumber],
      );
      if (!po) throw notFound('PO_NOT_FOUND', `No purchase order "${req.params.poNumber}"`);
      if (po.status === 'CLOSED')
        throw conflict('PO_ALREADY_CLOSED', `${po.poNumber} is already closed`);
      await pool.query(`UPDATE purchase_orders SET status = 'CLOSED' WHERE id = $1`, [po.id]);
      return { ...po, status: 'CLOSED' };
    },
  );
}
