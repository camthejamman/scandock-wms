import { expect, test } from '../../support/fixtures';
import { LoginPage } from '../../pages/login.page';
import { InquiryPage, MenuPage, ReceivePage } from '../../pages/scanner.pages';
import { DashboardPage } from '../../pages/admin.pages';

/** Cross-browser smoke: the critical path must work in Firefox and WebKit too. */
test.describe('critical path', () => {
  test(
    'operator: sign in, open receiving, look up an item, sign out',
    { tag: '@smoke' },
    async ({ page, browserName }) => {
      const login = new LoginPage(page);
      await login.login('picker1', '1234');
      const menu = new MenuPage(page);
      await expect(menu.tiles()).toHaveCount(7);
      await menu.tile('Receive').click();
      const receive = new ReceivePage(page);
      await expect(receive.poRows().first()).toBeVisible();
      await menu.back().click();
      await menu.tile('Inquiry').click();
      const inquiry = new InquiryPage(page);
      await inquiry.lookup('TOY-ROBOT-RED');
      await expect(inquiry.itemResult()).toContainText('Robo Rex');
      await menu.signOut().click();
      await expect(page).toHaveURL(/\/login/);
      test.info().annotations.push({ type: 'browser', description: browserName });
    },
  );

  test('admin: sign in and read the dashboard', { tag: '@smoke' }, async ({ page }) => {
    const login = new LoginPage(page);
    await login.login('admin', '1234');
    const dash = new DashboardPage(page);
    await expect(dash.title()).toHaveText('Dashboard');
    await expect(dash.kpiValue('units')).toHaveText(/^[\d,]+$/);
    await expect(dash.recent().locator('tbody tr').first()).toBeVisible();
  });
});
