import { expect, test } from '../../support/fixtures';
import { InquiryPage } from '../../pages/scanner.pages';

test.describe('inventory inquiry on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    'an item scan shows totals and every bin it lives in',
    { tag: ['@smoke', '@REQ-007'] },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(7);
      const other = await factory.bin('STORAGE');
      await factory.stock(item.sku, other.code, 3);
      const inquiry = new InquiryPage(page);
      await inquiry.goto();
      await inquiry.lookup(item.barcode);
      await expect(inquiry.itemResult()).toContainText(item.sku);
      await expect(inquiry.onHand()).toHaveText('10 EA');
      const rows = inquiry.itemResult().locator('tbody tr');
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText(bin.code); // picking bin first
      await expect(rows.nth(1)).toContainText(other.code);
      expect((await api.getOk(`/inventory/item/${item.sku}`)).qtyOnHand).toBe(10);
    },
  );

  test('a bin scan lists its contents', { tag: '@REQ-007' }, async ({ page, factory }) => {
    const { item, bin } = await factory.stockedItem(2);
    const inquiry = new InquiryPage(page);
    await inquiry.goto();
    await inquiry.lookup(bin.code.toLowerCase());
    await expect(inquiry.binResult()).toContainText(bin.code);
    await expect(inquiry.binResult()).toContainText('1 item(s) · 2 units');
    await expect(inquiry.binResult().locator('tbody tr')).toContainText(item.sku);
  });

  test(
    'empty bins and unknown codes are handled',
    { tag: '@REQ-007' },
    async ({ page, factory }) => {
      const empty = await factory.bin();
      const inquiry = new InquiryPage(page);
      await inquiry.goto();
      await inquiry.lookup(empty.code);
      await expect(inquiry.binResult()).toContainText('Empty bin');
      await inquiry.lookup('ZZZ-NOTHING');
      await inquiry.expectError('Nothing found for ZZZ-NOTHING');
      await expect(inquiry.binResult()).toHaveCount(0);
    },
  );

  test(
    'recent lookups are one tap away and low stock is flagged',
    { tag: ['@REQ-007', '@REQ-008'] },
    async ({ page }) => {
      const inquiry = new InquiryPage(page);
      await inquiry.goto();
      await inquiry.lookup('KITE-DELTA');
      await expect(inquiry.itemResult().getByText('Low stock')).toBeVisible();
      await inquiry.lookup('A-01-01');
      await expect(inquiry.binResult()).toBeVisible();
      await page.getByRole('button', { name: 'KITE-DELTA', exact: true }).click();
      await expect(inquiry.itemResult()).toContainText('Delta Kite');
    },
  );
});
