import { expect, test } from '../../support/fixtures';
import { AdminShell, UsersPage } from '../../pages/admin.pages';
import { uid } from '../../support/env';

test.describe('admin users', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'create a user, change their role, reset their PIN, deactivate and reactivate',
    { tag: ['@REQ-033'] },
    async ({ page, apiAs }) => {
      const username = uid('ui').toLowerCase();
      const users = new UsersPage(page);
      await users.goto();
      await users.newUser().click();
      await page.getByLabel('Username').fill(username.toUpperCase());
      await page.getByLabel('Display name').fill('UI Person');
      await users.modal().getByLabel('Role', { exact: true }).selectOption('operator');
      await page.getByLabel(/^PIN/).fill('5555');
      await users.save().click();
      await users.expectSuccess(`User ${username} created`);
      const row = users.row(username);
      await expect(row).toContainText('UI Person');

      await row.getByLabel(`Role for ${username}`).selectOption('supervisor');
      await users.expectSuccess(`${username} is now supervisor`);

      await row.getByRole('button', { name: 'Reset PIN' }).click();
      await page.getByLabel('New PIN').fill('7777');
      await page.getByRole('button', { name: 'Save PIN' }).click();
      await users.expectSuccess(`PIN reset for ${username}`);
      const anon = await apiAs('anonymous');
      expect((await anon.post('/auth/login', { username, pin: '5555' })).status).toBe(401);
      expect((await anon.post('/auth/login', { username, pin: '7777' })).body.user.role).toBe(
        'supervisor',
      );

      await row.getByTestId('toggle-active').click();
      await users.expectSuccess(`${username} deactivated`);
      await expect(row.locator('.badge', { hasText: 'Inactive' })).toBeVisible();
      expect((await anon.post('/auth/login', { username, pin: '7777' })).status).toBe(403);
      await row.getByTestId('toggle-active').click();
      await users.expectSuccess(`${username} reactivated`);
    },
  );

  test(
    'the signed-in admin cannot change their own role or deactivate themselves',
    { tag: '@REQ-033' },
    async ({ page }) => {
      const users = new UsersPage(page);
      await users.goto();
      const me = users.row('admin');
      await expect(me.getByLabel('Role for admin')).toBeDisabled();
      await expect(me.getByTestId('toggle-active')).toBeDisabled();
    },
  );

  test(
    'duplicate usernames and bad PINs are explained in the modal',
    { tag: '@REQ-033' },
    async ({ page }) => {
      const users = new UsersPage(page);
      await users.goto();
      await users.newUser().click();
      await page.getByLabel('Username').fill('picker1');
      await page.getByLabel('Display name').fill('Twin');
      await page.getByLabel(/^PIN/).fill('12');
      await users.save().click();
      await expect(users.modalError()).toContainText('PIN must be 4 to 6 digits');
      await page.getByLabel(/^PIN/).fill('1234');
      await users.save().click();
      await expect(users.modalError()).toContainText('Username picker1 is taken');
    },
  );
});

test.describe('admin users as supervisor', () => {
  test.use({ storageState: '.auth/supervisor.json' });

  test(
    'supervisors do not get the Users and Settings entries',
    { tag: '@REQ-003' },
    async ({ page }) => {
      const shell = new AdminShell(page);
      await page.goto('/admin');
      await expect(shell.navLink('Dashboard')).toBeVisible();
      await expect(shell.navLink('Users')).toHaveCount(0);
      await expect(shell.navLink('Settings')).toHaveCount(0);
      await page.goto('/admin/users');
      await page.getByTestId('new-user').click();
      await page.getByLabel('Username').fill(uid('s').toLowerCase());
      await page.getByLabel('Display name').fill('Nope');
      await page.getByLabel(/^PIN/).fill('1234');
      await page.getByTestId('save-user').click();
      await expect(shell.modalError()).toContainText('admin');
    },
  );
});
