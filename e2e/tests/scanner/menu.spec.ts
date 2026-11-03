import { expect, test } from '../../support/fixtures';
import { MenuPage } from '../../pages/scanner.pages';

test.describe('task menu', () => {
  test.use({ storageState: '.auth/operator.json' });

  const tiles: Array<[string, string, string]> = [
    ['Receive', '/scan/receive', 'Receiving'],
    ['Pick', '/scan/pick', 'Picking'],
    ['Ship', '/scan/ship', 'Shipping'],
    ['Transfer', '/scan/transfer', 'Bin Transfer'],
    ['Count', '/scan/count', 'Cycle Counts'],
    ['Inquiry', '/scan/inquiry', 'Inventory Inquiry'],
    ['Labels', '/scan/labels', 'Print Labels'],
  ];

  for (const [name, path, title] of tiles) {
    test(
      `${name} tile opens ${path} and Back returns to the menu`,
      { tag: '@REQ-029' },
      async ({ page }) => {
        const menu = new MenuPage(page);
        await menu.goto();
        await menu.tile(name).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(menu.heading()).toHaveText(title);
        await menu.back().click();
        await expect(page).toHaveURL(/\/scan$/);
        await expect(menu.greeting()).toBeVisible();
      },
    );
  }

  test(
    'the handheld frame fits a phone screen without horizontal scrolling',
    { tag: '@REQ-029' },
    async ({ page }) => {
      const menu = new MenuPage(page);
      await menu.goto();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await menu.tile('Receive').boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44); // comfortable tap target
    },
  );

  test(
    'operators who open the admin console are turned away politely',
    { tag: '@REQ-003' },
    async ({ page }) => {
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Supervisor access required' })).toBeVisible();
      await page.getByRole('link', { name: 'Back to the scanner' }).click();
      await expect(page).toHaveURL(/\/scan$/);
    },
  );

  test(
    'an unknown route shows the not-found screen with a way back',
    { tag: '@REQ-029' },
    async ({ page }) => {
      await page.goto('/scan/teleport');
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await page.getByRole('link', { name: 'Go to the scanner menu' }).click();
      await expect(new MenuPage(page).greeting()).toBeVisible();
    },
  );
});

test.describe('task menu as supervisor', () => {
  test.use({ storageState: '.auth/supervisor.json' });

  test(
    'supervisors see the Admin shortcut and it opens the console',
    { tag: '@REQ-003' },
    async ({ page }) => {
      const menu = new MenuPage(page);
      await menu.goto();
      await expect(menu.footer()).toContainText('supervisor');
      await menu.adminLink().click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    },
  );
});
