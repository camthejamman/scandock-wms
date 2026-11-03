import { expect, type Locator, type Page } from '@playwright/test';

/** Shared bits of every handheld screen. */
export class ScannerShell {
  constructor(readonly page: Page) {}

  readonly device = () => this.page.getByTestId('device');
  readonly heading = () => this.page.locator('.device-bar h1');
  readonly back = () => this.page.getByRole('button', { name: 'Back' });
  readonly signOut = () => this.page.getByRole('button', { name: 'Sign out' });
  readonly adminLink = () => this.page.getByRole('link', { name: 'Admin' });
  readonly footer = () => this.page.locator('.device-footer');
  readonly successToast = () => this.page.getByTestId('toast-success');
  readonly errorToast = () => this.page.getByTestId('toast-error');
  readonly infoToast = () => this.page.getByTestId('toast-info');

  /** What a keyboard-wedge barcode scanner does: type the code, press Enter. */
  async scan(formTestId: string, value: string) {
    const input = this.page.getByTestId(formTestId).getByRole('textbox');
    await input.fill(value);
    await input.press('Enter');
  }

  scanInput(formTestId: string): Locator {
    return this.page.getByTestId(formTestId).getByRole('textbox');
  }

  async expectSuccess(text?: string | RegExp) {
    const t = this.successToast().last();
    await expect(t).toBeVisible();
    if (text) await expect(t).toContainText(text);
  }

  async expectError(text?: string | RegExp) {
    const t = this.errorToast().last();
    await expect(t).toBeVisible();
    if (text) await expect(t).toContainText(text);
  }
}

export class MenuPage extends ScannerShell {
  readonly greeting = () => this.page.getByRole('heading', { name: /^Hi, / });
  readonly tiles = () =>
    this.page.getByRole('navigation', { name: 'Warehouse tasks' }).getByRole('link');
  tile(name: string): Locator {
    return this.page.getByRole('link', { name: new RegExp(`^${name}\\b`) });
  }
  async goto() {
    await this.page.goto('/scan');
  }
}

export class ReceivePage extends ScannerShell {
  readonly poRows = () => this.page.getByTestId('po-row');
  readonly lines = () => this.page.getByTestId('po-line');
  readonly form = () => this.page.getByTestId('receive-form');
  readonly complete = () => this.page.getByTestId('po-complete');
  readonly qty = () => this.page.getByTestId('receive-qty').getByRole('spinbutton');
  readonly qtyMinus = () =>
    this.page.getByTestId('receive-qty').getByRole('button', { name: 'Decrease quantity' });
  readonly qtyPlus = () =>
    this.page.getByTestId('receive-qty').getByRole('button', { name: 'Increase quantity' });
  readonly lot = () => this.page.getByLabel('Lot number');
  readonly status = () => this.page.locator('.card').first().locator('.badge');

  line(sku: string): Locator {
    return this.page.locator(`[data-testid="po-line"][data-sku="${sku}"]`);
  }
  async goto() {
    await this.page.goto('/scan/receive');
  }
  async gotoPo(poNumber: string) {
    await this.page.goto(`/scan/receive/${poNumber}`);
  }
  scanPo = (po: string) => this.scan('scan-po', po);
  scanItem = (code: string) => this.scan('scan-item', code);
  scanBin = (bin: string) => this.scan('scan-bin', bin);

  /** Full line receive: item scan -> qty -> (lot) -> bin scan. */
  async receiveLine(code: string, bin: string, opts: { qty?: number; lot?: string } = {}) {
    await this.scanItem(code);
    await expect(this.form()).toBeVisible();
    if (opts.qty !== undefined) await this.qty().fill(String(opts.qty));
    if (opts.lot !== undefined) await this.lot().fill(opts.lot);
    await this.scanBin(bin);
  }
}

export class PickPage extends ScannerShell {
  readonly orderRows = () => this.page.getByTestId('so-row');
  readonly step = () => this.page.getByTestId('pick-step');
  readonly targetBin = () => this.page.getByTestId('target-bin');
  readonly targetQty = () => this.page.getByTestId('target-qty');
  readonly targetSku = () => this.page.getByTestId('target-sku');
  readonly qty = () => this.page.getByTestId('pick-qty').getByRole('spinbutton');
  readonly lot = () => this.page.getByLabel('Lot', { exact: true });
  readonly confirm = () => this.page.getByTestId('confirm-pick');
  readonly skip = () => this.page.getByTestId('skip-line');
  readonly completePanel = () => this.page.getByTestId('pick-complete');
  readonly completeButton = () => this.page.getByTestId('complete-pick');
  readonly shortReason = () => this.page.getByLabel('Reason');
  readonly lines = () => this.page.getByTestId('so-line');

  async goto() {
    await this.page.goto('/scan/pick');
  }
  async gotoOrder(so: string) {
    await this.page.goto(`/scan/pick/${so}`);
  }
  scanBin = (bin: string) => this.scan('scan-bin', bin);
  scanItem = (code: string) => this.scan('scan-item', code);

  /** Bin -> item -> qty -> confirm for the current line. */
  async pickCurrentLine(bin: string, code: string, opts: { qty?: number; lot?: string } = {}) {
    await this.scanBin(bin);
    await this.scanItem(code);
    await expect(this.confirm()).toBeVisible();
    if (opts.qty !== undefined) await this.qty().fill(String(opts.qty));
    if (opts.lot !== undefined) {
      const lot = this.lot();
      if ((await lot.evaluate((el) => el.tagName)) === 'SELECT') await lot.selectOption(opts.lot);
      else await lot.fill(opts.lot);
    }
    await this.confirm().click();
  }
}

export class ShipPage extends ScannerShell {
  readonly orderRows = () => this.page.getByTestId('so-row');
  readonly form = () => this.page.getByTestId('ship-form');
  readonly weight = () => this.page.getByLabel(/package weight/i);
  readonly suggestion = () => this.page.getByTestId('carrier-suggestion');
  readonly carrier = () => this.page.getByLabel('Carrier');
  readonly shipButton = () => this.page.getByTestId('ship-button');
  readonly result = () => this.page.getByTestId('ship-result');
  readonly tracking = () => this.page.getByTestId('tracking-number');

  async goto() {
    await this.page.goto('/scan/ship');
  }
  async gotoOrder(so: string) {
    await this.page.goto(`/scan/ship/${so}`);
  }
}

export class TransferPage extends ScannerShell {
  readonly stockRows = () => this.page.getByTestId('stock-row');
  readonly qty = () => this.page.getByTestId('transfer-qty').getByRole('spinbutton');
  readonly lot = () => this.page.getByLabel('Lot', { exact: true });
  readonly result = () => this.page.getByTestId('transfer-result');

  async goto() {
    await this.page.goto('/scan/transfer');
  }
  scanItem = (code: string) => this.scan('scan-item', code);
  scanFrom = (bin: string) => this.scan('scan-from', bin);
  scanTo = (bin: string) => this.scan('scan-to', bin);
}

export class CountPage extends ScannerShell {
  readonly rows = () => this.page.getByTestId('count-row');
  readonly lines = () => this.page.getByTestId('count-line');
  readonly submit = () => this.page.getByTestId('submit-count');
  readonly confirmSubmit = () => this.page.getByTestId('confirm-submit');
  readonly result = () => this.page.getByTestId('count-result');
  readonly blindBadge = () => this.page.getByText('Blind', { exact: true });

  line(sku: string): Locator {
    return this.page.locator(`[data-testid="count-line"][data-sku="${sku}"]`);
  }
  countedInput(sku: string): Locator {
    return this.line(sku).getByRole('spinbutton');
  }
  async goto() {
    await this.page.goto('/scan/count');
  }
  async gotoCount(id: number) {
    await this.page.goto(`/scan/count/${id}`);
  }
  scanItem = (code: string) => this.scan('scan-item', code);
}

export class InquiryPage extends ScannerShell {
  readonly itemResult = () => this.page.getByTestId('item-result');
  readonly binResult = () => this.page.getByTestId('bin-result');
  readonly onHand = () => this.page.getByTestId('item-on-hand');

  async goto() {
    await this.page.goto('/scan/inquiry');
  }
  lookup = (code: string) => this.scan('scan-inquiry', code);
}

export class LabelPage extends ScannerShell {
  readonly result = () => this.page.getByTestId('label-result');
  readonly zpl = () => this.page.getByTestId('zpl');
  readonly print = () => this.page.getByTestId('print-label');

  async goto() {
    await this.page.goto('/scan/labels');
  }
  lookup = (code: string) => this.scan('scan-label', code);
}
