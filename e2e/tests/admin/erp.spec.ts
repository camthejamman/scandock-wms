import { expect, test } from '../../support/fixtures';
import { ErpPage, OrdersPage } from '../../pages/admin.pages';
import { uid } from '../../support/env';

test.describe('admin ERP sync', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'status, outbox and log are shown; Sync now pulls new ERP orders',
    { tag: ['@smoke', '@REQ-024', '@REQ-025'] },
    async ({ page, erp, factory }) => {
      const item = await factory.item();
      const poNumber = uid('UPO');
      await erp.post('/erp/purchase-orders', {
        poNumber,
        vendor: 'Console Vendor',
        lines: [{ sku: item.sku, qty: 12 }],
      });

      const erpPage = new ErpPage(page);
      await erpPage.goto();
      await expect(erpPage.status()).toContainText('Nimbus ERP');
      await expect(erpPage.status()).toContainText('Online');
      await expect(erpPage.logRows().first()).toBeVisible();
      await erpPage.syncNow().click();
      await expect(erpPage.syncResult()).toContainText(/Pulled \d+ purchase order\(s\)/);
      await erpPage.expectSuccess('Synced');
      await expect(erpPage.outboxRows().first()).toBeVisible();
      await expect(erpPage.outboxRows().first()).toHaveAttribute(
        'data-status',
        /^(PENDING|SENT|FAILED)$/,
      );

      const orders = new OrdersPage(page);
      await orders.goto('po', `&q=${poNumber}`);
      await expect(orders.poRows()).toHaveCount(1);
      await expect(orders.poRows().first()).toContainText('Console Vendor');
      await expect(orders.poRows().first()).toContainText('NIMBUS-PO-');
    },
  );

  test(
    'documents pushed to the ERP show as Sent with their ERP reference',
    { tag: '@REQ-025' },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 });
      await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
      await api.postOk(`/sales-orders/${so.soNumber}/ship`);
      const erpPage = new ErpPage(page);
      await erpPage.goto();
      await erpPage.syncNow().click();
      await erpPage.expectSuccess('Synced');
      const row = erpPage.outboxRows().filter({ hasText: so.soNumber });
      await expect(row).toHaveAttribute('data-status', 'SENT');
      await expect(row).toContainText(/IF-\d+/);
    },
  );
});
