import { expect, test } from '../../support/fixtures';
import { CountDetailPage, CountsPage } from '../../pages/admin.pages';

test.describe('admin cycle counts', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'a supervisor creates a count for a bin and assigns it',
    { tag: ['@REQ-020'] },
    async ({ page, api, factory }) => {
      const { item, bin } = await factory.stockedItem(9);
      const counts = new CountsPage(page);
      await counts.goto();
      await counts.newCount().click();
      await page.getByLabel('Bin to count').fill(bin.code.toLowerCase());
      await page.getByLabel('Assign to').selectOption({ label: 'Pat Picker (picker1)' });
      await counts.save().click();
      const toast = counts.successToast().last();
      await expect(toast).toContainText(`created for ${bin.code}`);
      const id = Number((await toast.innerText()).match(/#(\d+)/)![1]);
      await counts.tab('OPEN').click();
      const row = counts.rows().filter({ hasText: bin.code });
      await expect(row).toContainText('Pat Picker');
      await row.getByRole('link').click();
      const detail = new CountDetailPage(page);
      await expect(detail.title()).toContainText(`Count #${id}`);
      await expect(detail.lines()).toHaveCount(1);
      await expect(detail.lines().first()).toContainText(item.sku);
      await expect(detail.lines().first().locator('td').nth(3)).toHaveText('9');
      expect((await api.getOk(`/cycle-counts/${id}`)).assignedTo).toBe('Pat Picker');
    },
  );

  test(
    'a bin with a count in progress cannot get another one',
    { tag: '@REQ-020' },
    async ({ page, factory }) => {
      const { bin } = await factory.stockedItem(1);
      await factory.cycleCount(bin.code);
      const counts = new CountsPage(page);
      await counts.goto();
      await counts.newCount().click();
      await page.getByLabel('Bin to count').fill(bin.code);
      await counts.save().click();
      await expect(counts.modalError()).toContainText('already has a count in progress');
    },
  );

  test(
    'approving a submitted count posts the adjustments',
    { tag: ['@smoke', '@REQ-021'] },
    async ({ page, api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(10);
      const created = await factory.cycleCount(bin.code, 'picker1');
      await (
        await apiAs('operator')
      ).postOk(`/cycle-counts/${created.id}/submit`, { lines: [{ sku: item.sku, countedQty: 7 }] });

      const counts = new CountsPage(page);
      await counts.goto('SUBMITTED');
      const row = counts.rows().filter({ hasText: bin.code });
      await expect(row).toHaveAttribute('data-status', 'SUBMITTED');
      await expect(row.locator('td').nth(6)).toHaveText('1');

      const detail = new CountDetailPage(page);
      await detail.goto(created.id);
      await expect(detail.summary()).toContainText('Net variance');
      await expect(detail.summary()).toContainText('-3');
      await expect(detail.lines().first()).toHaveAttribute('data-variance', '-3');
      await detail.approve().click();
      await detail.notes().fill('Verified on the floor');
      await detail.confirmReview().click();
      await detail.expectSuccess(`Count #${created.id} approved (1 adjustment(s) posted)`);
      await expect(detail.title()).toContainText('Approved');
      await expect(detail.approve()).toHaveCount(0);
      await expect(page.getByText('Verified on the floor')).toBeVisible();
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(7);
    },
  );

  test(
    'rejecting a count leaves stock alone',
    { tag: '@REQ-021' },
    async ({ page, api, apiAs, factory }) => {
      const { item, bin } = await factory.stockedItem(5);
      const created = await factory.cycleCount(bin.code, 'picker1');
      await (
        await apiAs('operator')
      ).postOk(`/cycle-counts/${created.id}/submit`, { lines: [{ sku: item.sku, countedQty: 0 }] });
      const detail = new CountDetailPage(page);
      await detail.goto(created.id);
      await detail.reject().click();
      await detail.notes().fill('Wrong shelf counted');
      await detail.confirmReview().click();
      await detail.expectSuccess(`Count #${created.id} rejected`);
      await expect(detail.title()).toContainText('Rejected');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(5);
      const counts = new CountsPage(page);
      await counts.goto('REJECTED');
      await expect(counts.rows().filter({ hasText: bin.code })).toBeVisible();
    },
  );
});
