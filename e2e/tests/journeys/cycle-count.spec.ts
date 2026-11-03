import { expect, test } from '../../support/fixtures';
import { CountDetailPage, CountsPage } from '../../pages/admin.pages';
import { CountPage } from '../../pages/scanner.pages';

test(
  'cycle count: supervisor assigns, operator counts short, supervisor approves, ERP gets the adjustment',
  { tag: ['@REQ-020', '@REQ-021', '@REQ-025'] },
  async ({ page, api, erp, factory, loginAs }) => {
    const { item, bin } = await factory.stockedItem(12);
    let countId = 0;

    await test.step('supervisor creates the count', async () => {
      await loginAs('supervisor');
      const counts = new CountsPage(page);
      await counts.goto();
      await counts.newCount().click();
      await page.getByLabel('Bin to count').fill(bin.code);
      await page.getByLabel('Assign to').selectOption({ label: 'Pat Picker (picker1)' });
      await counts.save().click();
      const toast = counts.successToast().last();
      countId = Number((await toast.innerText()).match(/#(\d+)/)![1]);
    });

    await test.step('operator finds two fewer than expected', async () => {
      await loginAs('operator');
      const count = new CountPage(page);
      await count.goto();
      await page.locator(`[data-testid="count-row"]:has-text("Count #${countId} ")`).click();
      await expect(count.line(item.sku)).toContainText('expected 12');
      await count.countedInput(item.sku).fill('10');
      await count.submit().click();
      await expect(count.result()).toContainText('1 with variance');
    });

    await test.step('supervisor approves; stock and the ERP are corrected', async () => {
      await loginAs('supervisor');
      const detail = new CountDetailPage(page);
      await detail.goto(countId);
      await expect(detail.lines().first()).toHaveAttribute('data-variance', '-2');
      await detail.approve().click();
      await detail.confirmReview().click();
      await detail.expectSuccess('approved (1 adjustment(s) posted)');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0].qtyOnHand).toBe(10);
      await api.postOk('/erp/sync');
      const adjustments = await erp.json<any[]>('/erp/inventory-adjustments');
      const mine = adjustments.find((a) => a.payload.reference === `CC-${countId}`);
      expect(mine.payload.lines).toEqual([{ sku: item.sku, bin: bin.code, lot: '', qtyDelta: -2 }]);
    });
  },
);
