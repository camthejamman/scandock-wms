import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

test.describe('ERP synchronisation', () => {
  test(
    'status reports the ERP as reachable with outbox counters',
    { tag: ['@smoke', '@REQ-025'] },
    async ({ api }) => {
      const s = await api.getOk('/erp/status');
      expect(s).toMatchObject({ erpName: 'Nimbus ERP', reachable: true, error: null });
      expect(s.outbox).toEqual({
        pending: expect.any(Number),
        failed: expect.any(Number),
        sent: expect.any(Number),
      });
    },
  );

  test(
    'new ERP orders are pulled once; a second sync does not duplicate them',
    { tag: '@REQ-024' },
    async ({ api, erp, factory }) => {
      const item = await factory.item();
      const poNumber = uid('EPO');
      const soNumber = uid('ESO');
      expect(
        (
          await erp.post('/erp/purchase-orders', {
            poNumber,
            vendor: 'ERP Vendor',
            lines: [{ sku: item.sku, qty: 5 }],
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await erp.post('/erp/sales-orders', {
            soNumber,
            customer: 'ERP Customer',
            shipToCountry: 'CA',
            priority: 'RUSH',
            lines: [{ sku: item.sku, qty: 1 }],
          })
        ).status,
      ).toBe(201);

      // Another worker's sync may already have pulled these; what matters is that they arrive exactly once.
      await api.postOk('/erp/sync');

      const po = await api.getOk(`/purchase-orders/${poNumber}`);
      expect(po).toMatchObject({ vendor: 'ERP Vendor', status: 'OPEN' });
      expect(po.erpId).toMatch(/^NIMBUS-PO-/);
      expect(po.lines).toEqual([expect.objectContaining({ sku: item.sku, qtyOrdered: 5 })]);
      const so = await api.getOk(`/sales-orders/${soNumber}`);
      expect(so).toMatchObject({
        customer: 'ERP Customer',
        country: 'CA',
        priority: 'RUSH',
        status: 'OPEN',
      });

      await api.postOk('/erp/sync');
      expect((await api.getOk('/purchase-orders', { q: poNumber })).total).toBe(1);
      expect((await api.getOk('/sales-orders', { q: soNumber })).total).toBe(1);

      const log = await api.getOk('/erp/log', { limit: 200 });
      expect(
        log.data.some((l: any) => l.status === 'OK' && l.message.includes(`${poNumber} imported`)),
      ).toBe(true);
    },
  );

  test(
    'ERP orders with unknown SKUs are skipped with a reason, not imported half-way',
    { tag: '@REQ-024' },
    async ({ api, erp }) => {
      const soNumber = uid('BAD');
      await erp.post('/erp/sales-orders', {
        soNumber,
        customer: 'Ghost Goods',
        lines: [
          { sku: 'TOY-ROBOT-RED', qty: 1 },
          { sku: 'GHOST-SKU-1', qty: 2 },
        ],
      });
      const r = await api.postOk('/erp/sync');
      expect(r.pulled.skipped).toEqual(
        expect.arrayContaining([{ number: soNumber, reason: 'unknown SKU GHOST-SKU-1' }]),
      );
      expect((await api.get(`/sales-orders/${soNumber}`)).status).toBe(404);
      const log = await api.getOk('/erp/log', { status: 'SKIPPED', limit: 50 });
      expect(log.data.some((l: any) => l.message.startsWith(`${soNumber}:`))).toBe(true);
    },
  );

  test(
    'warehouse documents reach the ERP through the outbox',
    { tag: '@REQ-025' },
    async ({ api, erp, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 3 }]);
      const receipt = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 3, bin: bin.code }],
      });
      const ref = `${po.poNumber}/RCPT-${receipt.receiptId}`;

      const pushed = await api.postOk('/erp/sync');
      expect(pushed.pushed.failed).toBe(0);
      const row = (await api.getOk('/erp/outbox')).data.find((o: any) => o.reference === ref);
      expect(row).toMatchObject({ status: 'SENT', attempts: 1, lastError: null });
      expect(row.erpRef).toMatch(/^IR-\d+$/);

      const receipts = await erp.json<any[]>('/erp/item-receipts');
      const mine = receipts.find((d) => d.id === row.erpRef);
      expect(mine.payload).toMatchObject({
        poNumber: po.poNumber,
        receivedBy: 'admin',
        lines: [{ sku: item.sku, qty: 3, bin: bin.code, lot: '' }],
      });
    },
  );

  test(
    'the sync log and outbox endpoints are readable by every role',
    { tag: '@REQ-003' },
    async ({ apiAs }) => {
      const op = await apiAs('operator');
      expect((await op.get('/erp/log')).status).toBe(200);
      expect((await op.get('/erp/outbox')).status).toBe(200);
      expect((await op.get('/erp/log', { status: 'MAYBE' })).status).toBe(400);
    },
  );
});
