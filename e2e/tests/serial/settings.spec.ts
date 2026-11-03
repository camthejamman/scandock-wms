import { expect, test } from '../../support/fixtures';
import { SettingsPage } from '../../pages/admin.pages';
import { CountPage } from '../../pages/scanner.pages';

/**
 * Settings change behaviour for everyone, so these tests run alone (project "serial")
 * and always restore the defaults.
 */
test.describe.configure({ mode: 'serial' });

test.describe('warehouse settings change behaviour immediately', () => {
  test.afterEach(async ({ api }) => {
    await api.patchOk('/settings', {
      allowShortPick: true,
      blindCounts: false,
      allowNegativeInventory: false,
      allowOverReceipt: false,
    });
  });

  test(
    'allowOverReceipt lets receipts exceed the PO quantity',
    { tag: ['@REQ-010', '@REQ-028'] },
    async ({ api, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 2 }]);
      expect(
        (
          await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
            lines: [{ lineNo: 1, qty: 3, bin: 'RECV-01' }],
          })
        ).status,
      ).toBe(409);
      await api.patchOk('/settings', { allowOverReceipt: true });
      const r = await api.post(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 3, bin: 'RECV-01' }],
      });
      expect(r.status).toBe(201);
      expect(r.body.lines[0]).toMatchObject({ qtyReceived: 3, qtyRemaining: -1 });
      expect(r.body.poStatus).toBe('RECEIVED');
    },
  );

  test(
    'allowShortPick=false forces every line to be picked in full',
    { tag: ['@REQ-016', '@REQ-028'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(1);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 2 }]);
      await api.postOk(`/sales-orders/${so.soNumber}/picks`, { lineNo: 1, bin: bin.code, qty: 1 });
      await api.patchOk('/settings', { allowShortPick: false });
      const r = await api.post(`/sales-orders/${so.soNumber}/complete-pick`, {
        shortReason: 'Nope',
      });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('SHORT_PICK_NOT_ALLOWED');
      expect(r.body.error.details.shortLines).toEqual([
        { lineNo: 1, sku: item.sku, qtyRemaining: 1 },
      ]);
      await api.patchOk('/settings', { allowShortPick: true });
      expect(
        (
          await api.post(`/sales-orders/${so.soNumber}/complete-pick`, {
            shortReason: 'Now allowed',
          })
        ).status,
      ).toBe(200);
    },
  );

  test(
    'allowNegativeInventory lets a pick drive a bin below zero (and the ledger still balances)',
    { tag: ['@REQ-015', '@REQ-023', '@REQ-028'] },
    async ({ api, factory }) => {
      const { item, bin } = await factory.stockedItem(2);
      const so = await factory.salesOrder([{ sku: item.sku, qty: 5 }]);
      await api.patchOk('/settings', { allowNegativeInventory: true });
      const r = await api.post(`/sales-orders/${so.soNumber}/picks`, {
        lineNo: 1,
        bin: bin.code,
        qty: 5,
      });
      expect(r.status).toBe(201);
      expect(r.body.binQtyAfter).toBe(-3);
      const inv = await api.getOk('/inventory/invariants');
      expect(inv.mismatches).toEqual([]);
      expect(inv.negatives).toEqual([
        expect.objectContaining({ sku: item.sku, bin: bin.code, qtyOnHand: -3 }),
      ]);
      // bring the bin back to zero so later runs start clean
      await factory.stock(item.sku, bin.code, 3);
      expect((await api.getOk('/inventory/invariants')).negatives).toEqual([]);
    },
  );

  test(
    'blind counts hide expected quantities from operators but not from supervisors',
    { tag: ['@REQ-022', '@REQ-028'] },
    async ({ page, api, apiAs, factory, loginAs }) => {
      const { item, bin } = await factory.stockedItem(9);
      const count = await factory.cycleCount(bin.code, 'picker1');

      await loginAs('admin');
      const settings = new SettingsPage(page);
      await settings.goto();
      await expect(settings.save()).toBeDisabled();
      await settings.setting('blindCounts').check();
      await settings.save().click();
      await settings.expectSuccess('Settings saved');
      expect((await api.getOk('/settings')).blindCounts).toBe(true);

      const op = await apiAs('operator');
      const blind = await op.getOk(`/cycle-counts/${count.id}`);
      expect(blind.blind).toBe(true);
      expect(blind.lines).toEqual([]);

      await loginAs('operator');
      const countPage = new CountPage(page);
      await countPage.gotoCount(count.id);
      await expect(countPage.blindBadge()).toBeVisible();
      await expect(countPage.lines()).toHaveCount(0);
      await countPage.scanItem(item.barcode);
      await expect(countPage.countedInput(item.sku)).toHaveValue('1');
      await expect(countPage.line(item.sku)).not.toContainText('expected');
      await countPage.countedInput(item.sku).fill('8');
      await countPage.submit().click();
      await expect(countPage.result()).toContainText('Blind count: a supervisor will review');

      const sup = await apiAs('supervisor');
      const reviewed = await sup.getOk(`/cycle-counts/${count.id}`);
      expect(reviewed.blind).toBe(false);
      expect(reviewed.lines[0]).toMatchObject({ expectedQty: 9, countedQty: 8, variance: -1 });

      await loginAs('admin');
      await settings.goto();
      await settings.setting('blindCounts').uncheck();
      await settings.save().click();
      await settings.expectSuccess('Settings saved');
      expect((await api.getOk('/settings')).blindCounts).toBe(false);
    },
  );
});
