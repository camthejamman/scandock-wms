import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      db = 'error';
    }
    const body = {
      status: db === 'ok' ? 'ok' : 'degraded',
      version: config.version,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      db,
      testHooks: config.testHooks,
      time: new Date().toISOString(),
    };
    return reply.status(db === 'ok' ? 200 : 503).send(body);
  });
}
