import { expect, test } from '../../support/fixtures';
import { LabelPage } from '../../pages/scanner.pages';

test.describe('labels on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    'an item label is generated as UPC-A ZPL and can be sent to the printer',
    { tag: '@REQ-027' },
    async ({ page, api }) => {
      const item = await api.getOk('/items/TOY-ROBOT-RED');
      const labels = new LabelPage(page);
      await labels.goto();
      await labels.lookup(item.barcode);
      await expect(labels.result()).toContainText('TOY-ROBOT-RED');
      await expect(labels.result()).toContainText('item label');
      await expect(labels.zpl()).toContainText('^BUN');
      await expect(labels.zpl()).toContainText(item.barcode.slice(0, 11));
      await labels.print().click();
      await labels.expectSuccess('Sent to printer');
    },
  );

  test('a bin label uses Code 128 and shows the zone', { tag: '@REQ-027' }, async ({ page }) => {
    const labels = new LabelPage(page);
    await labels.goto();
    await labels.lookup('p-02-04');
    await expect(labels.result()).toContainText('P-02-04');
    await expect(labels.result()).toContainText('Zone: PICKING');
    await expect(labels.zpl()).toContainText('^BCN');
  });

  test('unknown codes are reported', { tag: '@REQ-027' }, async ({ page }) => {
    const labels = new LabelPage(page);
    await labels.goto();
    await labels.lookup('NOPE-LABEL');
    await labels.expectError('Nothing found for NOPE-LABEL');
    await expect(labels.result()).toHaveCount(0);
  });
});
