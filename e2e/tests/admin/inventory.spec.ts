import { expect, test } from '../../support/fixtures';
import { InventoryPage } from '../../pages/admin.pages';

test.describe('admin inventory', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'search narrows the table to one SKU across its bins and survives a reload',
    { tag: ['@smoke', '@REQ-007', '@REQ-030'] },
    async ({ page, factory }) => {
      const { item, bin } = await factory.stockedItem(7);
      const other = await factory.bin('STORAGE');
      await factory.stock(item.sku, other.code, 3);
      const inv = new InventoryPage(page);
      await inv.goto();
      await inv.search().fill(item.sku);
      await inv.searchButton().click();
      await expect(page).toHaveURL(new RegExp(`q=${item.sku}`));
      await expect(inv.rows()).toHaveCount(2);
      await expect(inv.rows().filter({ hasText: bin.code })).toContainText('7');
      await expect(inv.rows().filter({ hasText: other.code })).toContainText('3');
      await expect(inv.rows().first().locator('td').nth(6)).toHaveText('10'); // item total
      await page.reload();
      await expect(inv.search()).toHaveValue(item.sku);
      await expect(inv.rows()).toHaveCount(2);
    },
  );

  test(
    'zone and low-stock filters apply together',
    { tag: ['@REQ-008', '@REQ-030'] },
    async ({ page }) => {
      const inv = new InventoryPage(page);
      await inv.goto();
      await inv.zone().selectOption('PICKING');
      await expect(page).toHaveURL(/zone=PICKING/);
      await expect(inv.rows().first()).toBeVisible();
      await expect(
        inv.rows().locator('td:nth-child(4)').filter({ hasNotText: 'PICKING' }),
      ).toHaveCount(0);
      await inv.lowStock().check();
      await expect(page).toHaveURL(/lowStock=true/);
      await expect(inv.rows().first()).toBeVisible();
      await expect(
        inv.rows().filter({ hasNot: page.locator('.badge', { hasText: 'Low' }) }),
      ).toHaveCount(0);
      await expect(
        inv.rows().locator('td:nth-child(4)').filter({ hasNotText: 'PICKING' }),
      ).toHaveCount(0);
    },
  );

  test(
    'pagination walks through the rows and keeps the page in the URL',
    { tag: '@REQ-030' },
    async ({ page, api }) => {
      const all = await api.getOk('/inventory', { pageSize: 1 });
      test.skip(all.total <= 25, 'needs more than one page of inventory');
      const inv = new InventoryPage(page);
      await inv.goto();
      await expect(inv.rows()).toHaveCount(25);
      await expect(inv.pager()).toContainText('1–25 of');
      await expect(inv.previous()).toBeDisabled();
      const firstSku = await inv.rows().first().locator('td').first().innerText();
      await inv.next().click();
      await expect(page).toHaveURL(/page=2/);
      await expect(inv.pager()).toContainText('26–');
      expect(await inv.rows().first().locator('td').first().innerText()).not.toBe(firstSku);
      await inv.previous().click();
      await expect(inv.pager()).toContainText('1–25 of');
    },
  );

  test(
    'searching by bin code works too, and nonsense gives an empty state',
    { tag: '@REQ-030' },
    async ({ page, factory }) => {
      const { item, bin } = await factory.stockedItem(1);
      const inv = new InventoryPage(page);
      await inv.goto(`?q=${bin.code}`);
      await expect(inv.rows()).toHaveCount(1);
      await expect(inv.rows().first()).toContainText(item.sku);
      await inv.goto('?q=ZZZ-NOTHING-HERE');
      await expect(page.getByText('No inventory matches these filters.')).toBeVisible();
    },
  );
});
