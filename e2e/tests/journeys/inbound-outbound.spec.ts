import { expect, test } from '../../support/fixtures';
import { uid } from '../../support/env';
import { ErpPage, InventoryPage, OrdersPage, SoDetailPage } from '../../pages/admin.pages';
import { PickPage, ReceivePage, ShipPage } from '../../pages/scanner.pages';

/**
 * The money path: an order arrives from the ERP, the warehouse receives, picks and ships it,
 * and the ERP learns about every step. Admin and operator roles alternate like a real day.
 */
test(
  'inbound to outbound: ERP order -> receive -> pick -> ship -> ERP fulfillment',
  { tag: ['@smoke', '@REQ-009', '@REQ-018', '@REQ-024', '@REQ-025'] },
  async ({ page, api, erp, factory, loginAs }) => {
    const item = await factory.item({ name: 'Journey Widget', weightLb: 2 });
    const poNumber = uid('JPO');
    const soNumber = uid('JSO');
    await erp.post('/erp/purchase-orders', {
      poNumber,
      vendor: 'Journey Imports',
      lines: [{ sku: item.sku, qty: 6 }],
    });
    await erp.post('/erp/sales-orders', {
      soNumber,
      customer: 'Journey Customer',
      lines: [{ sku: item.sku, qty: 2 }],
    });

    await test.step('supervisor syncs the ERP and sees the new PO', async () => {
      await loginAs('supervisor');
      const erpPage = new ErpPage(page);
      await erpPage.goto();
      await erpPage.syncNow().click();
      await erpPage.expectSuccess('Synced');
      const orders = new OrdersPage(page);
      await orders.goto('po', `&q=${poNumber}`);
      await expect(orders.poRows()).toHaveCount(1);
      await expect(orders.poRows().first()).toContainText('Journey Imports');
    });

    await test.step('operator receives the PO into a picking bin', async () => {
      await loginAs('operator');
      const receive = new ReceivePage(page);
      await receive.goto();
      await receive.scanPo(poNumber);
      await receive.receiveLine(item.barcode, 'P-01-04');
      await receive.expectSuccess(`Received 6 × ${item.sku} into P-01-04`);
      await expect(receive.complete()).toBeVisible();
    });

    await test.step('supervisor sees the stock in the console', async () => {
      await loginAs('supervisor');
      const inv = new InventoryPage(page);
      await inv.goto(`?q=${item.sku}`);
      await expect(inv.rows()).toHaveCount(1);
      await expect(inv.rows().first()).toContainText('P-01-04');
      await expect(inv.rows().first().locator('td').nth(5)).toHaveText('6');
    });

    await test.step('operator picks and ships the sales order', async () => {
      await loginAs('operator');
      const pick = new PickPage(page);
      await pick.gotoOrder(soNumber);
      await expect(pick.targetBin()).toHaveText('P-01-04');
      await pick.pickCurrentLine('P-01-04', item.barcode);
      await pick.completeButton().click();
      await pick.expectSuccess('Ready to ship');
      const ship = new ShipPage(page);
      await ship.gotoOrder(soNumber);
      await expect(ship.weight()).toHaveValue('4');
      await ship.shipButton().click();
      await expect(ship.tracking()).toHaveText(/^1Z/);
    });

    await test.step('the ERP receives the item receipt and the fulfillment', async () => {
      await api.postOk('/erp/sync');
      const receipts = await erp.json<any[]>('/erp/item-receipts');
      expect(
        receipts.some((r) => r.payload.poNumber === poNumber && r.payload.lines[0].qty === 6),
      ).toBe(true);
      const fulfillments = await erp.json<any[]>('/erp/item-fulfillments');
      const f = fulfillments.find((x) => x.payload.soNumber === soNumber);
      expect(f.payload.lines).toEqual([{ sku: item.sku, qty: 2 }]);
      expect((await erp.json<any>(`/erp/sales-orders/${soNumber}`)).status).toBe('FULFILLED');
    });

    await test.step('the console shows the shipped order with its tracking number', async () => {
      await loginAs('supervisor');
      const detail = new SoDetailPage(page);
      await detail.goto(soNumber);
      await expect(detail.title()).toContainText('Shipped');
      await expect(detail.tracking()).toHaveText(/^1Z/);
      expect((await api.getOk(`/inventory/item/${item.sku}`)).qtyOnHand).toBe(4);
      expect((await api.getOk('/inventory/invariants')).ok).toBe(true);
    });
  },
);
