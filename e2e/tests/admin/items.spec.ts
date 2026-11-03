import { expect, test } from '../../support/fixtures';
import { ItemsPage } from '../../pages/admin.pages';
import { uid } from '../../support/env';

test.describe('admin items', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'a new item can be created from the modal and gets a barcode',
    { tag: ['@smoke', '@REQ-005'] },
    async ({ page, api }) => {
      const sku = uid('UI');
      const items = new ItemsPage(page);
      await items.goto();
      await items.newItem().click();
      await expect(items.modal()).toBeVisible();
      await items.field('SKU').fill(sku.toLowerCase());
      await items.field('Name').fill('Made in the admin UI');
      await items.field('Category').fill('Test');
      await items.field(/Weight/).fill('3.5');
      await items.field('Reorder point').fill('4');
      await items.modal().getByLabel('Lot tracked').check();
      await items.save().click();
      await items.expectSuccess(`Item ${sku} created`);
      await expect(items.modal()).toBeHidden();
      await items.search().fill(sku);
      await items.searchButton().click();
      const row = items.row(sku);
      await expect(row).toBeVisible();
      await expect(row).toContainText('Made in the admin UI');
      await expect(row.locator('.mono')).toHaveText(/^\d{12}$/);
      await expect(row.locator('.badge', { hasText: 'Lot' })).toBeVisible();
      expect(await api.getOk(`/items/${sku}`)).toMatchObject({
        weightLb: 3.5,
        reorderPoint: 4,
        lotTracked: true,
        category: 'Test',
      });
    },
  );

  test(
    'duplicate SKUs and missing names are reported inside the modal',
    { tag: '@REQ-005' },
    async ({ page, factory }) => {
      const existing = await factory.item();
      const items = new ItemsPage(page);
      await items.goto();
      await items.newItem().click();
      await items.field('SKU').fill(existing.sku);
      await items.save().click();
      await expect(items.modalError()).toHaveText('Name is required');
      await items.field('Name').fill('Copy');
      await items.save().click();
      await expect(items.modalError()).toContainText(`SKU ${existing.sku} already exists`);
      await expect(items.modal()).toBeVisible();
      await items.modal().getByRole('button', { name: 'Cancel' }).click();
      await expect(items.modal()).toBeHidden();
    },
  );

  test(
    'editing changes the reorder point; deactivating hides the item until "Include inactive"',
    { tag: ['@REQ-005', '@REQ-030'] },
    async ({ page, factory }) => {
      const item = await factory.item({ reorderPoint: 1 });
      const items = new ItemsPage(page);
      await items.goto(`?q=${item.sku}`);
      await items.row(item.sku).getByRole('button', { name: 'Edit' }).click();
      await expect(items.modal()).toContainText(`Edit ${item.sku}`);
      await items.field('Reorder point').fill('25');
      await items.save().click();
      await items.expectSuccess(`Item ${item.sku} updated`);
      await expect(items.row(item.sku).locator('td').nth(6)).toHaveText('25');

      await items.row(item.sku).getByRole('button', { name: 'Deactivate' }).click();
      await items.expectSuccess(`${item.sku} deactivated`);
      await expect(items.row(item.sku)).toHaveCount(0);
      await items.includeInactive().check();
      await expect(items.row(item.sku)).toBeVisible();
      await expect(items.row(item.sku).locator('.badge', { hasText: 'Inactive' })).toBeVisible();
      await items.row(item.sku).getByRole('button', { name: 'Activate' }).click();
      await items.expectSuccess(`${item.sku} reactivated`);
    },
  );

  test(
    'the low-stock view from the dashboard shows only flagged items',
    { tag: '@REQ-008' },
    async ({ page }) => {
      const items = new ItemsPage(page);
      await items.goto('?lowStock=true');
      await expect(items.rows().first()).toBeVisible();
      const n = await items.rows().count();
      await expect(items.rows().locator('.badge', { hasText: 'Low' })).toHaveCount(n);
      await expect(items.row('KITE-DELTA')).toBeVisible();
    },
  );
});
