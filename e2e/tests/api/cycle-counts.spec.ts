import { expect, test } from '../../support/fixtures';

test.describe('cycle counts', () => {
  test(
    'creating a count snapshots what the system expects in the bin',
    { tag: ['@smoke', '@REQ-020'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(8);
      const other = await factory.item();
      await factory.stock(other.sku, bin.code, 2);
      const c = await api.post('/cycle-counts', {
        bin: bin.code.toLowerCase(),
        assignedTo: 'picker1',
      });
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({
        bin: bin.code,
        status: 'OPEN',
        assignedTo: 'Pat Picker',
        blind: false,
        summary: null,
      });
      expect(c.body.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sku: item.sku, expectedQty: 8, countedQty: null }),
          expect.objectContaining({ sku: other.sku, expectedQty: 2, countedQty: null }),
        ]),
      );
      // later stock changes do not alter the snapshot
      await factory.stock(item.sku, bin.code, 1);
      const again = await api.getOk(`/cycle-counts/${c.body.id}`);
      expect(again.lines.find((l: any) => l.sku === item.sku).expectedQty).toBe(8);
    },
  );

  test(
    'a bin can only have one count in progress; assignees must exist and be active',
    { tag: '@REQ-020' },
    async ({ api, factory }) => {
      const { bin } = await factory.stockedItem(1);
      await factory.cycleCount(bin.code);
      const dupe = await api.post('/cycle-counts', { bin: bin.code });
      expect(dupe.status).toBe(409);
      expect(dupe.body.error.code).toBe('COUNT_ALREADY_OPEN');

      const other = await factory.bin();
      expect(
        (await api.post('/cycle-counts', { bin: other.code, assignedTo: 'ghost-user' })).body.error
          .code,
      ).toBe('UNKNOWN_USER');
      expect(
        (await api.post('/cycle-counts', { bin: other.code, assignedTo: 'inactive' })).body.error
          .code,
      ).toBe('USER_INACTIVE');
      expect((await api.post('/cycle-counts', { bin: 'NOPE-BIN' })).status).toBe(404);
    },
  );

  test(
    'submitting computes variances; unreported lines count as zero and surprises become new lines',
    { tag: '@REQ-020' },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const missing = await factory.item();
      await factory.stock(missing.sku, bin.code, 4);
      const surprise = await factory.item();
      const count = await factory.cycleCount(bin.code, 'picker1');

      const op = await apiAs('operator');
      const r = await op.post(`/cycle-counts/${count.id}/submit`, {
        lines: [
          { sku: item.barcode, countedQty: 7 },
          { sku: surprise.sku, countedQty: 1 },
        ],
      });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('SUBMITTED');
      const bySku = Object.fromEntries(r.body.lines.map((l: any) => [l.sku, l]));
      expect(bySku[item.sku]).toMatchObject({ expectedQty: 10, countedQty: 7, variance: -3 });
      expect(bySku[missing.sku]).toMatchObject({ expectedQty: 4, countedQty: 0, variance: -4 });
      expect(bySku[surprise.sku]).toMatchObject({ expectedQty: 0, countedQty: 1, variance: 1 });
      expect(r.body.summary).toEqual({
        lines: 3,
        linesWithVariance: 3,
        netVariance: -6,
        absVariance: 8,
        accuracyPct: 0,
      });

      const detail = await api.getOk(`/cycle-counts/${count.id}`);
      expect(detail).toMatchObject({ status: 'SUBMITTED', submittedBy: 'Pat Picker' });
      expect(
        (await op.post(`/cycle-counts/${count.id}/submit`, { lines: [] })).body.error.code,
      ).toBe('COUNT_NOT_OPEN');
    },
  );

  test(
    'a count assigned to someone else cannot be submitted by another operator, but a supervisor may',
    { tag: ['@REQ-003', '@REQ-020'] },
    async ({ apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const count = await factory.cycleCount(bin.code, 'receiver1');
      const picker = await apiAs('operator');
      const blocked = await picker.post(`/cycle-counts/${count.id}/submit`, {
        lines: [{ sku: item.sku, countedQty: 2 }],
      });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('NOT_ASSIGNED');
      expect((await picker.get(`/cycle-counts/${count.id}`)).status).toBe(403);

      const sup = await apiAs('supervisor');
      const ok = await sup.post(`/cycle-counts/${count.id}/submit`, {
        lines: [{ sku: item.sku, countedQty: 2 }],
      });
      expect(ok.status).toBe(200);
      expect(ok.body.summary.accuracyPct).toBe(100);
    },
  );

  test(
    'an unassigned count is claimed by whoever submits it',
    { tag: '@REQ-020' },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const count = await factory.cycleCount(bin.code);
      const op = await apiAs({ username: 'receiver1', pin: '1234' });
      await op.postOk(`/cycle-counts/${count.id}/submit`, {
        lines: [{ sku: item.sku, countedQty: 2 }],
      });
      const detail = await api.getOk(`/cycle-counts/${count.id}`);
      expect(detail.assignedTo).toBe('Rae Receiver');
      expect(detail.submittedBy).toBe('Rae Receiver');
    },
  );

  test(
    'approval posts adjustments, fixes on-hand and queues the ERP document',
    { tag: ['@REQ-021', '@REQ-023', '@REQ-025'] },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const count = await factory.cycleCount(bin.code, 'picker1');
      expect((await api.post(`/cycle-counts/${count.id}/approve`)).body.error.code).toBe(
        'COUNT_NOT_SUBMITTED',
      );

      await (
        await apiAs('operator')
      ).postOk(`/cycle-counts/${count.id}/submit`, { lines: [{ sku: item.sku, countedQty: 8 }] });
      const sup = await apiAs('supervisor');
      const r = await sup.post(`/cycle-counts/${count.id}/approve`, {
        notes: 'Two damaged units removed',
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'APPROVED', erpQueued: true });
      expect(r.body.adjustments).toEqual([{ sku: item.sku, bin: bin.code, lot: '', qtyDelta: -2 }]);

      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(8);
      const tx = await api.getOk('/transactions', { reference: `CC-${count.id}` });
      expect(tx.data).toEqual([
        expect.objectContaining({
          type: 'ADJUSTMENT',
          qtyDelta: -2,
          qtyAfter: 8,
          user: 'Sam Supervisor',
        }),
      ]);
      const detail = await api.getOk(`/cycle-counts/${count.id}`);
      expect(detail).toMatchObject({
        status: 'APPROVED',
        reviewedBy: 'Sam Supervisor',
        notes: 'Two damaged units removed',
      });
      const outbox = await api.getOk('/erp/outbox');
      expect(outbox.data.find((o: any) => o.reference === `CC-${count.id}`)).toMatchObject({
        kind: 'inventory-adjustment',
      });
      expect((await sup.post(`/cycle-counts/${count.id}/approve`)).status).toBe(409);
    },
  );

  test(
    'approving a count with no variance changes nothing and sends nothing',
    { tag: '@REQ-021' },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const count = await factory.cycleCount(bin.code);
      await (
        await apiAs('operator')
      ).postOk(`/cycle-counts/${count.id}/submit`, { lines: [{ sku: item.sku, countedQty: 5 }] });
      const r = await api.postOk(`/cycle-counts/${count.id}/approve`);
      expect(r).toMatchObject({ status: 'APPROVED', adjustments: [], erpQueued: false });
      expect((await api.getOk('/transactions', { reference: `CC-${count.id}` })).data).toEqual([]);
    },
  );

  test(
    'rejection closes the count without touching stock, and the bin can be counted again',
    { tag: '@REQ-021' },
    async ({ api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const count = await factory.cycleCount(bin.code);
      await (
        await apiAs('operator')
      ).postOk(`/cycle-counts/${count.id}/submit`, { lines: [{ sku: item.sku, countedQty: 0 }] });
      const r = await api.postOk(`/cycle-counts/${count.id}/reject`, {
        notes: 'Counted the wrong shelf',
      });
      expect(r).toMatchObject({ status: 'REJECTED', notes: 'Counted the wrong shelf' });
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(5);
      const recount = await api.post('/cycle-counts', { bin: bin.code });
      expect(recount.status).toBe(201);
    },
  );

  test(
    'operators only see their own and unassigned open counts',
    { tag: ['@REQ-003', '@REQ-020'] },
    async ({ apiAs, factory }) => {
      const a = await factory.stockedItem(1);
      const b = await factory.stockedItem(1);
      const c = await factory.stockedItem(1);
      const mine = await factory.cycleCount(a.bin.code, 'picker1');
      const theirs = await factory.cycleCount(b.bin.code, 'receiver1');
      const nobodys = await factory.cycleCount(c.bin.code);

      const op = await apiAs('operator');
      const all = await op.getOk('/cycle-counts', { pageSize: 200 });
      const ids = all.data.map((x: any) => x.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(nobodys.id);
      expect(ids).not.toContain(theirs.id);

      const onlyMine = await op.getOk('/cycle-counts', { assignedTo: 'me', pageSize: 200 });
      expect(onlyMine.data.map((x: any) => x.id)).toContain(mine.id);
      expect(onlyMine.data.map((x: any) => x.id)).not.toContain(nobodys.id);

      const sup = await apiAs('supervisor');
      const supIds = (await sup.getOk('/cycle-counts', { pageSize: 200 })).data.map(
        (x: any) => x.id,
      );
      expect(supIds).toEqual(expect.arrayContaining([mine.id, theirs.id, nobodys.id]));
    },
  );

  test(
    'submissions validate SKUs and lots',
    { tag: ['@REQ-011', '@REQ-032'] },
    async ({ api, factory }) => {
      const { item, bin, lot } = await factory.stockedItem(3, { lotTracked: true });
      const count = await factory.cycleCount(bin.code);
      expect(
        (
          await api.post(`/cycle-counts/${count.id}/submit`, {
            lines: [{ sku: 'NOPE', countedQty: 1 }],
          })
        ).body.error.code,
      ).toBe('UNKNOWN_SKU');
      expect(
        (
          await api.post(`/cycle-counts/${count.id}/submit`, {
            lines: [{ sku: item.sku, countedQty: 1 }],
          })
        ).body.error.code,
      ).toBe('LOT_REQUIRED');
      expect(
        (
          await api.post(`/cycle-counts/${count.id}/submit`, {
            lines: [{ sku: item.sku, lot, countedQty: -1 }],
          })
        ).status,
      ).toBe(400);
      const ok = await api.postOk(`/cycle-counts/${count.id}/submit`, {
        lines: [{ sku: item.sku, lot, countedQty: 3 }],
      });
      expect(ok.lines).toEqual([expect.objectContaining({ sku: item.sku, lot, variance: 0 })]);
      expect((await api.get('/cycle-counts/999999')).status).toBe(404);
      expect((await api.get('/cycle-counts/abc')).status).toBe(404);
    },
  );
});
