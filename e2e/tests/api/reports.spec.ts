import { expect, test } from '../../support/fixtures';

test.describe('dashboard and transactions', () => {
  test(
    'dashboard KPIs agree with the underlying lists',
    { tag: ['@smoke', '@REQ-026'] },
    async ({ api }) => {
      const d = await api.getOk('/reports/dashboard');
      for (const key of [
        'openPurchaseOrders',
        'ordersToPick',
        'ordersToShip',
        'shippedToday',
        'openCounts',
        'countsPendingApproval',
        'unitsOnHand',
        'skusInStock',
        'lowStockItems',
        'transactionsToday',
        'erpOutboxPending',
        'countedLines30d',
      ]) {
        expect(typeof d[key], key).toBe('number');
      }
      expect(d.erpReachable).toBe(true);
      expect(
        d.inventoryAccuracyPct === null ||
          (d.inventoryAccuracyPct >= 0 && d.inventoryAccuracyPct <= 100),
      ).toBe(true);

      const toShip = await api.getOk('/sales-orders', { shippable: 'true', pageSize: 1 });
      const d2 = await api.getOk('/reports/dashboard');
      // other workers may create orders between calls; the KPI must be within the two observations
      expect(Math.abs(d2.ordersToShip - toShip.total)).toBeLessThanOrEqual(2);
    },
  );

  test('units on hand equals the inventory total', { tag: '@REQ-026' }, async ({ api }) => {
    const inv = await api.getOk('/inventory', { pageSize: 200, page: 1 });
    let total = 0;
    const pages = Math.ceil(inv.total / 200);
    for (let p = 1; p <= pages; p++) {
      const page = p === 1 ? inv : await api.getOk('/inventory', { pageSize: 200, page: p });
      total += page.data.reduce((s: number, r: any) => s + r.qtyOnHand, 0);
    }
    const d = await api.getOk('/reports/dashboard');
    expect(Math.abs(d.unitsOnHand - total)).toBeLessThanOrEqual(50); // parallel tests move stock while we sum
  });

  test(
    'transactions can be filtered by type, sku, bin and reference, newest first',
    { tag: '@REQ-023' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(6);
      const to = await factory.bin();
      const trf = await api.postOk('/transfers', {
        sku: item.sku,
        fromBin: bin.code,
        toBin: to.code,
        qty: 2,
      });

      const bySku = await api.getOk('/transactions', { sku: item.sku });
      expect(bySku.data.map((t: any) => t.type)).toEqual([
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'RECEIPT',
      ]);
      const byType = await api.getOk('/transactions', { type: 'TRANSFER_OUT', sku: item.sku });
      expect(byType.data).toHaveLength(1);
      expect(byType.data[0].bin).toBe(bin.code);
      const byBin = await api.getOk('/transactions', { bin: to.code });
      expect(byBin.data).toEqual([
        expect.objectContaining({ type: 'TRANSFER_IN', reference: trf.reference }),
      ]);
      expect((await api.get('/transactions', { type: 'TELEPORT' })).status).toBe(400);
      expect((await api.get('/transactions', { limit: 5000 })).status).toBe(400);
      const limited = await api.getOk('/transactions', { limit: 3 });
      expect(limited.data).toHaveLength(3);
      expect(limited.data[0].id).toBeGreaterThan(limited.data[2].id);
    },
  );
});
