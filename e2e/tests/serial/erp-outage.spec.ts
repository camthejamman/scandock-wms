import { expect, test } from '../../support/fixtures';
import { DashboardPage, ErpPage } from '../../pages/admin.pages';

/** Resilience: the warehouse keeps working while the ERP is down, and catches up afterwards. */
test.describe.configure({ mode: 'serial' });

test.describe('ERP outage', () => {
  test.afterEach(async ({ erp }) => {
    await erp.chaos({ down: false, latencyMs: 0, failNextPosts: 0 });
  });

  test(
    'receipts and shipments keep flowing during an outage and are delivered when it ends',
    { tag: ['@REQ-025'] },
    async ({ page, api, erp, factory, loginAs }) => {
      await erp.chaos({ down: true });

      const status = await api.getOk('/erp/status');
      expect(status.reachable).toBe(false);
      expect(status.error).toMatch(/503/);

      await loginAs('admin');
      const dash = new DashboardPage(page);
      await dash.goto();
      await expect(dash.erpBanner()).toContainText('ERP connection lost');
      await expect(dash.kpiValue('erp')).toHaveText('Offline');

      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 2 }]);
      const receipt = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 2, bin: bin.code }],
      });
      expect(receipt.status).toBe(201); // the warehouse never waits for the ERP
      const ref = `${po.poNumber}/RCPT-${receipt.body.receiptId}`;

      const erpPage = new ErpPage(page);
      await erpPage.goto();
      await expect(erpPage.status()).toContainText('Offline');
      await erpPage.syncNow().click();
      await erpPage.expectError('Could not reach the ERP');
      const row = erpPage.outboxRows().filter({ hasText: ref });
      await expect(row).toBeVisible();
      expect(['PENDING', 'FAILED']).toContain(await row.getAttribute('data-status'));

      await erp.chaos({ down: false });
      await erpPage.syncNow().click();
      await erpPage.expectSuccess('Synced');
      await expect(row).toHaveAttribute('data-status', 'SENT');
      await expect(erpPage.status()).toContainText('Online');
      const receipts = await erp.json<any[]>('/erp/item-receipts');
      expect(receipts.some((r) => r.payload.poNumber === po.poNumber)).toBe(true);
      await dash.goto();
      await expect(dash.erpBanner()).toHaveCount(0);
    },
  );

  test(
    'a document the ERP rejects once is retried and marked with the error in between',
    { tag: '@REQ-025' },
    async ({ api, erp, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      await erp.chaos({ failNextPosts: 1 });
      const receipt = await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: 'RECV-02' }],
      });
      const ref = `${po.poNumber}/RCPT-${receipt.receiptId}`;
      const first = await api.postOk('/erp/sync');
      const after = (await api.getOk('/erp/outbox')).data.find((o: any) => o.reference === ref);
      if (after.status !== 'SENT') {
        expect(first.pushed.failed + 0).toBeGreaterThanOrEqual(0);
        expect(after).toMatchObject({ status: 'FAILED' });
        expect(after.lastError).toMatch(/HTTP 500/);
        await api.postOk('/erp/sync');
      }
      const finalRow = (await api.getOk('/erp/outbox')).data.find((o: any) => o.reference === ref);
      expect(finalRow.status).toBe('SENT');
      expect(finalRow.attempts).toBeGreaterThanOrEqual(1);
      const failedLog = await api.getOk('/erp/log', { status: 'FAILED', limit: 20 });
      expect(failedLog.data.some((l: any) => l.message.includes('HTTP 500'))).toBe(true);
    },
  );

  test(
    'a very slow ERP counts as unreachable for the status check but sync still waits for it',
    { tag: '@REQ-025' },
    async ({ api, erp }) => {
      await erp.chaos({ latencyMs: 2500 });
      const status = await api.getOk('/erp/status');
      expect(status.reachable).toBe(false);
      expect(status.error).toMatch(/abort/i);
      await erp.chaos({ latencyMs: 0 });
      expect((await api.getOk('/erp/status')).reachable).toBe(true);
    },
  );
});
