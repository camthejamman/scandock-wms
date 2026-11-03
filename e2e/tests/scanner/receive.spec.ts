import { expect, test } from '../../support/fixtures';
import { ReceivePage } from '../../pages/scanner.pages';

test.describe('receiving on the handheld', () => {
  test.use({ storageState: '.auth/operator.json' });

  test(
    'the list shows only open and partial purchase orders',
    { tag: '@REQ-009' },
    async ({ page }) => {
      const receive = new ReceivePage(page);
      await receive.goto();
      await expect(receive.poRows().first()).toBeVisible();
      const badges = await receive.poRows().locator('.badge').allTextContents();
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) expect(['Open', 'Partial']).toContain(b);
      await expect(receive.poRows().first()).toContainText(/due/);
    },
  );

  test(
    'scanning a PO number opens it; unknown numbers are rejected',
    { tag: ['@REQ-009', '@REQ-029'] },
    async ({ page, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 3 }], {
        vendor: 'Scan Me Inc',
      });
      const receive = new ReceivePage(page);
      await receive.goto();
      await receive.scanPo('PO-DOES-NOT-EXIST');
      await receive.expectError('No purchase order');
      await expect(page).toHaveURL(/\/scan\/receive$/);
      await receive.scanPo(po.poNumber.toLowerCase());
      await expect(page).toHaveURL(new RegExp(`/scan/receive/${po.poNumber}$`));
      await expect(page.getByRole('heading', { name: po.poNumber })).toBeVisible();
      await expect(page.getByText('Scan Me Inc')).toBeVisible();
      await expect(receive.lines()).toHaveCount(1);
    },
  );

  test(
    'a fully received PO cannot be opened for receiving again',
    { tag: '@REQ-013' },
    async ({ page, api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      await api.postOk(`/purchase-orders/${po.poNumber}/receipts`, {
        lines: [{ lineNo: 1, qty: 1, bin: bin.code }],
      });
      const receive = new ReceivePage(page);
      await receive.goto();
      await receive.scanPo(po.poNumber);
      await receive.expectError('already received');
      await receive.gotoPo(po.poNumber);
      await expect(receive.complete()).toBeVisible();
    },
  );

  test(
    'scan item, confirm quantity, scan bin: the line is received and the PO completes',
    { tag: ['@smoke', '@REQ-009', '@REQ-029'] },
    async ({ page, api, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin('RECEIVING');
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await expect(receive.line(item.sku)).toContainText('0/5');

      await receive.scanItem(item.barcode);
      await expect(receive.form()).toContainText(`Line 1 · ${item.sku}`);
      await expect(receive.qty()).toHaveValue('5');
      await receive.scanBin(bin.code.toLowerCase());

      await receive.expectSuccess(`Received 5 × ${item.sku} into ${bin.code}`);
      await expect(receive.complete()).toBeVisible();
      await expect(receive.status()).toHaveText('Received');
      await expect(receive.line(item.sku)).toContainText('5/5');
      await receive.complete().getByRole('button', { name: 'Done' }).click();
      await expect(page).toHaveURL(/\/scan\/receive$/);

      const detail = await api.getOk(`/purchase-orders/${po.poNumber}`);
      expect(detail.status).toBe('RECEIVED');
      expect(detail.receipts[0].receivedBy).toBe('Pat Picker');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0]).toMatchObject({
        sku: item.sku,
        qtyOnHand: 5,
      });
    },
  );

  test(
    'a partial quantity leaves the PO partial and the line can be finished later',
    { tag: '@REQ-009' },
    async ({ page, factory }) => {
      const item = await factory.item();
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.receiveLine(item.sku, bin.code, { qty: 2 });
      await receive.expectSuccess('Received 2');
      await expect(receive.status()).toHaveText('Partial');
      await expect(receive.line(item.sku)).toContainText('2/5');
      await expect(receive.complete()).toHaveCount(0);

      await receive.scanItem(item.sku);
      await expect(receive.qty()).toHaveValue('3');
      await receive.scanBin(bin.code);
      await expect(receive.complete()).toBeVisible();
    },
  );

  test(
    'scanning something that is not on the PO is refused on the spot',
    { tag: '@REQ-009' },
    async ({ page, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.scanItem('TOY-ROBOT-RED');
      await receive.expectError(`TOY-ROBOT-RED is not on ${po.poNumber}`);
      await expect(receive.form()).toHaveCount(0);
      await expect(receive.line(item.sku)).toContainText('0/5');
    },
  );

  test(
    'lot-tracked lines ask for the lot before the bin scan is accepted',
    { tag: '@REQ-011' },
    async ({ page, api, factory }) => {
      const item = await factory.item({ lotTracked: true });
      const bin = await factory.bin();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 4 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.scanItem(item.barcode);
      await expect(receive.lot()).toBeVisible();
      await receive.scanBin(bin.code);
      await receive.expectError('lot tracked');
      await receive.lot().fill('LOT-UI-1');
      await receive.scanBin(bin.code);
      await receive.expectSuccess('Received 4');
      expect((await api.getOk(`/inventory/bin/${bin.code}`)).rows[0]).toMatchObject({
        lot: 'LOT-UI-1',
        qtyOnHand: 4,
      });
    },
  );

  test(
    'over-receipt is blocked and the message explains how much is left',
    { tag: '@REQ-010' },
    async ({ page, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 5 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.receiveLine(item.sku, 'RECV-01', { qty: 6 });
      await receive.expectError('has 5 remaining');
      await expect(receive.line(item.sku)).toContainText('0/5');
      await expect(receive.form()).toBeVisible(); // nothing was lost; the operator can correct the quantity
    },
  );

  test(
    'tapping a line selects it without scanning, and the stepper respects its minimum',
    { tag: '@REQ-029' },
    async ({ page, factory }) => {
      const a = await factory.item();
      const b = await factory.item();
      const po = await factory.purchaseOrder([
        { sku: a.sku, qty: 2 },
        { sku: b.sku, qty: 1 },
      ]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.line(b.sku).click();
      await expect(receive.form()).toContainText(`Line 2 · ${b.sku}`);
      await expect(receive.qty()).toHaveValue('1');
      await expect(receive.qtyMinus()).toBeDisabled();
      await receive.qtyPlus().click();
      await expect(receive.qty()).toHaveValue('2');
      await page.getByRole('button', { name: 'Change' }).click();
      await expect(receive.form()).toHaveCount(0);
    },
  );

  test(
    'an unknown put-away bin is rejected by the server and shown to the operator',
    { tag: '@REQ-012' },
    async ({ page, factory }) => {
      const item = await factory.item();
      const po = await factory.purchaseOrder([{ sku: item.sku, qty: 1 }]);
      const receive = new ReceivePage(page);
      await receive.gotoPo(po.poNumber);
      await receive.receiveLine(item.sku, 'NO-SUCH-BIN');
      await receive.expectError('No bin "NO-SUCH-BIN"');
      await receive.scanBin('SHIP-01');
      await receive.expectError('Cannot receive into a SHIPPING bin');
    },
  );
});
