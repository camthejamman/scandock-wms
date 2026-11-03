import { expect, test } from '../../support/fixtures';
import { ShipPage } from '../../pages/scanner.pages';

test.describe('shipping on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  async function pickedOrder(
    api: any,
    factory: any,
    opts: {
      qty?: number;
      weightLb?: number;
      country?: string;
      priority?: 'STANDARD' | 'RUSH';
    } = {},
  ) {
    const { item, bin } = await factory.stockedItem(10, { weightLb: opts.weightLb ?? 2 });
    const so = await factory.salesOrder([{ sku: item.sku, qty: opts.qty ?? 2 }], {
      country: opts.country,
      priority: opts.priority,
    });
    await api.postOk(`/sales-orders/${so.soNumber}/picks`, {
      lineNo: 1,
      bin: bin.code,
      qty: opts.qty ?? 2,
    });
    await api.postOk(`/sales-orders/${so.soNumber}/complete-pick`);
    return { so, item };
  }

  test(
    'the ship list only shows picked orders',
    { tag: '@REQ-018' },
    async ({ page, api, factory }) => {
      const { so } = await pickedOrder(api, factory);
      const ship = new ShipPage(page);
      await ship.goto();
      const row = page.locator(`[data-testid="so-row"]:has-text("${so.soNumber}")`);
      await expect(row).toBeVisible();
      for (const b of await ship.orderRows().locator('.badge[data-status]').allTextContents())
        expect(['Picked', 'Rush']).toContain(b);
    },
  );

  test(
    'weight drives the carrier suggestion; shipping produces a tracking number',
    { tag: ['@smoke', '@REQ-017', '@REQ-018'] },
    async ({ page, api, factory }) => {
      const { so } = await pickedOrder(api, factory, { qty: 2, weightLb: 2 });
      const ship = new ShipPage(page);
      await ship.gotoOrder(so.soNumber);
      await expect(ship.weight()).toHaveValue('4');
      await expect(ship.suggestion()).toContainText('UPS Ground');
      await expect(ship.carrier()).toHaveValue('UPS');

      await ship.weight().fill('200');
      await expect(ship.suggestion()).toContainText('Estes LTL Freight');
      await expect(ship.carrier()).toHaveValue('Estes');
      await ship.weight().fill('0.5');
      await expect(ship.suggestion()).toContainText('USPS Ground Advantage');

      await ship.shipButton().click();
      await expect(ship.result()).toBeVisible();
      await expect(ship.result()).toContainText('USPS');
      await expect(ship.tracking()).toHaveText(/^9400\d{18}$/);
      await ship.expectSuccess('shipped via USPS');

      await page.getByRole('link', { name: 'Back to shipping' }).click();
      await expect(page.locator(`[data-testid="so-row"]:has-text("${so.soNumber}")`)).toHaveCount(
        0,
      );
      expect(await api.getOk(`/sales-orders/${so.soNumber}`)).toMatchObject({
        status: 'SHIPPED',
        carrier: 'USPS',
        weightLb: 0.5,
        shippedBy: 'Pat Picker',
      });
    },
  );

  test(
    'the operator may override the suggested carrier',
    { tag: '@REQ-017' },
    async ({ page, api, factory }) => {
      const { so } = await pickedOrder(api, factory);
      const ship = new ShipPage(page);
      await ship.gotoOrder(so.soNumber);
      await ship.carrier().selectOption('FedEx');
      await ship.shipButton().click();
      await expect(ship.result()).toContainText('FedEx · Standard');
      await expect(ship.tracking()).toHaveText(/^\d{12}$/);
    },
  );

  test(
    'international orders suggest DHL and rush orders Next Day Air',
    { tag: '@REQ-017' },
    async ({ page, api, factory }) => {
      const intl = await pickedOrder(api, factory, { country: 'CA' });
      const ship = new ShipPage(page);
      await ship.gotoOrder(intl.so.soNumber);
      await expect(ship.suggestion()).toContainText('DHL Express Worldwide');
      const rush = await pickedOrder(api, factory, { priority: 'RUSH' });
      await ship.gotoOrder(rush.so.soNumber);
      await expect(ship.suggestion()).toContainText('UPS Next Day Air');
    },
  );

  test(
    'orders that are not picked yet cannot be shipped from the handheld',
    { tag: '@REQ-018' },
    async ({ page, factory }) => {
      const { item } = await factory.stockedItem(2);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 1 }]);
      const ship = new ShipPage(page);
      await ship.gotoOrder(so.soNumber);
      await expect(
        page.getByRole('status').filter({ hasText: 'Only picked orders can ship' }),
      ).toBeVisible();
      await expect(ship.form()).toHaveCount(0);
    },
  );
});
