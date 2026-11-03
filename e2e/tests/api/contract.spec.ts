import { z } from 'zod';
import { expect, test } from '../../support/fixtures';

/**
 * Contract tests: the shapes the web client (and any other consumer) depends on.
 * A failing schema here means a breaking API change.
 */
const errorEnvelope = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z_]+$/),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
const item = z.object({
  id: z.number().int(),
  sku: z.string(),
  barcode: z.string().regex(/^\d{12}$/),
  name: z.string(),
  uom: z.string(),
  unitCost: z.number(),
  weightLb: z.number().positive(),
  lotTracked: z.boolean(),
  reorderPoint: z.number().int(),
  active: z.boolean(),
});
const paged = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    data: z.array(row),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
const poDetail = z.object({
  poNumber: z.string(),
  vendor: z.string(),
  status: z.enum(['OPEN', 'PARTIAL', 'RECEIVED', 'CLOSED']),
  expectedDate: z.string().nullable(),
  lines: z.array(
    z.object({
      lineNo: z.number().int(),
      sku: z.string(),
      qtyOrdered: z.number().int(),
      qtyReceived: z.number().int(),
      qtyRemaining: z.number().int(),
      lotTracked: z.boolean(),
    }),
  ),
  receipts: z.array(
    z.object({
      id: z.number().int(),
      receivedAt: z.string(),
      lines: z.array(z.object({ sku: z.string(), qty: z.number().int(), bin: z.string() })),
    }),
  ),
});
const soDetail = z.object({
  soNumber: z.string(),
  customer: z.string(),
  country: z.string().length(2),
  priority: z.enum(['STANDARD', 'RUSH']),
  status: z.enum(['OPEN', 'PICKING', 'PICKED', 'SHIPPED', 'CANCELLED']),
  estimatedWeightLb: z.number().positive(),
  shippingSuggestion: z.object({ carrier: z.string(), service: z.string(), rule: z.string() }),
  lines: z.array(
    z.object({
      lineNo: z.number().int(),
      sku: z.string(),
      qtyOrdered: z.number().int(),
      qtyPicked: z.number().int(),
      qtyRemaining: z.number().int(),
      available: z.number().int(),
      suggestions: z.array(
        z.object({
          bin: z.string(),
          zone: z.string(),
          lot: z.string(),
          qtyOnHand: z.number().int(),
        }),
      ),
    }),
  ),
  picks: z.array(z.object({ lineNo: z.number().int(), bin: z.string(), qty: z.number().int() })),
});
const dashboard = z.object({
  openPurchaseOrders: z.number().int(),
  ordersToPick: z.number().int(),
  ordersToShip: z.number().int(),
  unitsOnHand: z.number().int(),
  lowStockItems: z.number().int(),
  inventoryAccuracyPct: z.number().nullable(),
  erpReachable: z.boolean(),
  generatedAt: z.string().datetime(),
});
const countDetail = z.object({
  id: z.number().int(),
  bin: z.string(),
  status: z.enum(['OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED']),
  blind: z.boolean(),
  lines: z.array(
    z.object({
      sku: z.string(),
      lot: z.string(),
      expectedQty: z.number().int().nullable(),
      countedQty: z.number().int().nullable(),
      variance: z.number().int().nullable(),
    }),
  ),
  summary: z
    .object({
      lines: z.number().int(),
      linesWithVariance: z.number().int(),
      netVariance: z.number().int(),
      absVariance: z.number().int(),
      accuracyPct: z.number().nullable(),
    })
    .nullable(),
});

function expectValid<T extends z.ZodTypeAny>(schema: T, value: unknown, what: string) {
  const r = schema.safeParse(value);
  expect(r.success, `${what}: ${r.success ? '' : JSON.stringify(r.error.issues, null, 1)}`).toBe(
    true,
  );
}

test.describe('API contracts', () => {
  test('item, list and error envelopes', { tag: '@REQ-032' }, async ({ api }) => {
    expectValid(item, await api.getOk('/items/TOY-ROBOT-RED'), 'GET /items/:key');
    expectValid(
      paged(item.extend({ qtyOnHand: z.number().int(), lowStock: z.boolean() })),
      await api.getOk('/items', { pageSize: 10 }),
      'GET /items',
    );
    expectValid(errorEnvelope, (await api.get('/items/NOPE')).body, '404 envelope');
    expectValid(errorEnvelope, (await api.post('/items', {})).body, '400 envelope');
    expectValid(
      errorEnvelope,
      await (await api.ctx.get('/api/items', { headers: { authorization: 'Bearer nope' } })).json(),
      '401 envelope',
    );
  });

  test(
    'purchase order, sales order, cycle count and dashboard shapes',
    { tag: '@REQ-032' },
    async ({ api }) => {
      expectValid(
        poDetail,
        await api.getOk('/purchase-orders/PO-1003'),
        'GET /purchase-orders/:po',
      );
      expectValid(soDetail, await api.getOk('/sales-orders/SO-5004'), 'GET /sales-orders/:so');
      expectValid(countDetail, await api.getOk('/cycle-counts/1'), 'GET /cycle-counts/:id');
      expectValid(dashboard, await api.getOk('/reports/dashboard'), 'GET /reports/dashboard');
    },
  );

  test(
    'every error response uses the envelope with a matching HTTP status',
    { tag: '@REQ-032' },
    async ({ api, apiAs }) => {
      const op = await apiAs('operator');
      const samples: Array<[number, Promise<{ status: number; body: unknown }>]> = [
        [400, api.post('/bins', { code: '', zone: 'STORAGE' })],
        [403, op.get('/users')],
        [404, api.get('/sales-orders/NOPE')],
        [409, api.post('/bins', { code: 'A-01-01', zone: 'STORAGE' })],
      ];
      for (const [status, p] of samples) {
        const r = await p;
        expect(r.status).toBe(status);
        expectValid(errorEnvelope, r.body, `status ${status}`);
      }
    },
  );
});
