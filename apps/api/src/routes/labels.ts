import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { parse } from '../lib/validate.js';
import { binLabelZpl, itemLabelZpl } from '../lib/zpl.js';
import { getBin, getItem } from '../services/lookups.js';

const itemLabelQuery = z.object({ lot: z.string().trim().max(40).optional() });

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { code: string } }>(
    '/labels/bin/:code',
    { preHandler: [app.authenticate] },
    async (req) => {
      const bin = await getBin(pool, req.params.code);
      return { type: 'bin', code: bin.code, zone: bin.zone, zpl: binLabelZpl(bin.code, bin.zone) };
    },
  );

  app.get<{ Params: { key: string } }>(
    '/labels/item/:key',
    { preHandler: [app.authenticate] },
    async (req) => {
      const item = await getItem(pool, req.params.key);
      const { lot } = parse(itemLabelQuery, req.query, 'query');
      return {
        type: 'item',
        sku: item.sku,
        name: item.name,
        barcode: item.barcode,
        lot: lot ?? null,
        zpl: itemLabelZpl({ sku: item.sku, name: item.name, barcode: item.barcode, lot }),
      };
    },
  );
}
