import { expect, test } from '../../support/fixtures';
import { AdminShell } from '../../pages/admin.pages';

test.describe('admin navigation', () => {
  test.use({ storageState: '.auth/admin.json' });

  test(
    'every nav entry opens its screen and is highlighted',
    { tag: '@REQ-030' },
    async ({ page }) => {
      const shell = new AdminShell(page);
      await page.goto('/admin');
      const entries: Array<[string, string, string]> = [
        ['Inventory', '/admin/inventory', 'Inventory'],
        ['Items', '/admin/items', 'Items'],
        ['Bins', '/admin/bins', 'Bins'],
        ['Orders', '/admin/orders', 'Orders'],
        ['Cycle Counts', '/admin/counts', 'Cycle counts'],
        ['Transactions', '/admin/transactions', 'Transactions'],
        ['ERP Sync', '/admin/erp', 'ERP sync'],
        ['Users', '/admin/users', 'Users'],
        ['Settings', '/admin/settings', 'Settings'],
        ['Dashboard', '/admin', 'Dashboard'],
      ];
      for (const [label, path, title] of entries) {
        await shell.navLink(label).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(shell.title()).toHaveText(title);
        await expect(shell.navLink(label)).toHaveClass(/active/);
      }
    },
  );

  test(
    '"Open scanner" switches to the handheld and sign out ends the session',
    { tag: '@REQ-029' },
    async ({ page }) => {
      const shell = new AdminShell(page);
      await page.goto('/admin');
      await shell.nav().getByRole('link', { name: 'Open scanner' }).click();
      await expect(page).toHaveURL(/\/scan$/);
      await page.goto('/admin');
      await shell.nav().getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/);
    },
  );
});
