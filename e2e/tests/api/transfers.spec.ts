import { expect, test } from '../../support/fixtures';

test.describe('bin transfers', () => {
  test(
    'a transfer moves stock and leaves two ledger rows sharing one reference',
    { tag: ['@smoke', '@REQ-019', '@REQ-023'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const to = await factory.bin('PICKING');
      const r = await api.post('/transfers', {
        sku: item.barcode,
        fromBin: bin.code,
        toBin: to.code.toLowerCase(),
        qty: 4,
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        sku: item.sku,
        qty: 4,
        from: { bin: bin.code, qtyAfter: 6 },
        to: { bin: to.code, qtyAfter: 4 },
      });
      expect(r.body.reference).toMatch(/^TRF-\d+$/);

      const tx = await api.getOk('/transactions', { reference: r.body.reference });
      expect(tx.data.map((t: any) => [t.type, t.qtyDelta, t.bin]).sort()).toEqual([
        ['TRANSFER_IN', 4, to.code],
        ['TRANSFER_OUT', -4, bin.code],
      ]);
      const history = await api.getOk('/transfers', { limit: 200 });
      expect(history.data.find((t: any) => t.id === r.body.id)).toMatchObject({
        sku: item.sku,
        fromBin: bin.code,
        toBin: to.code,
        qty: 4,
        user: 'Ada Admin',
      });
    },
  );

  test('source and destination must differ', { tag: '@REQ-019' }, async ({ api, factory }) => {
    const { item, bin } = await factory.stockedItem(3);
    const r = await api.post('/transfers', {
      sku: item.sku,
      fromBin: bin.code,
      toBin: bin.code,
      qty: 1,
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('SAME_BIN');
  });

  test(
    'you cannot move more than the source holds, and nothing moves on failure',
    { tag: '@REQ-019' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(3);
      const to = await factory.bin();
      const r = await api.post('/transfers', {
        sku: item.sku,
        fromBin: bin.code,
        toBin: to.code,
        qty: 4,
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(3);
      expect((await api.getOk(`/inventory/bin/${to.code}`)).rows).toEqual([]);
    },
  );

  test(
    'unknown items or bins, inactive destinations and bad quantities are rejected',
    { tag: ['@REQ-019', '@REQ-032'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(3);
      const to = await factory.bin();
      expect(
        (await api.post('/transfers', { sku: 'NOPE', fromBin: bin.code, toBin: to.code, qty: 1 }))
          .body.error.code,
      ).toBe('ITEM_NOT_FOUND');
      expect(
        (await api.post('/transfers', { sku: item.sku, fromBin: 'NOPE-1', toBin: to.code, qty: 1 }))
          .body.error.code,
      ).toBe('BIN_NOT_FOUND');
      expect(
        (
          await api.post('/transfers', {
            sku: item.sku,
            fromBin: bin.code,
            toBin: 'NOPE-2',
            qty: 1,
          })
        ).body.error.code,
      ).toBe('BIN_NOT_FOUND');
      await api.patchOk(`/bins/${to.code}`, { active: false });
      expect(
        (await api.post('/transfers', { sku: item.sku, fromBin: bin.code, toBin: to.code, qty: 1 }))
          .body.error.code,
      ).toBe('BIN_INACTIVE');
      for (const qty of [0, -3, 2.5])
        expect(
          (
            await api.post('/transfers', {
              sku: item.sku,
              fromBin: bin.code,
              toBin: 'A-01-01',
              qty,
            })
          ).status,
        ).toBe(400);
    },
  );

  test('lot-tracked items move lot by lot', { tag: '@REQ-011' }, async ({ api, factory }) => {
    const { item, bin, lot } = await factory.stockedItem(5, { lotTracked: true });
    const to = await factory.bin();
    expect(
      (await api.post('/transfers', { sku: item.sku, fromBin: bin.code, toBin: to.code, qty: 1 }))
        .body.error.code,
    ).toBe('LOT_REQUIRED');
    const r = await api.postOk('/transfers', {
      sku: item.sku,
      fromBin: bin.code,
      toBin: to.code,
      qty: 2,
      lot,
    });
    expect(r.lot).toBe(lot);
    const dest = await api.getOk(`/inventory/bin/${to.code}`);
    expect(dest.rows).toEqual([expect.objectContaining({ sku: item.sku, lot, qtyOnHand: 2 })]);
  });
});
