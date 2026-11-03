import { expect, test } from '../../support/fixtures';
import { SoDetailPage } from '../../pages/admin.pages';
import { PickPage, ShipPage } from '../../pages/scanner.pages';

test(
  'short pick: the order ships with what was found and the ERP is told the real quantities',
  { tag: ['@REQ-016', '@REQ-018'] },
  async ({ page, api, erp, factory, loginAs }) => {
    const { item, bin } = await factory.stockedItem(1);
    const so = await factory.salesOrder([{ sku: item.sku, qty: 3 }]);

    await test.step('operator picks the one unit and completes short', async () => {
      await loginAs('operator');
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await pick.scanBin(bin.code);
      await pick.scanItem(item.barcode);
      await expect(pick.qty()).toHaveValue('1');
      await pick.confirm().click();
      await pick.expectSuccess('Picked 1');
      await expect(pick.step()).toBeVisible(); // 2 still outstanding on the same line
      await pick.skip().click();
      await pick.shortReason().selectOption('Stock not found in bin');
      await pick.completeButton().click();
      await pick.expectSuccess('(short)');
    });

    await test.step('supervisor reviews the shortage in the console', async () => {
      await loginAs('supervisor');
      const detail = new SoDetailPage(page);
      await detail.goto(so.soNumber);
      await expect(page.getByText('Stock not found in bin')).toBeVisible();
      await expect(detail.lines().first().locator('td').nth(4)).toHaveText('1');
    });

    await test.step('operator ships it; the ERP fulfillment carries 1, not 3', async () => {
      await loginAs('operator');
      const ship = new ShipPage(page);
      await ship.gotoOrder(so.soNumber);
      await ship.shipButton().click();
      await expect(ship.result()).toBeVisible();
      await api.postOk('/erp/sync');
      const f = (await erp.json<any[]>('/erp/item-fulfillments')).find(
        (x) => x.payload.soNumber === so.soNumber,
      );
      expect(f.payload.lines).toEqual([{ sku: item.sku, qty: 1 }]);
    });
  },
);
