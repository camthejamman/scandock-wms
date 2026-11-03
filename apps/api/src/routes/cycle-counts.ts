import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { one, pool, q, withTx } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { pageQuery, paged } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { summarizeCount } from '../lib/variance.js';
import { enqueueOutbox } from '../services/erp.js';
import { applyMovement } from '../services/inventory.js';
import { findItem, getBin, getSettings } from '../services/lookups.js';

const CC_STATUSES = ['OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;

const listQuery = pageQuery.extend({
  status: z.enum(CC_STATUSES).optional(),
  assignedTo: z.string().trim().max(20).optional(),
  bin: z.string().trim().max(20).optional(),
});

const createSchema = z.object({
  bin: z.string().trim().min(1, 'bin is required'),
  assignedTo: z.union([z.number().int().positive(), z.string().trim().min(1)]).optional(),
});

const submitSchema = z.object({
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        lot: z.string().trim().max(40).optional(),
        countedQty: z.number().int().min(0),
      }),
    )
    .max(200),
});

const reviewSchema = z.object({ notes: z.string().trim().max(500).optional() });

const HEADER_COLS = `c.id, b.code AS bin, b.zone, c.status, c.assigned_to AS "assignedToId",
  (SELECT display_name FROM users WHERE id = c.assigned_to) AS "assignedTo",
  (SELECT username FROM users WHERE id = c.assigned_to) AS "assignedToUsername",
  (SELECT display_name FROM users WHERE id = c.created_by) AS "createdBy",
  (SELECT display_name FROM users WHERE id = c.submitted_by) AS "submittedBy",
  (SELECT display_name FROM users WHERE id = c.reviewed_by) AS "reviewedBy",
  c.created_at AS "createdAt", c.submitted_at AS "submittedAt", c.reviewed_at AS "reviewedAt", c.notes`;

interface CcHeader {
  id: number;
  bin: string;
  zone: string;
  status: string;
  assignedToId: number | null;
  assignedTo: string | null;
}

interface CcLine {
  id: number;
  itemId: number;
  sku: string;
  name: string;
  lot: string;
  expectedQty: number;
  countedQty: number | null;
}

async function loadHeader(
  db: PoolClient | typeof pool,
  id: number,
  lock = false,
): Promise<CcHeader> {
  if (!Number.isInteger(id)) throw notFound('COUNT_NOT_FOUND', `No cycle count ${id}`);
  const row = await one<CcHeader>(
    db,
    `SELECT ${HEADER_COLS} FROM cycle_counts c JOIN bins b ON b.id = c.bin_id WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
    [id],
  );
  if (!row) throw notFound('COUNT_NOT_FOUND', `No cycle count ${id}`);
  return row;
}

async function loadLines(db: PoolClient | typeof pool, id: number): Promise<CcLine[]> {
  return q<CcLine>(
    db,
    `SELECT l.id, l.item_id AS "itemId", i.sku, i.name, l.lot, l.expected_qty AS "expectedQty", l.counted_qty AS "countedQty"
     FROM cycle_count_lines l JOIN items i ON i.id = l.item_id WHERE l.count_id = $1 ORDER BY i.sku, l.lot`,
    [id],
  );
}

export async function cycleCountRoutes(app: FastifyInstance): Promise<void> {
  const reviewers = app.requireRole('admin', 'supervisor');

  app.get('/cycle-counts', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(listQuery, req.query, 'query');
    let assigned: number | null = null;
    if (p.assignedTo === 'me') assigned = req.auth.id;
    else if (p.assignedTo) assigned = Number(p.assignedTo) || null;
    // Operators only see their own counts and unassigned open ones.
    const operatorOnly = req.auth.role === 'operator';
    const where = `WHERE ($1::text IS NULL OR c.status = $1)
      AND ($2::int IS NULL OR c.assigned_to = $2)
      AND ($3::text IS NULL OR upper(b.code) = upper($3))
      AND ($4::boolean IS NOT TRUE OR c.assigned_to = $5 OR (c.assigned_to IS NULL AND c.status = 'OPEN'))`;
    const params = [p.status ?? null, assigned, p.bin || null, operatorOnly, req.auth.id];
    const rows = await q(
      pool,
      `SELECT ${HEADER_COLS},
         (SELECT count(*) FROM cycle_count_lines l WHERE l.count_id = c.id)::int AS "lineCount",
         (SELECT count(*) FROM cycle_count_lines l WHERE l.count_id = c.id AND l.counted_qty IS NOT NULL AND l.counted_qty <> l.expected_qty)::int AS "varianceLines"
       FROM cycle_counts c JOIN bins b ON b.id = c.bin_id ${where}
       ORDER BY CASE c.status WHEN 'SUBMITTED' THEN 0 WHEN 'OPEN' THEN 1 ELSE 2 END, c.id DESC
       LIMIT $6 OFFSET $7`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const total = await one<{ n: number }>(
      pool,
      `SELECT count(*)::int AS n FROM cycle_counts c JOIN bins b ON b.id = c.bin_id ${where}`,
      params,
    );
    return paged(rows, total?.n ?? 0, p);
  });

  app.get<{ Params: { id: string } }>(
    '/cycle-counts/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const header = await loadHeader(pool, Number(req.params.id));
      const settings = await getSettings(pool);
      const lines = await loadLines(pool, header.id);
      const blind = settings.blindCounts && req.auth.role === 'operator';
      if (
        req.auth.role === 'operator' &&
        header.assignedToId &&
        header.assignedToId !== req.auth.id
      ) {
        throw forbidden('NOT_ASSIGNED', 'This count is assigned to someone else');
      }
      const visible = blind ? lines.filter((l) => l.countedQty !== null) : lines;
      return {
        ...header,
        blind,
        lines: visible.map((l) => ({
          sku: l.sku,
          name: l.name,
          lot: l.lot,
          expectedQty: blind ? null : l.expectedQty,
          countedQty: l.countedQty,
          variance: blind || l.countedQty === null ? null : l.countedQty - l.expectedQty,
        })),
        summary: header.status === 'OPEN' || blind ? null : summarizeCount(lines),
      };
    },
  );

  app.post('/cycle-counts', { preHandler: [app.authenticate, reviewers] }, async (req, reply) => {
    const body = parse(createSchema, req.body ?? {}, 'cycle count');
    const id = await withTx(async (client) => {
      const bin = await getBin(client, body.bin);
      let assignedTo: number | null = null;
      if (body.assignedTo !== undefined) {
        const user = await one<{ id: number; active: boolean }>(
          client,
          typeof body.assignedTo === 'number'
            ? 'SELECT id, active FROM users WHERE id = $1'
            : 'SELECT id, active FROM users WHERE lower(username) = lower($1)',
          [body.assignedTo],
        );
        if (!user) throw badRequest('UNKNOWN_USER', `No user ${body.assignedTo}`);
        if (!user.active)
          throw conflict('USER_INACTIVE', 'Cannot assign a count to an inactive user');
        assignedTo = user.id;
      }
      const open = await one(
        client,
        `SELECT 1 FROM cycle_counts WHERE bin_id = $1 AND status IN ('OPEN', 'SUBMITTED')`,
        [bin.id],
      );
      if (open)
        throw conflict('COUNT_ALREADY_OPEN', `Bin ${bin.code} already has a count in progress`);
      const header = await one<{ id: number }>(
        client,
        `INSERT INTO cycle_counts (bin_id, status, assigned_to, created_by) VALUES ($1, 'OPEN', $2, $3) RETURNING id`,
        [bin.id, assignedTo, req.auth.id],
      );
      // Snapshot what the system believes is in the bin right now.
      await client.query(
        `INSERT INTO cycle_count_lines (count_id, item_id, lot, expected_qty)
         SELECT $1, item_id, lot, qty_on_hand FROM inventory WHERE bin_id = $2 AND qty_on_hand <> 0`,
        [header!.id, bin.id],
      );
      return header!.id;
    });
    const header = await loadHeader(pool, id);
    const lines = await loadLines(pool, id);
    return reply.status(201).send({
      ...header,
      blind: false,
      lines: lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        lot: l.lot,
        expectedQty: l.expectedQty,
        countedQty: null,
        variance: null,
      })),
      summary: null,
    });
  });

  app.post<{ Params: { id: string } }>(
    '/cycle-counts/:id/submit',
    { preHandler: [app.authenticate] },
    async (req) => {
      const body = parse(submitSchema, req.body ?? {}, 'count submission');
      return withTx(async (client) => {
        const header = await loadHeader(client, Number(req.params.id), true);
        if (header.status !== 'OPEN')
          throw conflict('COUNT_NOT_OPEN', `Count ${header.id} is ${header.status}`);
        if (
          req.auth.role === 'operator' &&
          header.assignedToId &&
          header.assignedToId !== req.auth.id
        ) {
          throw forbidden('NOT_ASSIGNED', 'This count is assigned to someone else');
        }
        const existing = await loadLines(client, header.id);
        const counted = new Map<
          string,
          { itemId: number; sku: string; lot: string; qty: number }
        >();
        for (const input of body.lines) {
          const item = await findItem(client, input.sku);
          if (!item)
            throw badRequest('UNKNOWN_SKU', `Unknown SKU or barcode ${input.sku}`, {
              sku: input.sku,
            });
          const lot = item.lotTracked ? (input.lot ?? '').trim() : '';
          if (item.lotTracked && !lot)
            throw badRequest(
              'LOT_REQUIRED',
              `${item.sku} is lot tracked; a lot number is required`,
              { sku: item.sku },
            );
          const key = `${item.id}|${lot}`;
          const prev = counted.get(key);
          counted.set(key, {
            itemId: item.id,
            sku: item.sku,
            lot,
            qty: (prev?.qty ?? 0) + input.countedQty,
          });
        }
        // Expected lines not reported count as zero; reported items not expected become new lines.
        for (const line of existing) {
          const key = `${line.itemId}|${line.lot}`;
          const c = counted.get(key);
          await client.query(`UPDATE cycle_count_lines SET counted_qty = $2 WHERE id = $1`, [
            line.id,
            c?.qty ?? 0,
          ]);
          counted.delete(key);
        }
        for (const c of counted.values()) {
          await client.query(
            `INSERT INTO cycle_count_lines (count_id, item_id, lot, expected_qty, counted_qty) VALUES ($1, $2, $3, 0, $4)`,
            [header.id, c.itemId, c.lot, c.qty],
          );
        }
        await client.query(
          `UPDATE cycle_counts SET status = 'SUBMITTED', submitted_by = $2, submitted_at = now(), assigned_to = COALESCE(assigned_to, $2) WHERE id = $1`,
          [header.id, req.auth.id],
        );
        const lines = await loadLines(client, header.id);
        const settings = await getSettings(client);
        const blind = settings.blindCounts && req.auth.role === 'operator';
        return {
          id: header.id,
          bin: header.bin,
          status: 'SUBMITTED',
          lines: lines.map((l) => ({
            sku: l.sku,
            lot: l.lot,
            expectedQty: blind ? null : l.expectedQty,
            countedQty: l.countedQty,
            variance: blind ? null : (l.countedQty ?? 0) - l.expectedQty,
          })),
          summary: blind ? null : summarizeCount(lines),
        };
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cycle-counts/:id/approve',
    { preHandler: [app.authenticate, reviewers] },
    async (req) => {
      const body = parse(reviewSchema, req.body ?? {}, 'review');
      return withTx(async (client) => {
        const header = await loadHeader(client, Number(req.params.id), true);
        if (header.status !== 'SUBMITTED')
          throw conflict(
            'COUNT_NOT_SUBMITTED',
            `Count ${header.id} is ${header.status}; only SUBMITTED counts can be approved`,
          );
        const bin = await getBin(client, header.bin);
        const lines = await loadLines(client, header.id);
        const adjustments: Array<{ sku: string; bin: string; lot: string; qtyDelta: number }> = [];
        for (const line of lines) {
          const delta = (line.countedQty ?? 0) - line.expectedQty;
          if (delta === 0) continue;
          await applyMovement(client, {
            itemId: line.itemId,
            binId: bin.id,
            lot: line.lot,
            delta,
            type: 'ADJUSTMENT',
            reference: `CC-${header.id}`,
            userId: req.auth.id,
            allowNegative: true,
          });
          adjustments.push({ sku: line.sku, bin: bin.code, lot: line.lot, qtyDelta: delta });
        }
        await client.query(
          `UPDATE cycle_counts SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now(), notes = COALESCE($3, notes) WHERE id = $1`,
          [header.id, req.auth.id, body.notes ?? null],
        );
        if (adjustments.length > 0) {
          await enqueueOutbox(client, 'inventory-adjustment', `CC-${header.id}`, {
            reference: `CC-${header.id}`,
            reason: 'Cycle count',
            approvedBy: req.auth.username,
            lines: adjustments,
          });
        }
        return {
          id: header.id,
          bin: header.bin,
          status: 'APPROVED',
          adjustments,
          summary: summarizeCount(lines),
          erpQueued: adjustments.length > 0,
        };
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cycle-counts/:id/reject',
    { preHandler: [app.authenticate, reviewers] },
    async (req) => {
      const body = parse(reviewSchema, req.body ?? {}, 'review');
      return withTx(async (client) => {
        const header = await loadHeader(client, Number(req.params.id), true);
        if (header.status !== 'SUBMITTED')
          throw conflict(
            'COUNT_NOT_SUBMITTED',
            `Count ${header.id} is ${header.status}; only SUBMITTED counts can be rejected`,
          );
        await client.query(
          `UPDATE cycle_counts SET status = 'REJECTED', reviewed_by = $2, reviewed_at = now(), notes = COALESCE($3, notes) WHERE id = $1`,
          [header.id, req.auth.id, body.notes ?? null],
        );
        return { id: header.id, bin: header.bin, status: 'REJECTED', notes: body.notes ?? '' };
      });
    },
  );
}
