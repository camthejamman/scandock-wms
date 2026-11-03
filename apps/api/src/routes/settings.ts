import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { parse } from '../lib/validate.js';
import { getSettings, saveSettings } from '../services/lookups.js';

const patchSchema = z
  .object({
    allowShortPick: z.boolean().optional(),
    blindCounts: z.boolean().optional(),
    allowNegativeInventory: z.boolean().optional(),
    allowOverReceipt: z.boolean().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'At least one setting is required');

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', { preHandler: [app.authenticate] }, async () => getSettings(pool));

  app.patch(
    '/settings',
    { preHandler: [app.authenticate, app.requireRole('admin')] },
    async (req) => {
      const patch = parse(patchSchema, req.body ?? {}, 'settings');
      return saveSettings(pool, patch);
    },
  );
}
