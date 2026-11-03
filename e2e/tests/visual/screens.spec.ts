import { expect, test } from '../../support/fixtures';

/**
 * Screenshot comparisons. Fonts and anti-aliasing differ between machines, so the
 * baselines are generated and compared inside the Playwright Docker image only
 * (npm run test:e2e:docker). Locally these tests are skipped unless PW_VISUAL=1.
 */
test.describe('visual regression', () => {
  test.skip(
    !process.env.PW_VISUAL,
    'set PW_VISUAL=1 (the Docker e2e image does) to run visual comparisons',
  );

  test('sign-in screen', { tag: '@REQ-029' }, async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test(
    'handheld menu and empty transfer screen',
    { tag: '@REQ-029' },
    async ({ page, loginAs }) => {
      await loginAs('operator');
      await page.setViewportSize({ width: 412, height: 915 });
      await page.goto('/scan');
      await expect(page.getByRole('heading', { name: /^Hi, / })).toBeVisible();
      await expect(page).toHaveScreenshot('scanner-menu.png', { fullPage: true });
      await page.goto('/scan/transfer');
      await expect(page.getByTestId('scan-item')).toBeVisible();
      await expect(page).toHaveScreenshot('scanner-transfer.png', { fullPage: true });
    },
  );

  test(
    'admin settings and dashboard KPI tiles (dynamic numbers masked)',
    { tag: '@REQ-030' },
    async ({ page, loginAs }) => {
      await loginAs('admin');
      await page.goto('/admin/settings');
      await expect(page.getByTestId('save-settings')).toBeVisible();
      await expect(page).toHaveScreenshot('admin-settings.png');
      await page.goto('/admin');
      await expect(page.getByTestId('recent-transactions')).toBeVisible();
      // The tables below the tiles grow and shrink with test data, so only the KPI grid is compared.
      await expect(page.locator('.kpi-grid')).toHaveScreenshot('admin-dashboard-kpis.png', {
        mask: [page.locator('.kpi-value'), page.locator('.kpi-sub')],
      });
    },
  );
});
