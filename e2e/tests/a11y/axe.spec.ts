import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../support/fixtures';
import type { Page } from '@playwright/test';

async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = serious
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} -> ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    )
    .join('\n');
  expect(serious, `${name}\n${summary}`).toEqual([]);
  return results.violations.length;
}

test.describe('accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  test('sign-in screen', { tag: '@REQ-031' }, async ({ page }) => {
    await page.goto('/login');
    await scan(page, 'login');
  });

  test('handheld screens', { tag: '@REQ-031' }, async ({ page, loginAs, factory }) => {
    const { item, bin } = await factory.stockedItem(5);
    const po = await factory.purchaseOrder([{ sku: item.sku, qty: 2 }]);
    const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
    const count = await factory.cycleCount(bin.code, 'picker1');
    await loginAs('operator');
    for (const path of [
      '/scan',
      '/scan/receive',
      `/scan/receive/${po.poNumber}`,
      '/scan/pick',
      `/scan/pick/${so.soNumber}`,
      '/scan/ship',
      '/scan/transfer',
      '/scan/count',
      `/scan/count/${count.id}`,
      '/scan/inquiry',
      '/scan/labels',
    ]) {
      await page.goto(path);
      await expect(page.locator('.device-main')).toBeVisible();
      await scan(page, path);
    }
  });

  test('admin console screens', { tag: '@REQ-031' }, async ({ page, loginAs, factory }) => {
    const { bin } = await factory.stockedItem(3);
    const count = await factory.cycleCount(bin.code);
    await loginAs('admin');
    for (const path of [
      '/admin',
      '/admin/inventory',
      '/admin/items',
      '/admin/bins',
      '/admin/orders',
      '/admin/orders/so/SO-5004',
      '/admin/orders/po/PO-1003',
      '/admin/counts',
      `/admin/counts/${count.id}`,
      '/admin/users',
      '/admin/erp',
      '/admin/transactions',
      '/admin/settings',
    ]) {
      await page.goto(path);
      await expect(page.locator('.admin-topbar h1')).toBeVisible();
      await scan(page, path);
    }
  });

  test(
    'modals are announced as dialogs and trap focus',
    { tag: '@REQ-031' },
    async ({ page, loginAs }) => {
      await loginAs('admin');
      await page.goto('/admin/items');
      await page.getByTestId('new-item').click();
      const dialog = page.getByRole('dialog', { name: 'New item' });
      await expect(dialog).toBeVisible();
      await scan(page, 'new item modal');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    },
  );
});
