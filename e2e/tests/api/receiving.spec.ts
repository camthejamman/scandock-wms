import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';

test.describe('receiving against purchase orders', () => {
  test(
    'receiving a full line marks the PO RECEIVED, adds stock, writes the ledger and queues the ERP receipt',
    { tag: ['@smoke', '@REQ-009', '@REQ-023', '@REQ-025'] },
    async ({ api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin('STORAGE');
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 10 }]);

      const r = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 10, bin: bin.code }],
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        poNumber: po.poNumber,
        poStatus: 'RECEIVED',
        erpQueued: true,
      });
      expect(r.body.lines[0]).toMatchObject({
        lineNo: 1,
        sku: item.sku,
        qty: 10,
        bin: bin.code,
        qtyReceived: 10,
        qtyRemaining: 0,
      });

      const inv = await api.getOk(`/inventory/bin/${bin.code}`);
      expect(inv.rows).toEqual([expect.objectContaining({ sku: item.sku, qtyOnHand: 10 })]);

      const tx = await api.getOk('/transactions', { sku: item.sku, type: 'RECEIPT' });
      expect(tx.data).toEqual([
        expect.objectContaining({
          bin: bin.code,
          qtyDelta: 10,
          qtyAfter: 10,
          reference: po.poNumber,
          user: 'Ada Admin',
        }),
      ]);

      const outbox = await api.getOk('/erp/outbox');
      const doc = outbox.data.find(
        (o: any) => o.reference === `${po.poNumber}/RCPT-${r.body.receiptId}`,
      );
      expect(doc).toMatchObject({ kind: 'item-receipt' });
      expect(['PENDING', 'SENT']).toContain(doc.status);

      const detail = await api.getOk(`/purchase-orders/${po.poNumber}`);
      expect(detail.status).toBe('RECEIVED');
      expect(detail.receipts).toHaveLength(1);
      expect(detail.receipts[0].receivedBy).toBe('Ada Admin');
      expect(detail.receipts[0].lines).toEqual([
        expect.objectContaining({ sku: item.sku, qty: 10, bin: bin.code }),
      ]);
    },
  );

  test(
    'a partial receipt leaves the PO PARTIAL with the remaining quantity',
    { tag: '@REQ-009' },
    async ({ api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin('RECEIVING');
      const po = await factory.purchaseOrder([
        { sku: item.sku, qty: 10 },
        { sku: 'GIFT-BAG-ASST', qty: 4 },
      ]);

      const r = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 4, bin: bin.code }],
      });
      expect(r.poStatus).toBe('PARTIAL');
      expect(r.lines[0]).toMatchObject({ qtyReceived: 4, qtyRemaining: 6 });

      const second = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [
          { lineNo: 1, qty: 6, bin: bin.code },
          { lineNo: 2, qty: 4, bin: bin.code },
        ],
      });
      expect(second.poStatus).toBe('RECEIVED');
      const detail = await api.getOk(`/purchase-orders/${po.poNumber}`);
      expect(detail.receipts).toHaveLength(2);
      expect(detail.lines.map((l: any) => l.qtyRemaining)).toEqual([0, 0]);
    },
  );

  test(
    'over-receipt is refused with the remaining quantity in the details',
    { tag: '@REQ-010' },
    async ({ api, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      const r = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 6, bin: 'RECV-01' }],
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('OVER_RECEIPT');
      expect(r.body.error.details).toMatchObject({
        lineNo: 1,
        sku: item.sku,
        qtyRemaining: 5,
        requested: 6,
      });
      // nothing was posted
      const detail = await api.getOk(`/purchase-orders/${po.poNumber}`);
      expect(detail.status).toBe('OPEN');
      expect(detail.receipts).toEqual([]);
    },
  );

  test(
    'a receipt is atomic: one bad line rolls back the good ones',
    { tag: ['@REQ-009', '@REQ-023'] },
    async ({ api, factory }) => {
      const a = await factory.item();
      const b = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([
        { sku: a.sku, qty: 3 },
        { sku: b.sku, qty: 3 },
      ]);
      const r = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [
          { lineNo: 1, qty: 3, bin: bin.code },
          { lineNo: 2, qty: 99, bin: bin.code },
        ],
      });
      expect(r.status).toBe(409);
      const inv = await api.getOk(`/inventory/bin/${bin.code}`);
      expect(inv.rows).toEqual([]);
      expect((await api.getOk(`/purchase-orders/${po.poNumber}`)).lines[0].qtyReceived).toBe(0);
    },
  );

  test(
    'lot-tracked lines require a lot number and keep it on the stock',
    { tag: '@REQ-011' },
    async ({ api, factory }) => {
      const item = await factory.item({ lotTracked: true });
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 4 }]);
      const noLot = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 4, bin: bin.code }],
      });
      expect(noLot.status).toBe(400);
      expect(noLot.body.error.code).toBe('LOT_REQUIRED');

      const ok = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 4, bin: bin.code, lot: 'lot-77 ' }],
      });
      expect(ok.status).toBe(201);
      expect(ok.body.lines[0].lot).toBe('lot-77');
      const inv = await api.getOk(`/inventory/bin/${bin.code}`);
      expect(inv.rows).toEqual([
        expect.objectContaining({ sku: item.sku, lot: 'lot-77', qtyOnHand: 4 }),
      ]);
    },
  );

  test(
    'a lot sent for a non-tracked item is ignored rather than rejected',
    { tag: '@REQ-011' },
    async ({ api, factory }) => {
      const item = await factory.item({ lotTracked: false });
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      const r = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: bin.code, lot: 'IGNORED' }],
      });
      expect(r.lines[0].lot).toBe('');
    },
  );

  test(
    'stock cannot be received into SHIPPING or inactive bins, but QUARANTINE is fine',
    { tag: '@REQ-012' },
    async ({ api, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 9 }]);
      const ship = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: 'SHIP-01' }],
      });
      expect(ship.status).toBe(409);
      expect(ship.body.error.code).toBe('INVALID_BIN_ZONE');

      const dead = await factory.bin('STORAGE');
      await api.patchOk(`/bins/${dead.code}`, { active: false });
      const inactive = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: dead.code }],
      });
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe('BIN_INACTIVE');

      const missing = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: 'NO-SUCH-BIN' }],
      });
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('BIN_NOT_FOUND');

      const qa = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: 'QA-01' }],
      });
      expect(qa.status).toBe(201);
    },
  );

  test(
    'lines can be addressed by SKU or barcode when the SKU is on the PO once',
    { tag: ['@REQ-004', '@REQ-009'] },
    async ({ api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([
        { sku: 'GIFT-BAG-ASST', qty: 2 },
        { sku: item.sku, qty: 6 },
      ]);
      const r = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ sku: item.barcode, qty: 6, bin: bin.code }],
      });
      expect(r.lines[0]).toMatchObject({ lineNo: 2, sku: item.sku, qtyRemaining: 0 });

      const notOnPo = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ sku: 'TOY-ROBOT-RED', qty: 1, bin: bin.code }],
      });
      expect(notOnPo.status).toBe(400);
      expect(notOnPo.body.error.code).toBe('LINE_NOT_ON_PO');

      const unknown = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ sku: 'NOT-AN-ITEM', qty: 1, bin: bin.code }],
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe('ITEM_NOT_FOUND');
    },
  );

  test(
    'the same SKU on two lines must be received by line number',
    { tag: '@REQ-009' },
    async ({ api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([
        { sku: item.sku, qty: 2 },
        { sku: item.sku, qty: 3 },
      ]);
      const ambiguous = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ sku: item.sku, qty: 2, bin: bin.code }],
      });
      expect(ambiguous.status).toBe(400);
      expect(ambiguous.body.error.code).toBe('AMBIGUOUS_LINE');

      const mismatch = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, sku: 'GIFT-BAG-ASST', qty: 1, bin: bin.code }],
      });
      expect(mismatch.status).toBe(400);
      expect(mismatch.body.error.code).toBe('LINE_ITEM_MISMATCH');

      const ok = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 2, qty: 3, bin: bin.code }],
      });
      expect(ok.lines[0]).toMatchObject({ lineNo: 2, qtyRemaining: 0 });
      expect(ok.poStatus).toBe('PARTIAL');
    },
  );

  test(
    'received and closed POs refuse further receipts',
    { tag: '@REQ-013' },
    async ({ api, apiAs, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: bin.code }],
      });
      const again = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: bin.code }],
      });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('PO_NOT_OPEN');

      const open = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      const sup = await apiAs('supervisor');
      const closed = await sup.post(`/purchase-orders/${open.poNumber}/close`);
      expect(closed.status).toBe(200);
      expect(closed.body.status).toBe('CLOSED');
      expect((await sup.post(`/purchase-orders/${open.poNumber}/close`)).body.error.code).toBe(
        'PO_ALREADY_CLOSED',
      );
      const r = await api.post(`/purchase-orders/${open.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: bin.code }],
      });
      expect(r.body.error.code).toBe('PO_NOT_OPEN');
      expect(
        (await (await apiAs('operator')).post(`/purchase-orders/${open.poNumber}/close`)).status,
      ).toBe(403);
    },
  );

  test(
    'quantities must be positive whole numbers',
    { tag: '@REQ-032' },
    async ({ api, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      for (const qty of [0, -1, 1.5, 'two', null]) {
        const r = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
          lines: [{ lineNo: 1, qty, bin: 'RECV-01' }],
        });
        expect(r.status, `qty=${qty}`).toBe(400);
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(
        (await api.post(`/purchase-orders/${po.poNumber}/receipts`, { lines: [] })).status,
      ).toBe(400);
      expect((await api.post(`/purchase-orders/${po.poNumber}/receipts`, {})).status).toBe(400);
      expect(
        (
          await api.post(`/purchase-orders/PO-DOES-NOT-EXIST/receipts`, {
            lines: [{ lineNo: 1, qty: 1, bin: 'RECV-01' }],
          })
        ).status,
      ).toBe(404);
    },
  );

  test(
    'purchase orders can be listed by status and searched by number or vendor',
    { tag: '@REQ-030' },
    async ({ api, factory }) => {
      const vendor = `Vendor ${uid('V')}`;
      const po = await factory.purchaseOrder([{ sku: 'GIFT-BAG-ASST', qty: 1 }], { vendor });
      const open = await api.getOk('/purchase-orders', { open: 'true', pageSize: 200 });
      for (const row of open.data) expect(['OPEN', 'PARTIAL']).toContain(row.status);
      expect(open.data.map((p: any) => p.poNumber)).toContain(po.poNumber);

      const byVendor = await api.getOk('/purchase-orders', { q: vendor });
      expect(byVendor.data.map((p: any) => p.poNumber)).toEqual([po.poNumber]);
      expect(byVendor.data[0]).toMatchObject({ lineCount: 1, qtyOrdered: 1, qtyReceived: 0 });

      const closed = await api.getOk('/purchase-orders', { status: 'CLOSED' });
      expect(closed.data.map((p: any) => p.poNumber)).toContain('PO-1006');
      expect((await api.get('/purchase-orders', { status: 'LOST' })).status).toBe(400);
    },
  );

  test(
    'manual purchase orders are numbered automatically and validated',
    { tag: '@REQ-009' },
    async ({ api, apiAs }) => {
      const auto = await api.post('/purchase-orders', {
        vendor: 'Auto Numbered',
        lines: [{ sku: 'toy-robot-red', qty: 2 }],
      });
      expect(auto.status).toBe(201);
      expect(auto.body.poNumber).toMatch(/^PO-\d{4,}$/);
      expect(auto.body.lines[0]).toMatchObject({
        lineNo: 1,
        sku: 'TOY-ROBOT-RED',
        qtyOrdered: 2,
        qtyRemaining: 0 + 2,
      });

      const dupe = await api.post('/purchase-orders', {
        poNumber: auto.body.poNumber,
        vendor: 'x',
        lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }],
      });
      expect(dupe.status).toBe(409);
      expect(dupe.body.error.code).toBe('DUPLICATE_PO');

      const unknown = await api.post('/purchase-orders', {
        vendor: 'x',
        lines: [{ sku: 'NOPE', qty: 1 }],
      });
      expect(unknown.status).toBe(400);
      expect(unknown.body.error.code).toBe('UNKNOWN_SKU');

      expect((await api.post('/purchase-orders', { vendor: 'x', lines: [] })).status).toBe(400);
      expect(
        (
          await api.post('/purchase-orders', {
            vendor: 'x',
            expectedDate: '11/04/2026',
            lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await (
            await apiAs('operator')
          ).post('/purchase-orders', { vendor: 'x', lines: [{ sku: 'TOY-ROBOT-RED', qty: 1 }] })
        ).status,
      ).toBe(403);
    },
  );
});
