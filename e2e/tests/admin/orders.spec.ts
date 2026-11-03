import { expect, test } from '../../support/fixtures';
import { OrdersPage, PoDetailPage, SoDetailPage } from '../../pages/admin.pages';
import { uid } from '../../support/env';

test.describe('admin orders', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'tabs, status filter and search are reflected in the URL',
    { tag: '@REQ-030' },
    async ({ page }) => {
      const orders = new OrdersPage(page);
      await orders.goto('po');
      await expect(orders.poTab()).toHaveAttribute('aria-selected', 'true');
      await orders.soTab().click();
      await expect(page).toHaveURL(/tab=so/);
      await expect(orders.soRows().first()).toBeVisible();
      await orders.status().selectOption('SHIPPED');
      await expect(page).toHaveURL(/status=SHIPPED/);
      await expect(orders.soRows().first()).toBeVisible();
      await expect(
        orders.soRows().locator('td:nth-child(3) .badge').filter({ hasNotText: 'Shipped' }),
      ).toHaveCount(0);
      await expect(
        orders.soRows().locator('td:nth-child(3) .badge', { hasText: 'Shipped' }).first(),
      ).toBeVisible();
      await orders.search().fill('Riverbend');
      await orders.searchButton().click();
      await expect(orders.soRows()).toHaveCount(1);
      await expect(orders.soRows().first()).toContainText('SO-5006');
    },
  );

  test(
    'a purchase order is created from the modal, received on the floor, and closed from the console',
    { tag: ['@smoke', '@REQ-009', '@REQ-035'] },
    async ({ page, api, factory }) => {
      const a = await factory.item();
      const b = await factory.item();
      const vendor = `Vendor ${uid('V')}`;
      const orders = new OrdersPage(page);
      await orders.goto('po');
      await orders.newOrder().click();
      await page.getByLabel('Vendor').fill(vendor);
      await page.getByLabel('Expected date').fill('2026-12-01');
      await orders.lineSku(1).fill(a.sku.toLowerCase());
      await orders.lineQty(1).fill('4');
      await orders.addLine().click();
      await orders.lineSku(2).fill(b.sku);
      await orders.lineQty(2).fill('2');
      await orders.save().click();
      const toast = orders.successToast().last();
      await expect(toast).toContainText('created');
      const poNumber = (await toast.innerText()).match(/PO-\d+/)![0];
      await expect(orders.poRows().filter({ hasText: poNumber })).toContainText(vendor);

      await api.postOk(`/purchase-orders/${poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 4, bin: 'RECV-01' }],
      });
      const detail = new PoDetailPage(page);
      await detail.goto(poNumber);
      await expect(detail.title()).toContainText(poNumber);
      await expect(detail.lines()).toHaveCount(2);
      await expect(detail.lines().first()).toContainText('4');
      await expect(detail.receipts()).toHaveCount(1);
      await expect(detail.receipts().first()).toContainText(`4 × ${a.sku} → RECV-01`);
      await expect(page.getByText('Partial', { exact: true })).toBeVisible();

      await detail.closePo().click();
      await expect(detail.modal()).toContainText(`Close ${poNumber}?`);
      await detail.confirmClose().click();
      await detail.expectSuccess(`${poNumber} closed`);
      await expect(detail.closePo()).toHaveCount(0);
      expect((await api.getOk(`/purchase-orders/${poNumber}`)).status).toBe('CLOSED');
    },
  );

  test(
    'the order modal validates lines and unknown SKUs',
    { tag: '@REQ-032' },
    async ({ page }) => {
      const orders = new OrdersPage(page);
      await orders.goto('po');
      await orders.newOrder().click();
      await orders.save().click();
      await expect(orders.modalError()).toHaveText('Vendor is required');
      await page.getByLabel('Vendor').fill('Someone');
      await orders.save().click();
      await expect(orders.modalError()).toContainText('Every line needs a SKU');
      await orders.lineSku(1).fill('NOT-REAL');
      await orders.save().click();
      await expect(orders.modalError()).toContainText('Unknown SKU NOT-REAL');
    },
  );

  test(
    'a rush international sales order is created and can be cancelled while open',
    { tag: ['@REQ-035'] },
    async ({ page, api }) => {
      const customer = `Customer ${uid('C')}`;
      const orders = new OrdersPage(page);
      await orders.goto('so');
      await orders.newOrder().click();
      await page.getByLabel('Customer').fill(customer);
      await page.getByLabel('Ship-to country').fill('ca');
      await page.getByLabel('Priority').selectOption('RUSH');
      await orders.lineSku(1).fill('TOY-ROBOT-RED');
      await orders.lineQty(1).fill('1');
      await orders.save().click();
      const toast = orders.successToast().last();
      const soNumber = (await toast.innerText()).match(/SO-\d+/)![0];
      const row = orders.soRows().filter({ hasText: soNumber });
      await expect(row.locator('.badge', { hasText: 'Rush' })).toBeVisible();
      await expect(row).toContainText('CA');

      const detail = new SoDetailPage(page);
      await detail.goto(soNumber);
      await expect(page.getByText('DHL Express Worldwide')).toBeVisible();
      await detail.cancel().click();
      await detail.confirmCancel().click();
      await detail.expectSuccess(`${soNumber} cancelled`);
      await expect(detail.cancel()).toHaveCount(0);
      expect((await api.getOk(`/sales-orders/${soNumber}`)).status).toBe('CANCELLED');
    },
  );

  test(
    'a shipped order shows its picks, carrier and tracking number',
    { tag: '@REQ-018' },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(3);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 2 });
      await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
      const shipped = await api.postOk(`/sales-orders/${so.soNumber}/ship`);
      const detail = new SoDetailPage(page);
      await detail.goto(so.soNumber);
      await expect(detail.title()).toContainText('Shipped');
      await expect(detail.tracking()).toHaveText(shipped.trackingNumber);
      await expect(detail.picks()).toHaveCount(1);
      await expect(detail.picks().first()).toContainText(bin.code);
      await expect(detail.lines().first()).toContainText('2');
      await expect(detail.cancel()).toHaveCount(0);
    },
  );
});
