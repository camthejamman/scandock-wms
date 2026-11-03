import { expect, test } from '../../support/fixtures';
import { PickPage } from '../../pages/scanner.pages';

test.describe('picking on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    'the pick list shows open and in-progress orders, rush first',
    { tag: '@REQ-014' },
    async ({ page, factory }) => {
      const { item } = await factory.stockedItem(10);
      const standard = await factory.salesOrder([{ sku: item.sku, qty: 1 }], {
        customer: 'Standard Co',
      });
      const rush = await factory.salesOrder([{ sku: item.sku, qty: 1 }], {
        customer: 'Rush Co',
        priority: 'RUSH',
      });
      const pick = new PickPage(page);
      await pick.goto();
      await expect(pick.orderRows().first()).toBeVisible();
      const badges = await pick.orderRows().locator('.badge[data-status]').allTextContents();
      for (const b of badges) expect(['Open', 'Picking', 'Rush']).toContain(b);
      const numbers = await pick.orderRows().locator('.title').allTextContents();
      expect(numbers.indexOf(rush.soNumber)).toBeGreaterThanOrEqual(0);
      expect(numbers.indexOf(rush.soNumber)).toBeLessThan(numbers.indexOf(standard.soNumber));
      await expect(
        page
          .locator(`[data-testid="so-row"]:has-text("${rush.soNumber}")`)
          .locator('.badge', { hasText: 'Rush' }),
      ).toBeVisible();
    },
  );

  test(
    'guided pick: bin, item, quantity, confirm, complete',
    { tag: ['@smoke', '@REQ-014', '@REQ-015', '@REQ-016', '@REQ-029'] },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 3 }]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);

      await expect(pick.targetBin()).toHaveText(bin.code);
      await expect(pick.targetQty()).toHaveText('3');
      await expect(pick.targetSku()).toHaveText(item.sku);

      await pick.scanBin(bin.code);
      await expect(page.getByText(`Bin ${bin.code}`)).toBeVisible();
      await pick.scanItem('TOY-ROBOT-RED');
      await pick.expectError(`Wrong item: expected ${item.sku}`);
      await expect(pick.confirm()).toHaveCount(0);
      await pick.scanItem(item.barcode);
      await expect(pick.qty()).toHaveValue('3');
      await pick.confirm().click();
      await pick.expectSuccess(`Picked 3 × ${item.sku} from ${bin.code}`);

      await expect(pick.completePanel()).toContainText('All lines picked');
      await pick.completeButton().click();
      await pick.expectSuccess(`${so.soNumber} picked. Ready to ship.`);
      await expect(page).toHaveURL(/\/scan\/pick$/);
      await expect(page.locator(`[data-testid="so-row"]:has-text("${so.soNumber}")`)).toHaveCount(
        0,
      );

      const detail = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(detail).toMatchObject({ status: 'PICKED', pickedBy: 'Pat Picker' });
      expect(detail.picks).toEqual([expect.objectContaining({ bin: bin.code, qty: 3 })]);
    },
  );

  test(
    'a multi-line order moves to the next line after each confirmation',
    { tag: '@REQ-014' },
    async ({ page, factory }) => {
      const a = await factory.stockedItem(5);
      const b = await factory.stockedItem(5);
      const so = await factory.salesOrder([
        { sku: a.item.sku, qty: 1 },
        { sku: b.item.sku, qty: 2 },
      ]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await expect(pick.step()).toHaveAttribute('data-line', '1');
      await pick.pickCurrentLine(a.bin.code, a.item.barcode);
      await expect(pick.step()).toHaveAttribute('data-line', '2');
      await expect(pick.targetSku()).toHaveText(b.item.sku);
      await expect(pick.targetBin()).toHaveText(b.bin.code);
      await expect(page.getByText('1/2 done')).toBeVisible();
      await pick.pickCurrentLine(b.bin.code, b.item.barcode);
      await expect(pick.completePanel()).toBeVisible();
      await expect(page.getByText('2/2 done')).toBeVisible();
    },
  );

  test(
    'a short pick needs a reason and is recorded on the order',
    { tag: '@REQ-016' },
    async ({ page, api, factory }) => {
      const a = await factory.stockedItem(5);
      const missing = await factory.item();
      const so = await factory.salesOrder([
        { sku: a.item.sku, qty: 1 },
        { sku: missing.sku, qty: 2 },
      ]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await pick.pickCurrentLine(a.bin.code, a.item.barcode);
      await expect(pick.targetSku()).toHaveText(missing.sku);
      await expect(page.getByText('0 available in the warehouse')).toBeVisible();
      await pick.skip().click();
      await expect(pick.completePanel()).toContainText('Short pick');
      await expect(pick.completePanel()).toContainText(`${missing.sku} (2 short)`);
      await pick.shortReason().selectOption('Damaged stock');
      await pick.completeButton().click();
      await pick.expectSuccess('(short)');
      const detail = await api.getOk(`/sales-orders/${so.soNumber}`);
      expect(detail).toMatchObject({ status: 'PICKED', shortReason: 'Damaged stock' });
      expect(detail.lines[1].qtyPicked).toBe(0);
    },
  );

  test(
    'skipped lines can be revisited before completing',
    { tag: '@REQ-016' },
    async ({ page, factory }) => {
      const a = await factory.stockedItem(5);
      const so = await factory.salesOrder([{ sku: a.item.sku, qty: 1 }]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await pick.skip().click();
      await expect(pick.completePanel()).toContainText('Short pick');
      await expect(pick.completeButton()).toBeDisabled(); // nothing picked yet
      await page.getByRole('button', { name: 'Go back to skipped lines' }).click();
      await expect(pick.step()).toBeVisible();
      await pick.pickCurrentLine(a.bin.code, a.item.barcode);
      await expect(pick.completeButton()).toBeEnabled();
    },
  );

  test(
    'lot-tracked lines pre-fill the lot from the suggested bin',
    { tag: '@REQ-011' },
    async ({ page, api, factory }) => {
      const { item, bin, lot } = await factory.stockedItem(6, { lotTracked: true });
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await expect(page.getByText(`lot ${lot}`)).toBeVisible();
      await pick.scanBin(bin.code);
      await pick.scanItem(item.sku);
      await expect(pick.lot()).toHaveValue(lot!);
      await pick.confirm().click();
      await pick.expectSuccess('Picked 2');
      expect((await api.getOk(`/sales-orders/${so.soNumber}`)).picks[0].lot).toBe(lot);
    },
  );

  test(
    'picking more than the bin holds is refused with the available quantity',
    { tag: '@REQ-015' },
    async ({ page, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 5 }]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await pick.scanBin(bin.code);
      await pick.scanItem(item.barcode);
      await expect(pick.qty()).toHaveValue('2'); // pre-filled with what the bin can give
      await pick.qty().fill('5');
      await pick.confirm().click();
      await pick.expectError('Only 2 on hand');
      await expect(pick.step()).toHaveAttribute('data-line', '1');
    },
  );

  test(
    'an unexpected bin is accepted with a warning when it really holds the stock',
    { tag: '@REQ-014' },
    async ({ page, factory }) => {
      const { item } = await factory.stockedItem(5);
      const other = await factory.bin('STORAGE');
      await factory.stock(item.sku, other.code, 3);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const pick = new PickPage(page);
      await pick.gotoOrder(so.soNumber);
      await pick.scanBin('A-04-04');
      await expect(pick.infoToast().last()).toContainText('not a suggested bin');
      await pick.scanItem(item.sku);
      await pick.confirm().click();
      await pick.expectError('Only 0 on hand');
      await page.getByRole('button', { name: 'change' }).click();
      await pick.pickCurrentLine(other.code, item.sku);
      await pick.expectSuccess(`from ${other.code}`);
    },
  );

  test('a shipped order has nothing to pick', { tag: '@REQ-015' }, async ({ page }) => {
    const pick = new PickPage(page);
    await pick.gotoOrder('SO-5006');
    await expect(page.getByRole('status').filter({ hasText: 'nothing to pick' })).toBeVisible();
    await expect(pick.step()).toHaveCount(0);
  });
});
