import { expect, test } from '../../support/fixtures';
import { DashboardPage } from '../../pages/admin.pages';

test.describe('admin dashboard', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'KPI tiles show numbers and link to the right screens',
    { tag: ['@smoke', '@REQ-026', '@REQ-030'] },
    async ({ page }) => {
      const dash = new DashboardPage(page);
      await dash.goto();
      await expect(dash.title()).toHaveText('Dashboard');
      for (const id of ['open-pos', 'to-pick', 'shipped', 'counts', 'units', 'low-stock']) {
        await expect(dash.kpiValue(id), id).toHaveText(/^[\d,]+$/);
      }
      await expect(dash.kpiValue('accuracy')).toHaveText(/^(\d+\.\d%|—)$/);
      await expect(dash.kpiValue('erp')).toHaveText('Online');
      await expect(page.getByText(/^Updated /)).toBeVisible();

      await dash.kpi('open-pos').click();
      await expect(page).toHaveURL(/\/admin\/orders\?tab=po$/);
      await dash.goto();
      await dash.kpi('low-stock').click();
      await expect(page).toHaveURL(/\/admin\/items\?lowStock=true$/);
    },
  );

  test(
    'recent transactions and low stock tables are populated from live data',
    { tag: '@REQ-026' },
    async ({ page, api }) => {
      const dash = new DashboardPage(page);
      await dash.goto();
      await expect(dash.recent().locator('tbody tr')).toHaveCount(8);
      await expect(dash.recent().locator('tbody tr').first().locator('.badge')).toBeVisible();
      const low = await api.getOk('/items', { lowStock: 'true', active: 'true', pageSize: 6 });
      for (const item of low.data) await expect(dash.lowStock()).toContainText(item.sku);
      await expect(
        dash.lowStock().locator('tbody tr').filter({ hasText: 'KITE-DELTA' }),
      ).toContainText('10');
    },
  );

  test('the ERP tile reflects queued documents', { tag: '@REQ-025' }, async ({ page, api }) => {
    const dash = new DashboardPage(page);
    await dash.goto();
    await expect(dash.kpi('erp')).toContainText(/(\d+ document\(s\) queued|outbox empty)/);
    const d = await api.getOk('/reports/dashboard');
    expect(typeof d.erpOutboxPending).toBe('number');
  });
});
