import { expect, test } from '../../support/fixtures';
import { LoginPage } from '../../pages/login.page';
import { MenuPage } from '../../pages/scanner.pages';

test.describe('sign in on the handheld', () => {
  test(
    'an operator signs in and lands on the task menu',
    { tag: ['@smoke', '@REQ-001', '@REQ-029'] },
    async ({ page }) => {
      const login = new LoginPage(page);
      await expect.soft(login.demoHint()).toBeVisible({ visible: false }); // page not opened yet
      await login.login('picker1', '1234');
      await expect(page).toHaveURL(/\/scan$/);
      const menu = new MenuPage(page);
      await expect(menu.greeting()).toHaveText('Hi, Pat');
      await expect(menu.tiles()).toHaveCount(7);
      await expect(menu.footer()).toContainText('Pat Picker · operator');
      await expect(menu.adminLink()).toHaveCount(0);
    },
  );

  test(
    'a wrong PIN shows an error and clears the PIN field',
    { tag: '@REQ-001' },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.login('picker1', '0000');
      await expect(login.error()).toHaveText('Username or PIN is incorrect');
      await expect(login.pin()).toHaveValue('');
      await expect(login.username()).toHaveValue('picker1');
      await expect(page).toHaveURL(/\/login/);
    },
  );

  test(
    'an empty form is rejected before calling the server',
    { tag: '@REQ-001' },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.goto();
      let loginCalls = 0;
      page.on('request', (r) => {
        if (r.url().includes('/api/auth/login')) loginCalls++;
      });
      await login.submit().click();
      await expect(login.error()).toHaveText('Enter your username and PIN');
      expect(loginCalls).toBe(0);
    },
  );

  test('a deactivated user is told their account is off', { tag: '@REQ-002' }, async ({ page }) => {
    const login = new LoginPage(page);
    await login.login('inactive', '1234');
    await expect(login.error()).toContainText('deactivated');
  });

  test(
    'admins land on the console and supervisors get an Admin shortcut on the menu',
    { tag: '@REQ-003' },
    async ({ page }) => {
      const login = new LoginPage(page);
      await login.login('admin', '1234');
      await expect(page).toHaveURL(/\/admin$/);
      await page.goto('/scan');
      await expect(new MenuPage(page).adminLink()).toBeVisible();
    },
  );

  test(
    'protected screens redirect to sign-in and come back afterwards',
    { tag: '@REQ-001' },
    async ({ page }) => {
      await page.goto('/scan/receive');
      await expect(page).toHaveURL(/\/login\?next=%2Fscan%2Freceive/);
      const login = new LoginPage(page);
      await login.username().fill('receiver1');
      await login.pin().fill('1234');
      await login.submit().click();
      await expect(page).toHaveURL(/\/scan\/receive$/);
      await expect(new MenuPage(page).heading()).toHaveText('Receiving');
    },
  );

  test('sign out forgets the session', { tag: '@REQ-001' }, async ({ page, loginAs }) => {
    await loginAs('operator');
    const menu = new MenuPage(page);
    await menu.goto();
    await expect(menu.greeting()).toBeVisible();
    await menu.signOut().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/scan');
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('scandock.token'))).toBeNull();
  });

  test('the session survives a reload', { tag: '@REQ-001' }, async ({ page, loginAs }) => {
    await loginAs('operator');
    const menu = new MenuPage(page);
    await menu.goto();
    await expect(menu.greeting()).toBeVisible();
    await page.reload();
    await expect(menu.greeting()).toHaveText('Hi, Pat');
  });

  test(
    'a token that the server no longer accepts sends you back to sign-in',
    { tag: '@REQ-002' },
    async ({ page }) => {
      await page.goto('/login');
      await page.evaluate(() => localStorage.setItem('scandock.token', 'stale.token.value'));
      await page.goto('/scan');
      await expect(page).toHaveURL(/\/login/);
      await expect(new LoginPage(page).username()).toBeVisible();
    },
  );
});
