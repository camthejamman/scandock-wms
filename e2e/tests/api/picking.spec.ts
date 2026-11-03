import { expect, test } from '../../support/fixtures';

test.describe('picking sales orders', () => {
  test(
    'order detail suggests forward-pick bins first and estimates the shipment',
    { tag: ['@smoke', '@REQ-014'] },
    async ({ api, factory }) => {
      const item = await factory.item({ weightLb: 2 });
      const storage = await factory.bin('STORAGE');
      const picking = await factory.bin('PICKING');
      await factory.stock(item.sku, storage.code, 20);
      await factory.stock(item.sku, picking.code, 5);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 3 }]);

      const d = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(d.status).toBe('OPEN');
      expect(d.lines[0]).toMatchObject({
        lineNo: 1,
        sku: item.sku,
        qtyOrdered: 3,
        qtyPicked: 0,
        qtyRemaining: 3,
        available: 25,
      });
      expect(d.lines[0].suggestions.map((s: any) => s.bin)).toEqual([picking.code, storage.code]);
      expect(d.estimatedWeightLb).toBe(6);
      expect(d.shippingSuggestion).toEqual({
        carrier: 'UPS',
        service: 'Ground',
        rule: 'PARCEL_UP_TO_70LB',
      });
    },
  );

  test(
    'a pick decrements the bin, writes a PICK ledger row and moves the order to PICKING',
    { tag: ['@REQ-015', '@REQ-023'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 4 }]);
      const r = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 3,
        sku: item.barcode,
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        status: 'PICKING',
        bin: bin.code,
        binQtyAfter: 7,
        allLinesPicked: false,
      });
      expect(r.body.line).toMatchObject({
        lineNo: 1,
        qtyOrdered: 4,
        qtyPicked: 3,
        qtyRemaining: 1,
      });

      const inv = await api.getOk(`/inventory/bin/${bin.code}`);
      expect(inv.rows[0].qtyOnHand).toBe(7);
      const tx = await api.getOk('/transactions', { sku: item.sku, type: 'PICK' });
      expect(tx.data[0]).toMatchObject({ qtyDelta: -3, qtyAfter: 7, reference: so.soNumber });

      const rest = await api.postOk(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
      });
      expect(rest.allLinesPicked).toBe(true);
      const detail = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(detail.picks).toHaveLength(2);
      expect(detail.picks.map((p: any) => p.qty)).toEqual([3, 1]);
    },
  );

  test(
    'picking more than the line needs is refused',
    { tag: '@REQ-015' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      const r = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 3,
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('OVER_PICK');
      expect(r.body.error.details).toMatchObject({ qtyRemaining: 2, requested: 3 });
    },
  );

  test(
    'picking more than the bin holds is refused and nothing moves',
    { tag: '@REQ-015' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 5 }]);
      const r = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 5,
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(r.body.error.details).toMatchObject({ available: 2, requested: 5 });
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(2);
      expect((await api.getOk(`/sales-orders/${so.soNumber}`)).status).toBe('OPEN');
    },
  );

  test(
    'scanning the wrong item for a line is caught before stock moves',
    { tag: '@REQ-015' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const r = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
        sku: 'TOY-ROBOT-RED',
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('WRONG_ITEM');
      expect(r.body.error.details).toEqual({ expected: item.sku, scanned: 'TOY-ROBOT-RED' });
      const unknown = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
        sku: 'NOPE-NOPE',
      });
      expect(unknown.status).toBe(404);
    },
  );

  test('lot-tracked lines need the right lot', { tag: '@REQ-011' }, async ({ api, factory }) => {
    const { item, bin, lot } = await factory.stockedItem(6, { lotTracked: true });
    const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
    const noLot = await api.post(`/sales-orders/${so.soNumber}/picks`, {
      lineNo: 1,
      bin: bin.code,
      qty: 2,
    });
    expect(noLot.status).toBe(400);
    expect(noLot.body.error.code).toBe('LOT_REQUIRED');
    const wrongLot = await api.post(`/sales-orders/${so.soNumber}/picks`, {
      lineNo: 1,
      bin: bin.code,
      qty: 2,
      lot: 'LOT-NOPE',
    });
    expect(wrongLot.status).toBe(409);
    expect(wrongLot.body.error.code).toBe('INSUFFICIENT_STOCK');
    const ok = await api.post(`/sales-orders/${so.soNumber}/picks`, {
      lineNo: 1,
      bin: bin.code,
      qty: 2,
      lot,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.lot).toBe(lot);
  });

  test(
    'picks cannot come from SHIPPING or QUARANTINE bins, and the line must exist',
    { tag: '@REQ-015' },
    async ({ api, factory }) => {
      const { item } = await factory.stockedItem(5);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const ship = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: 'SHIP-01',
        qty: 1,
      });
      expect(ship.body.error.code).toBe('INVALID_BIN_ZONE');
      const qa = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: 'QA-01',
        qty: 1,
      });
      expect(qa.body.error.code).toBe('INVALID_BIN_ZONE');
      const noLine = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 9,
        bin: 'P-01-01',
        qty: 1,
      });
      expect(noLine.status).toBe(404);
      expect(noLine.body.error.code).toBe('LINE_NOT_FOUND');
      expect(
        (await api.post('/sales-orders/SO-NOPE/picks', { lineNo: 1, bin: 'P-01-01', qty: 1 }))
          .status,
      ).toBe(404);
    },
  );

  test(
    'completing a fully picked order marks it PICKED and records who picked it',
    { tag: '@REQ-016' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      const early = await api.post(`/sales-orders/${so.soNumber}/complete-pick`);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('SO_NOT_PICKING');

      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 2 });
      const done = await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
      expect(done).toMatchObject({ status: 'PICKED', short: false, shortLines: [] });
      const detail = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(detail.pickedBy).toBe('Ada Admin');
      expect(detail.pickedAt).toBeTruthy();

      const late = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
      });
      expect(late.status).toBe(409);
      expect(late.body.error.code).toBe('SO_NOT_PICKABLE');
    },
  );

  test(
    'a short pick needs a reason and keeps the short lines on record',
    { tag: '@REQ-016' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(1);
      const so = await factory.salesOrder([
        { sku: item.sku, qty: 3 },
        { sku: 'GIFT-BAG-ASST', qty: 1 },
      ]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 });

      const noReason = await api.post(`/sales-orders/${so.soNumber}/complete-pick`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.error.code).toBe('SHORT_REASON_REQUIRED');
      expect(noReason.body.error.details.shortLines).toHaveLength(2);

      const done = await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`, {
        shortReason: 'Stock not found in bin',
      });
      expect(done.short).toBe(true);
      expect(done.shortLines).toEqual([
        expect.objectContaining({ lineNo: 1, qtyOrdered: 3, qtyPicked: 1 }),
        expect.objectContaining({ lineNo: 2, qtyOrdered: 1, qtyPicked: 0 }),
      ]);
      expect((await api.getOk(`/sales-orders/${so.soNumber}`)).shortReason).toBe(
        'Stock not found in bin',
      );
    },
  );

  test(
    'orders can be cancelled only while OPEN',
    { tag: '@REQ-035' },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const open = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const cancelled = await api.postOk(`/sales-orders/${open.soNumber}/cancel`);
      expect(cancelled.status).toBe('CANCELLED');
      expect(
        (
          await api.post(`/sales-orders/${open.soNumber}/picks`, {
            lineNo: 1,
            bin: bin.code,
            qty: 1,
          })
        ).body.error.code,
      ).toBe('SO_NOT_PICKABLE');

      const picking = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      await api.postOk(`/sales-orders/${picking.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
      });
      const blocked = await api.post(`/sales-orders/${picking.soNumber}/cancel`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('SO_NOT_CANCELLABLE');
      expect(
        (await (await apiAs('operator')).post(`/sales-orders/${picking.soNumber}/cancel`)).status,
      ).toBe(403);
    },
  );

  test('sales order creation validates its input', { tag: '@REQ-032' }, async ({ api }) => {
    expect(
      (await api.post('/sales-orders', { customer: 'c', lines: [{ sku: 'NOPE', qty: 1 }] })).body
        .error.code,
    ).toBe('UNKNOWN_SKU');
    expect(
      (
        await api.post('/sales-orders', {
          customer: 'c',
          country: 'USA',
          lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api.post('/sales-orders', {
          customer: 'c',
          priority: 'URGENT',
          lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await api.post('/sales-orders', { customer: '', lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }] }))
        .status,
    ).toBe(400);
    const ok = await api.post('/sales-orders', {
      customer: 'Auto',
      country: 'ca',
      lines: [{ sku: 'toy-robot-red', qty: 1 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ country: 'CA', priority: 'STANDARD', status: 'OPEN' });
    expect(ok.body.soNumber).toMatch(/^SO-\d{4,}$/);
  });

  test(
    'list filters: pickable, shippable, status, search',
    { tag: '@REQ-030' },
    async ({ api, factory }) => {
      const customer = `Customer ${Date.now()}`;
      const so = await factory.salesOrder([{ sku: 'GIFT-BAG-ASST', qty: 1 }], {
        customer,
        priority: 'RUSH',
      });
      const pickable = await api.getOk('/sales-orders', { pickable: 'true', pageSize: 200 });
      for (const row of pickable.data) expect(['OPEN', 'PICKING']).toContain(row.status);
      expect(pickable.data.map((s: any) => s.soNumber)).toContain(so.soNumber);

      const shippable = await api.getOk('/sales-orders', { shippable: 'true', pageSize: 200 });
      for (const row of shippable.data) expect(row.status).toBe('PICKED');

      const search = await api.getOk('/sales-orders', { q: customer });
      expect(search.data).toEqual([
        expect.objectContaining({
          soNumber: so.soNumber,
          priority: 'RUSH',
          lineCount: 1,
          qtyOrdered: 1,
          qtyPicked: 0,
        }),
      ]);

      const shipped = await api.getOk('/sales-orders', { status: 'SHIPPED' });
      expect(shipped.data.map((s: any) => s.soNumber)).toContain('SO-5006');
    },
  );

  test(
    'two pickers racing for the last unit: exactly one wins',
    { tag: '@REQ-034' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(1);
      const a = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const b = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const [ra, rb] = await Promise.all([
        api.post(`/sales-orders/${a.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 }),
        api.post(`/sales-orders/${b.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 }),
      ]);
      const statuses = [ra.status, rb.status].sort();
      expect(statuses).toEqual([201, 409]);
      const loser = ra.status === 409 ? ra : rb;
      expect(loser.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows).toEqual([]);
      expect((await api.getOk('/inventory/invariants')).ok).toBe(true);
    },
  );
});
