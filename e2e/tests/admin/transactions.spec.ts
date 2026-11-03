import { expect, test } from '../../support/fixtures';
import { TransactionsPage } from '../../pages/admin.pages';

test.describe('admin transactions', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'the ledger can be filtered by type and SKU',
    { tag: '@REQ-023' },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(6);
      const to = await factory.bin();
      await api.postOk('/transfers', { sku: item.sku, fromBin: bin.code, toBin: to.code, qty: 2 });
      const tx = new TransactionsPage(page);
      await tx.goto();
      await expect(tx.rows().first()).toBeVisible();
      await tx.type().selectOption('PICK');
      await tx.filter().click();
      await expect(tx.rows().first()).toBeVisible();
      await expect(tx.rows().locator('.badge').filter({ hasNotText: 'Pick' })).toHaveCount(0);
      await expect(tx.rows().locator('.badge', { hasText: 'Pick' }).first()).toBeVisible();

      await tx.type().selectOption('');
      await tx.sku().fill(item.sku);
      await tx.filter().click();
      await expect(tx.rows()).toHaveCount(3);
      await expect(tx.rows().nth(0)).toContainText('Transfer In');
      await expect(tx.rows().nth(1)).toContainText('Transfer Out');
      await expect(tx.rows().nth(2)).toContainText('Receipt');
      await expect(tx.rows().nth(2)).toContainText('Ada Admin');
    },
  );
});
