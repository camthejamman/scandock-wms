import { expect, test } from '../../support/fixtures';
import { TransferPage } from '../../pages/scanner.pages';

test.describe('bin transfers on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    'scan item, tap the source, set quantity, scan destination',
    { tag: ['@smoke', '@REQ-019', '@REQ-029'] },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const to = await factory.bin('PICKING');
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem(item.barcode);
      await expect(page.getByText(`${item.name} · 10 on hand`)).toBeVisible();
      await expect(transfer.stockRows()).toHaveCount(1);
      await transfer.stockRows().first().click();
      await expect(page.getByText(`From ${bin.code}`)).toBeVisible();
      await transfer.qty().fill('4');
      await transfer.scanTo(to.code);
      await expect(transfer.result()).toContainText(
        `4 × ${item.sku} ${bin.code} → ${to.code} (now 6 / 4)`,
      );
      await transfer.expectSuccess('Moved 4');
      // the form reset for the next move
      await expect(transfer.scanInput('scan-item')).toBeVisible();
      expect((await api.getOk(`/inventory/bin/${to.code}`)).rows[0]).toMatchObject({
        sku: item.sku,
        qtyOnHand: 4,
      });
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(6);
    },
  );

  test(
    'the source bin must actually hold the item',
    { tag: '@REQ-019' },
    async ({ page, factory }) => {
      const { item } = await factory.stockedItem(3);
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem(item.sku);
      await transfer.scanFrom('A-04-04');
      await transfer.expectError(`No ${item.sku} in A-04-04`);
    },
  );

  test(
    'moving to the same bin or more than is there is refused',
    { tag: '@REQ-019' },
    async ({ page, factory }) => {
      const { item, bin } = await factory.stockedItem(3);
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem(item.sku);
      await transfer.scanFrom(bin.code);
      await transfer.scanTo(bin.code);
      await transfer.expectError('different bin');
      await transfer.qty().fill('9');
      await expect(transfer.qty()).toHaveValue('3'); // clamped to what the bin holds
    },
  );

  test(
    'unknown items are reported and nothing else happens',
    { tag: '@REQ-019' },
    async ({ page }) => {
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem('NOT-A-THING');
      await transfer.expectError('No item with SKU or barcode "NOT-A-THING"');
      await expect(transfer.stockRows()).toHaveCount(0);
    },
  );

  test(
    'lot-tracked stock moves lot by lot',
    { tag: '@REQ-011' },
    async ({ page, api, factory }) => {
      const { item, lot } = await factory.stockedItem(5, { lotTracked: true });
      const to = await factory.bin();
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem(item.sku);
      await transfer.stockRows().first().click();
      await expect(transfer.lot()).toHaveValue(lot!);
      await transfer.qty().fill('2');
      await transfer.scanTo(to.code);
      await transfer.expectSuccess('Moved 2');
      expect((await api.getOk(`/inventory/bin/${to.code}`)).rows[0]).toMatchObject({
        lot,
        qtyOnHand: 2,
      });
    },
  );

  test(
    '"change" lets the operator start over at any step',
    { tag: '@REQ-029' },
    async ({ page, factory }) => {
      const { item } = await factory.stockedItem(3);
      const transfer = new TransferPage(page);
      await transfer.goto();
      await transfer.scanItem(item.sku);
      await transfer.stockRows().first().click();
      await page.getByRole('button', { name: 'change' }).last().click();
      await expect(transfer.scanInput('scan-from')).toBeVisible();
      await page.getByRole('button', { name: 'change' }).first().click();
      await expect(transfer.scanInput('scan-item')).toBeVisible();
    },
  );
});
