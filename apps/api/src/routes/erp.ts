import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { one, pool, q } from '../db/pool.js';
import { parse } from '../lib/validate.js';
import { erpReachable, flushOutbox, pullOrders } from '../services/erp.js';

const logQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  status: z.enum(['OK', 'FAILED', 'SKIPPED']).optional(),
});

export async function erpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/erp/status', { preHandler: [app.authenticate] }, async () => {
    const reach = await erpReachable();
    const outbox = await one<{ pending: number; failed: number; sent: number }>(
      pool,
      `SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              count(*) FILTER (WHERE status = 'SENT')::int AS sent FROM erp_outbox`,
    );
    const last = await one<{ value: string }>(
      pool,
      `SELECT value FROM settings WHERE key = 'lastSyncAt'`,
    );
    const lastFailure = await one<{ message: string; createdAt: string }>(
      pool,
      `SELECT message, created_at AS "createdAt" FROM erp_sync_log WHERE status = 'FAILED' ORDER BY id DESC LIMIT 1`,
    );
    return {
      erpName: 'Nimbus ERP',
      erpUrl: config.erpUrl,
      reachable: reach.reachable,
      error: reach.error ?? null,
      lastSyncAt: last?.value ?? null,
      outbox: outbox ?? { pending: 0, failed: 0, sent: 0 },
      lastFailure: lastFailure ?? null,
    };
  });

  app.post(
    '/erp/sync',
    { preHandler: [app.authenticate, app.requireRole('admin', 'supervisor')] },
    async () => {
      const pushed = await flushOutbox();
      const pulled = await pullOrders();
      return { pulled, pushed, syncedAt: new Date().toISOString() };
    },
  );

  app.get('/erp/log', { preHandler: [app.authenticate] }, async (req) => {
    const p = parse(logQuery, req.query, 'query');
    const rows = await q(
      pool,
      `SELECT id, direction, entity, status, message, created_at AS "createdAt" FROM erp_sync_log
       WHERE ($1::text IS NULL OR status = $1) ORDER BY id DESC LIMIT $2`,
      [p.status ?? null, p.limit],
    );
    return { data: rows, total: rows.length };
  });

  app.get('/erp/outbox', { preHandler: [app.authenticate] }, async () => {
    const rows = await q(
      pool,
      `SELECT id, kind, reference, status, attempts, last_error AS "lastError", erp_ref AS "erpRef", created_at AS "createdAt", sent_at AS "sentAt"
       FROM erp_outbox ORDER BY id DESC LIMIT 200`,
    );
    return { data: rows, total: rows.length };
  });
}
