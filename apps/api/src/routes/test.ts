import type { FastifyInstance } from 'fastify';
import { resetAndSeed } from '../db/seed.js';
import { erpFetch } from '../services/erp.js';

/** Only registered when TEST_HOOKS=true. Lets the e2e suite start from a known state. */
export async function testRoutes(app: FastifyInstance): Promise<void> {
  app.post('/test/reset', async () => {
    const started = Date.now();
    await resetAndSeed();
    let erpReset = false;
    try {
      const res = await erpFetch('/erp/_reset', { method: 'POST' }, 2000);
      erpReset = res.ok;
    } catch {
      erpReset = false;
    }
    return { ok: true, erpReset, tookMs: Date.now() - started, seededAt: new Date().toISOString() };
  });
}
