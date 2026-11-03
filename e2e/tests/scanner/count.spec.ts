import { expect, test } from '../../support/fixtures';
import { CountPage } from '../../pages/scanner.pages';

test.describe('cycle counts on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    "the list shows counts assigned to me or to nobody, not other people's",
    { tag: ['@REQ-003', '@REQ-020'] },
    async ({ page, factory }) => {
      const mine = await factory.cycleCount((await factory.stockedItem(1)).bin.code, 'picker1');
      const nobodys = await factory.cycleCount((await factory.stockedItem(1)).bin.code);
      const theirs = await factory.cycleCount((await factory.stockedItem(1)).bin.code, 'receiver1');
      const count = new CountPage(page);
      await count.goto();
      await expect(
        page.locator(`[data-testid="count-row"]:has-text("Count #${mine.id} ")`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-testid="count-row"]:has-text("Count #${nobodys.id} ")`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-testid="count-row"]:has-text("Count #${theirs.id} ")`),
      ).toHaveCount(0);
    },
  );

  test(
    'enter counted quantities, submit, review the variances',
    { tag: ['@smoke', '@REQ-020', '@REQ-029'] },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const other = await factory.item();
      await factory.stock(other.sku, bin.code, 4);
      const created = await factory.cycleCount(bin.code, 'picker1');
      const count = new CountPage(page);
      await count.gotoCount(created.id);
      await expect(page.getByText(`Bin ${bin.code}`)).toBeVisible();
      await expect(count.lines()).toHaveCount(2);
      await expect(count.line(item.sku)).toContainText('expected 10');

      await count.countedInput(item.sku).fill('8');
      await count.countedInput(other.sku).fill('4');
      await expect(page.getByText('2/2 counted')).toBeVisible();
      await count.submit().click();
      await expect(count.result()).toBeVisible();
      await expect(count.result()).toContainText('2 lines · 1 with variance · net -2');
      const rows = count.result().locator('tbody tr');
      await expect(rows.filter({ hasText: item.sku })).toContainText('-2');
      await expect(rows.filter({ hasText: other.sku })).toContainText('0');
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL(/\/scan\/count$/);
      await expect(
        page.locator(`[data-testid="count-row"]:has-text("Count #${created.id} ")`),
      ).toHaveCount(0);
      expect(await api.getOk(`/cycle-counts/${created.id}`)).toMatchObject({
        status: 'SUBMITTED',
        submittedBy: 'Pat Picker',
      });
    },
  );

  test(
    'uncounted lines prompt a confirmation and are recorded as zero',
    { tag: '@REQ-020' },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(6);
      const other = await factory.item();
      await factory.stock(other.sku, bin.code, 3);
      const created = await factory.cycleCount(bin.code, 'picker1');
      const count = new CountPage(page);
      await count.gotoCount(created.id);
      await count.countedInput(item.sku).fill('6');
      await count.submit().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(`1 line(s) have no count: ${other.sku}`);
      await dialog.getByRole('button', { name: 'Keep counting' }).click();
      await expect(dialog).toBeHidden();
      await count.submit().click();
      await count.confirmSubmit().click();
      await expect(count.result()).toBeVisible();
      const detail = await api.getOk(`/cycle-counts/${created.id}`);
      expect(detail.lines.find((l: any) => l.sku === other.sku)).toMatchObject({
        countedQty: 0,
        variance: -3,
      });
    },
  );

  test(
    'scanning an item adds one each time; unknown items are refused; new finds get a line',
    { tag: '@REQ-020' },
    async ({ page, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const found = await factory.item();
      const created = await factory.cycleCount(bin.code, 'picker1');
      const count = new CountPage(page);
      await count.gotoCount(created.id);
      await count.scanItem(item.barcode);
      await count.scanItem(item.barcode);
      await expect(count.countedInput(item.sku)).toHaveValue('2');
      await count.scanItem('NOPE-ITEM');
      await count.expectError('No item with SKU or barcode "NOPE-ITEM"');
      await count.scanItem(found.sku);
      await expect(count.lines()).toHaveCount(2);
      await expect(count.line(found.sku)).toContainText('expected 0');
      await expect(count.countedInput(found.sku)).toHaveValue('1');
    },
  );

  test(
    'lot-tracked items ask for the lot when scanned',
    { tag: '@REQ-011' },
    async ({ page, api, factory }) => {
      const { item, bin, lot } = await factory.stockedItem(4, { lotTracked: true });
      const created = await factory.cycleCount(bin.code, 'picker1');
      const count = new CountPage(page);
      await count.gotoCount(created.id);
      await expect(count.line(item.sku)).toContainText(`lot ${lot}`);
      await count.scanItem(item.sku);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(`Lot for ${item.sku}`);
      await dialog.getByLabel('Lot number').fill(lot!.toLowerCase());
      await dialog.getByRole('button', { name: 'Add' }).click();
      await expect(count.countedInput(item.sku)).toHaveValue('1');
      await count.countedInput(item.sku).fill('4');
      await count.submit().click();
      await expect(count.result()).toBeVisible();
      expect((await api.getOk(`/cycle-counts/${created.id}`)).lines[0]).toMatchObject({
        lot,
        countedQty: 4,
        variance: 0,
      });
    },
  );

  test(
    'a count that is no longer open shows its status instead of the form',
    { tag: '@REQ-020' },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const created = await factory.cycleCount(bin.code, 'picker1');
      await api.postOk(`/cycle-counts/${created.id}/submit`, {
        lines: [{ sku: item.sku, countedQty: 2 }],
      });
      const count = new CountPage(page);
      await count.gotoCount(created.id);
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: `Count #${created.id} for ${bin.code} is submitted` }),
      ).toBeVisible();
      await expect(count.submit()).toHaveCount(0);
    },
  );
});
