import { expect, test } from '../../support/fixtures';

test.describe('shipping rules', () => {
  const cases: Array<{
    weightLb: number;
    country?: string;
    priority?: string;
    carrier: string;
    service: string;
  }> = [
    { weightLb: 0.5, carrier: 'USPS', service: 'Ground Advantage' },
    { weightLb: 1, carrier: 'USPS', service: 'Ground Advantage' },
    { weightLb: 1.01, carrier: 'UPS', service: 'Ground' },
    { weightLb: 70, carrier: 'UPS', service: 'Ground' },
    { weightLb: 70.01, carrier: 'FedEx', service: 'Ground (Heavy)' },
    { weightLb: 150, carrier: 'FedEx', service: 'Ground (Heavy)' },
    { weightLb: 150.01, carrier: 'Estes', service: 'LTL Freight' },
    { weightLb: 3, priority: 'RUSH', carrier: 'UPS', service: 'Next Day Air' },
    { weightLb: 200, priority: 'RUSH', carrier: 'Estes', service: 'LTL Freight' },
    { weightLb: 3, country: 'CA', carrier: 'DHL', service: 'Express Worldwide' },
    {
      weightLb: 0.2,
      country: 'gb',
      priority: 'RUSH',
      carrier: 'DHL',
      service: 'Express Worldwide',
    },
  ];
  for (const c of cases) {
    test(
      `${c.weightLb} lb ${c.country ?? 'US'} ${c.priority ?? 'STANDARD'} -> ${c.carrier} ${c.service}`,
      { tag: '@REQ-017' },
      async ({ api }) => {
        const r = await api.getOk('/shipping/suggest', {
          weightLb: c.weightLb,
          country: c.country ?? 'US',
          priority: c.priority ?? 'STANDARD',
        });
        expect(r).toMatchObject({ carrier: c.carrier, service: c.service });
      },
    );
  }

  test('weight must be positive', { tag: '@REQ-017' }, async ({ api }) => {
    expect((await api.get('/shipping/suggest', { weightLb: 0 })).status).toBe(400);
    expect((await api.get('/shipping/suggest', { weightLb: -2 })).status).toBe(400);
    expect((await api.get('/shipping/suggest', { weightLb: 'heavy' })).status).toBe(400);
  });
});

test.describe('shipping orders', () => {
  test(
    'a picked order ships with the suggested carrier, a tracking number and an ERP fulfillment',
    { tag: ['@smoke', '@REQ-018', '@REQ-025'] },
    async ({ api, erp, factory }) => {
      const { item, bin } = await factory.stockedItem(5, { weightLb: 2 });
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 2 });
      await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);

      const r = await api.post(`/sales-orders/${so.soNumber}/ship`);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        status: 'SHIPPED',
        carrier: 'UPS',
        service: 'Ground',
        weightLb: 4,
        erpQueued: true,
      });
      expect(r.body.trackingNumber).toMatch(/^1Z[A-Z0-9]{16}$/);

      const detail = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(detail).toMatchObject({
        status: 'SHIPPED',
        carrier: 'UPS',
        trackingNumber: r.body.trackingNumber,
        shippedBy: 'Ada Admin',
      });

      await api.postOk('/erp/sync');
      const outbox = await api.getOk('/erp/outbox');
      const doc = outbox.data.find(
        (o: any) => o.reference === so.soNumber && o.kind === 'item-fulfillment',
      );
      expect(doc).toMatchObject({ status: 'SENT' });
      expect(doc.erpRef).toMatch(/^IF-/);
      const fulfillments = await erp.json<any[]>('/erp/item-fulfillments');
      const mine = fulfillments.find((f) => f.payload.soNumber === so.soNumber);
      expect(mine.payload).toMatchObject({
        carrier: 'UPS',
        trackingNumber: r.body.trackingNumber,
        lines: [{ sku: item.sku, qty: 2 }],
      });
      expect(await erp.json<any>(`/erp/sales-orders/${so.soNumber}`).catch(() => null)).toBeNull(); // manual order: the ERP never had it
    },
  );

  test(
    'an explicit carrier and tracking number are kept as entered',
    { tag: '@REQ-018' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 });
      await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
      const r = await api.postOk(`/sales-orders/${so.soNumber}/ship`, {
        carrier: 'FedEx',
        service: 'Priority Overnight',
        trackingNumber: '794644790000',
        weightLb: 1.5,
      });
      expect(r).toMatchObject({
        carrier: 'FedEx',
        service: 'Priority Overnight',
        trackingNumber: '794644790000',
        weightLb: 1.5,
      });
      expect(r.suggestion.carrier).toBe('UPS');
    },
  );

  test(
    'international and rush orders get the matching carriers by default',
    { tag: '@REQ-017' },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const intl = await factory.salesOrder([{ sku: item.sku, qty: 1 }], { country: 'CA' });
      await api.postOk(`/sales-orders/${intl.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
      });
      await api.postOk(`/sales-orders/${intl.soNumber}/complete-pick`);
      expect(await api.postOk(`/sales-orders/${intl.soNumber}/ship`)).toMatchObject({
        carrier: 'DHL',
        service: 'Express Worldwide',
      });

      const rush = await factory.salesOrder([{ sku: item.sku, qty: 1 }], { priority: 'RUSH' });
      await api.postOk(`/sales-orders/${rush.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 1,
      });
      await api.postOk(`/sales-orders/${rush.soNumber}/complete-pick`);
      expect(await api.postOk(`/sales-orders/${rush.soNumber}/ship`)).toMatchObject({
        carrier: 'UPS',
        service: 'Next Day Air',
      });
    },
  );

  test('heavy orders go freight', { tag: '@REQ-017' }, async ({ api, factory }) => {
    const { item, bin } = await factory.stockedItem(2, { weightLb: 120 });
    const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
    expect((await api.getOk(`/sales-orders/${so.soNumber}`)).shippingSuggestion.carrier).toBe(
      'Estes',
    );
    await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 2 });
    await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
    const r = await api.postOk(`/sales-orders/${so.soNumber}/ship`);
    expect(r.carrier).toBe('Estes');
    expect(r.trackingNumber).toMatch(/^PRO\d{9}$/);
  });

  test('only PICKED orders ship, and only once', { tag: '@REQ-018' }, async ({ api, factory }) => {
    const { item, bin } = await factory.stockedItem(5);
    const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
    const open = await api.post(`/sales-orders/${so.soNumber}/ship`);
    expect(open.status).toBe(409);
    expect(open.body.error.code).toBe('SO_NOT_PICKED');
    await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 });
    expect((await api.post(`/sales-orders/${so.soNumber}/ship`)).body.error.code).toBe(
      'SO_NOT_PICKED',
    );
    await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
    expect((await api.post(`/sales-orders/${so.soNumber}/ship`, { weightLb: 0 })).status).toBe(400);
    await api.postOk(`/sales-orders/${so.soNumber}/ship`);
    const twice = await api.post(`/sales-orders/${so.soNumber}/ship`);
    expect(twice.status).toBe(409);
  });
});
