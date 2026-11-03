import { expect, test } from '../../support/fixtures';
import { BinsPage } from '../../pages/admin.pages';
import { uid } from '../../support/env';

test.describe('admin bins', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'bins can be created, filtered by zone and labelled',
    { tag: ['@REQ-006', '@REQ-027'] },
    async ({ page }) => {
      const code = uid('UB');
      const bins = new BinsPage(page);
      await bins.goto();
      await bins.newBin().click();
      await page.getByLabel('Bin code').fill(code.toLowerCase());
      await page.locator('#bin-zone').selectOption('QUARANTINE');
      await bins.save().click();
      await bins.expectSuccess(`Bin ${code} created`);
      await bins.zoneFilter().selectOption('QUARANTINE');
      await expect(bins.row(code)).toBeVisible();
      await expect(bins.row(code)).toContainText('QUARANTINE');
      await expect(
        bins.rows().locator('td:nth-child(2)').filter({ hasNotText: 'QUARANTINE' }),
      ).toHaveCount(0);

      await bins.row(code).getByRole('button', { name: 'Label' }).click();
      await expect(bins.modal()).toContainText(`Label for ${code}`);
      await expect(bins.modal().getByTestId('zpl')).toContainText(`^FD${code}^FS`);
      await page.keyboard.press('Escape');
      await expect(bins.modal()).toBeHidden();
    },
  );

  test('duplicate codes are refused in the modal', { tag: '@REQ-006' }, async ({ page }) => {
    const bins = new BinsPage(page);
    await bins.goto();
    await bins.newBin().click();
    await page.getByLabel('Bin code').fill('A-01-01');
    await bins.save().click();
    await expect(bins.modalError()).toContainText('Bin A-01-01 already exists');
  });

  test(
    'a bin with stock cannot be deactivated; an empty one can',
    { tag: '@REQ-006' },
    async ({ page, factory }) => {
      const { bin } = await factory.stockedItem(1);
      const empty = await factory.bin('STORAGE');
      const bins = new BinsPage(page);
      await bins.goto();
      await bins.row(bin.code).getByRole('button', { name: 'Deactivate' }).click();
      await bins.expectError('Move the stock out before deactivating this bin');
      await bins.row(empty.code).getByRole('button', { name: 'Deactivate' }).click();
      await bins.expectSuccess(`${empty.code} deactivated`);
      await expect(bins.row(empty.code)).toHaveCount(0);
      await page.getByLabel('Include inactive').check();
      await expect(bins.row(empty.code).locator('.badge', { hasText: 'Inactive' })).toBeVisible();
    },
  );
});
