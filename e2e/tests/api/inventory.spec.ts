import { expect, test } from '../../support/fixtures';

test.describe('inventory', () => {
  test(
    'rows are filterable by sku, bin, zone and never show zero quantities',
    { tag: ['@smoke', '@REQ-007'] },
    async ({ api }) => {
      const all = await api.getOk('/inventory', { pageSize: 200 });
      expect(all.total).toBeGreaterThan(50);
      for (const r of all.data) expect(r.qtyOnHand).not.toBe(0);

      const bySku = await api.getOk('/inventory', { sku: 'toy-robot-red' });
      for (const r of bySku.data) expect(r.sku).toBe('TOY-ROBOT-RED');
      expect(bySku.data.length).toBeGreaterThanOrEqual(2);

      const byBin = await api.getOk('/inventory', { bin: 'p-01-01' });
      for (const r of byBin.data) expect(r.bin).toBe('P-01-01');

      const byZone = await api.getOk('/inventory', { zone: 'PICKING', pageSize: 200 });
      for (const r of byZone.data) expect(r.zone).toBe('PICKING');
    },
  );

  test(
    'lowStock filter only shows items at or below reorder point',
    { tag: '@REQ-008' },
    async ({ api }) => {
      const r = await api.getOk('/inventory', { lowStock: 'true' });
      expect(r.data.length).toBeGreaterThan(0);
      for (const row of r.data) {
        expect(row.lowStock).toBe(true);
        expect(row.itemQtyOnHand).toBeLessThanOrEqual(row.reorderPoint);
      }
    },
  );

  test(
    'item inquiry works by SKU and barcode and totals its rows',
    { tag: '@REQ-007' },
    async ({ api }) => {
      const bySku = await api.getOk('/inventory/item/BATT-AA-24PK');
      expect(bySku.item.lotTracked).toBe(true);
      expect(bySku.rows.every((r: any) => r.lot.startsWith('LOT-'))).toBe(true);
      expect(bySku.qtyOnHand).toBe(bySku.rows.reduce((s: number, r: any) => s + r.qtyOnHand, 0));
      const byBarcode = await api.getOk(`/inventory/item/${bySku.item.barcode}`);
      expect(byBarcode.item.id).toBe(bySku.item.id);
      // picking bins come first so the handheld shows the forward-pick location on top
      expect(bySku.rows[0].zone).toBe('PICKING');
    },
  );

  test(
    'bin inquiry lists what is in a bin; unknown codes are 404',
    { tag: '@REQ-007' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(7);
      const r = await api.getOk(`/inventory/bin/${bin.code.toLowerCase()}`);
      expect(r.bin.code).toBe(bin.code);
      expect(r.rows).toEqual([expect.objectContaining({ sku: item.sku, qtyOnHand: 7 })]);
      expect(r.unitsOnHand).toBe(7);
      expect((await api.get('/inventory/bin/NOPE-1')).status).toBe(404);
      expect((await api.get('/inventory/item/NOPE-1')).status).toBe(404);
    },
  );

  test(
    'the ledger invariant holds: on-hand equals the sum of transactions everywhere',
    { tag: '@REQ-023' },
    async ({ api }) => {
      const r = await api.getOk('/inventory/invariants');
      expect(r.mismatches).toEqual([]);
      expect(r.negatives).toEqual([]);
      expect(r.ok).toBe(true);
    },
  );
});
