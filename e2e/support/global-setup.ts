import { request } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { API_URL, ERP_URL } from './env';

/**
 * Runs once before all projects:
 *  1. wait until API and ERP answer (compose may still be starting),
 *  2. reset the database to the seed so every run starts from the same place.
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync('.auth', { recursive: true });
  const ctx = await request.newContext();
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const [api, erp] = await Promise.all([
        ctx.get(`${API_URL}/api/health`),
        ctx.get(`${ERP_URL}/erp/health`),
      ]);
      if (api.ok() && erp.ok()) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline)
      throw new Error(`API (${API_URL}) or ERP (${ERP_URL}) did not become healthy in time`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const reset = await ctx.post(`${API_URL}/api/test/reset`);
  if (!reset.ok())
    throw new Error(
      `POST /api/test/reset failed: ${reset.status()} ${await reset.text()} (is TEST_HOOKS=true?)`,
    );
  await ctx.dispose();
}
