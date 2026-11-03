import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

function upcCheckDigit(body: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    if (i % 2 === 0) odd += Number(body[i]);
    else even += Number(body[i]);
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

test.describe('items', () => {
  test(
    'list returns a paged envelope with sensible defaults',
    { tag: ['@smoke', '@REQ-030'] },
    async ({ api }) => {
      const r = await api.get('/items');
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ page: 1, pageSize: 50 });
      expect(r.body.total).toBeGreaterThanOrEqual(41);
      expect(Array.isArray(r.body.data)).toBe(true);
      expect(r.body.data[0]).toEqual(
        expect.objectContaining({
          sku: expect.any(String),
          barcode: expect.stringMatching(/^\d{12}$/),
          qtyOnHand: expect.any(Number),
          lowStock: expect.any(Boolean),
        }),
      );
    },
  );

  test(
    'search matches SKU or name fragments and exact barcodes',
    { tag: '@REQ-004' },
    async ({ api }) => {
      const bySku = await api.getOk('/items', { q: 'robot' });
      expect(bySku.data.map((i: any) => i.sku)).toEqual(
        expect.arrayContaining(['TOY-ROBOT-RED', 'TOY-ROBOT-BLU']),
      );

      const byName = await api.getOk('/items', { q: 'Puzzle' });
      expect(byName.data.length).toBeGreaterThanOrEqual(2);
      for (const i of byName.data) expect(`${i.sku} ${i.name}`.toLowerCase()).toContain('puzzle');

      const robot = await api.getOk('/items/TOY-ROBOT-RED');
      const byBarcode = await api.getOk('/items', { q: robot.barcode });
      expect(byBarcode.data.map((i: any) => i.sku)).toEqual(['TOY-ROBOT-RED']);
    },
  );

  test(
    'pagination: page 2 continues where page 1 stopped, pageSize is capped',
    { tag: '@REQ-030' },
    async ({ api }) => {
      const p1 = await api.getOk('/items', { pageSize: 5, page: 1 });
      const p2 = await api.getOk('/items', { pageSize: 5, page: 2 });
      expect(p1.data).toHaveLength(5);
      expect(p2.data).toHaveLength(5);
      expect(new Set([...p1.data, ...p2.data].map((i: any) => i.sku)).size).toBe(10);
      expect(p1.data[4].sku < p2.data[0].sku).toBe(true);

      expect((await api.get('/items', { pageSize: 999 })).status).toBe(400);
      expect((await api.get('/items', { page: 0 })).status).toBe(400);
      expect((await api.get('/items', { page: 'abc' })).status).toBe(400);
    },
  );

  test(
    'lowStock filter returns only items at or below their reorder point',
    { tag: '@REQ-008' },
    async ({ api }) => {
      const r = await api.getOk('/items', { lowStock: 'true', active: 'true' });
      expect(r.data.length).toBeGreaterThan(0);
      for (const i of r.data) {
        expect(i.qtyOnHand, `${i.sku}`).toBeLessThanOrEqual(i.reorderPoint);
        expect(i.lowStock).toBe(true);
      }
      expect(r.data.map((i: any) => i.sku)).toEqual(
        expect.arrayContaining(['KITE-DELTA', 'YOYO-PRO']),
      );
    },
  );

  test(
    'an item can be fetched by SKU (any case) or by barcode',
    { tag: '@REQ-004' },
    async ({ api }) => {
      const bySku = await api.getOk('/items/toy-robot-red');
      const byBarcode = await api.getOk(`/items/${bySku.barcode}`);
      expect(byBarcode.id).toBe(bySku.id);
      expect(bySku).toMatchObject({ sku: 'TOY-ROBOT-RED', uom: 'EA', lotTracked: false });
      expect(Array.isArray(bySku.stock)).toBe(true);
      expect(bySku.qtyOnHand).toBe(bySku.stock.reduce((s: number, r: any) => s + r.qtyOnHand, 0));
    },
  );

  test('unknown items are a 404 with ITEM_NOT_FOUND', { tag: '@REQ-032' }, async ({ api }) => {
    const r = await api.get('/items/NOT-A-SKU');
    expect(r.status).toBe(404);
    expect(r.body.error).toMatchObject({
      code: 'ITEM_NOT_FOUND',
      message: expect.stringContaining('NOT-A-SKU'),
    });
  });

  test(
    'creating an item generates a valid UPC-A barcode and upper-cases the SKU',
    { tag: ['@REQ-004', '@REQ-005'] },
    async ({ api }) => {
      const sku = uid('new').toLowerCase();
      const r = await api.post('/items', {
        sku,
        name: 'Created in test',
        weightLb: 2.5,
        reorderPoint: 3,
      });
      expect(r.status).toBe(201);
      expect(r.body.sku).toBe(sku.toUpperCase());
      expect(r.body.barcode).toMatch(/^\d{12}$/);
      expect(Number(r.body.barcode[11])).toBe(upcCheckDigit(r.body.barcode.slice(0, 11)));
      expect(r.body).toMatchObject({
        uom: 'EA',
        category: 'General',
        active: true,
        lotTracked: false,
        weightLb: 2.5,
        reorderPoint: 3,
      });
    },
  );

  test('duplicate SKUs are rejected with 409', { tag: '@REQ-005' }, async ({ api, factory }) => {
    const item = await factory.item();
    const r = await api.post('/items', { sku: item.sku.toLowerCase(), name: 'dupe' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DUPLICATE_SKU');
  });

  test('a 12-digit barcode must have a valid check digit', { tag: '@REQ-004' }, async ({ api }) => {
    const bad = await api.post('/items', {
      sku: uid('BC'),
      name: 'bad barcode',
      barcode: '036000291453',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(bad.body.error.details)).toContain('check digit');

    const good = await api.post('/items', {
      sku: uid('BC'),
      name: 'good barcode',
      barcode: '036000291452',
    });
    expect([201, 409]).toContain(good.status); // 409 only if an earlier run already used this textbook barcode
  });

  test('a barcode cannot belong to two items', { tag: '@REQ-004' }, async ({ api, factory }) => {
    const a = await factory.item();
    const r = await api.post('/items', { sku: uid('BC'), name: 'copycat', barcode: a.barcode });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DUPLICATE_BARCODE');
  });

  test('validation errors list every bad field', { tag: '@REQ-032' }, async ({ api }) => {
    const r = await api.post('/items', { sku: 'x', name: '', weightLb: -1, reorderPoint: 1.5 });
    expect(r.status).toBe(400);
    const paths = r.body.error.details.map((d: any) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['sku', 'name', 'weightLb', 'reorderPoint']));
  });

  test(
    'items can be edited and deactivated; unknown and empty patches are rejected',
    { tag: '@REQ-005' },
    async ({ api, factory }) => {
      const item = await factory.item({ reorderPoint: 1 });
      const edited = await api.patch(`/items/${item.sku}`, {
        reorderPoint: 12,
        name: 'Renamed',
        lotTracked: true,
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ reorderPoint: 12, name: 'Renamed', lotTracked: true });

      const off = await api.patchOk(`/items/${item.sku}`, { active: false });
      expect(off.active).toBe(false);
      const listed = await api.getOk('/items', { q: item.sku, active: 'true' });
      expect(listed.data).toHaveLength(0);

      expect((await api.patch(`/items/${item.sku}`, { bogus: 1 })).status).toBe(400);
      expect((await api.patch(`/items/${item.sku}`, {})).status).toBe(400);
      expect((await api.patch('/items/NOPE', { name: 'x' })).status).toBe(404);
    },
  );

  test(
    'categories endpoint aggregates counts per category',
    { tag: '@REQ-030' },
    async ({ api }) => {
      const r = await api.getOk('/items/categories');
      const puzzles = r.data.find((c: any) => c.category === 'Puzzles');
      expect(puzzles.n).toBeGreaterThanOrEqual(2);
      const total = r.data.reduce((s: number, c: any) => s + c.n, 0);
      expect(total).toBeGreaterThanOrEqual(41); // at least the seed catalogue
      for (const c of r.data) expect(c.n).toBeGreaterThan(0);
    },
  );
});
