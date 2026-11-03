import { expect, type Locator, type Page } from '@playwright/test';

export class AdminShell {
  constructor(readonly page: Page) {}

  readonly nav = () => this.page.getByRole('navigation', { name: 'Admin' });
  navLink(name: string): Locator {
    return this.nav().getByRole('link', { name, exact: true });
  }
  readonly title = () => this.page.locator('.admin-topbar h1');
  readonly erpBanner = () => this.page.getByTestId('erp-banner');
  readonly successToast = () => this.page.getByTestId('toast-success');
  readonly errorToast = () => this.page.getByTestId('toast-error');
  readonly modal = () => this.page.getByRole('dialog');
  readonly modalError = () => this.modal().getByRole('alert');

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

export class DashboardPage extends AdminShell {
  kpi(id: string): Locator {
    return this.page.getByTestId(`kpi-${id}`);
  }
  kpiValue(id: string): Locator {
    return this.kpi(id).locator('.kpi-value');
  }
  readonly recent = () => this.page.getByTestId('recent-transactions');
  readonly lowStock = () => this.page.getByTestId('low-stock-table');
  async goto() {
    await this.page.goto('/admin');
  }
}

export class InventoryPage extends AdminShell {
  readonly search = () => this.page.getByLabel('Search');
  readonly zone = () => this.page.getByLabel('Zone');
  readonly lowStock = () => this.page.getByLabel('Low stock only');
  readonly searchButton = () => this.page.getByRole('button', { name: 'Search' });
  readonly rows = () => this.page.getByTestId('inventory-row');
  readonly table = () => this.page.getByTestId('inventory-table');
  readonly next = () => this.page.getByRole('button', { name: 'Next' });
  readonly previous = () => this.page.getByRole('button', { name: 'Previous' });
  readonly pager = () => this.page.getByRole('navigation', { name: 'Pagination' });
  async goto(query = '') {
    await this.page.goto(`/admin/inventory${query}`);
  }
}

export class ItemsPage extends AdminShell {
  readonly newItem = () => this.page.getByTestId('new-item');
  readonly save = () => this.page.getByTestId('save-item');
  readonly rows = () => this.page.getByTestId('item-row');
  readonly search = () => this.page.getByLabel('Search');
  readonly searchButton = () => this.page.getByRole('button', { name: 'Search' });
  readonly includeInactive = () => this.page.getByLabel('Include inactive');
  row(sku: string): Locator {
    return this.page.locator(`[data-testid="item-row"][data-sku="${sku}"]`);
  }
  field(label: string | RegExp): Locator {
    return this.modal().getByLabel(label);
  }
  async goto(query = '') {
    await this.page.goto(`/admin/items${query}`);
  }
}

export class BinsPage extends AdminShell {
  readonly newBin = () => this.page.getByTestId('new-bin');
  readonly save = () => this.page.getByTestId('save-bin');
  readonly rows = () => this.page.getByTestId('bin-row');
  readonly zoneFilter = () => this.page.locator('#bins-zone');
  row(code: string): Locator {
    return this.page.locator(`[data-testid="bin-row"][data-code="${code}"]`);
  }
  async goto() {
    await this.page.goto('/admin/bins');
  }
}

export class OrdersPage extends AdminShell {
  readonly poTab = () => this.page.getByRole('tab', { name: 'Purchase orders' });
  readonly soTab = () => this.page.getByRole('tab', { name: 'Sales orders' });
  readonly newOrder = () => this.page.getByTestId('new-order');
  readonly save = () => this.page.getByTestId('save-order');
  readonly poRows = () => this.page.getByTestId('po-row');
  readonly soRows = () => this.page.getByTestId('so-row');
  readonly status = () => this.page.getByLabel('Status');
  readonly search = () => this.page.getByLabel('Search');
  readonly searchButton = () => this.page.getByRole('button', { name: 'Search' });
  async goto(tab: 'po' | 'so' = 'po', extra = '') {
    await this.page.goto(`/admin/orders?tab=${tab}${extra}`);
  }
  lineSku(i: number): Locator {
    return this.modal().getByLabel(`Line ${i} SKU`);
  }
  lineQty(i: number): Locator {
    return this.modal().getByLabel(`Line ${i} quantity`);
  }
  readonly addLine = () => this.modal().getByRole('button', { name: 'Add line' });
}

export class PoDetailPage extends AdminShell {
  readonly closePo = () => this.page.getByTestId('close-po');
  readonly confirmClose = () => this.page.getByTestId('confirm-close-po');
  readonly lines = () => this.page.getByTestId('po-lines').locator('tbody tr');
  readonly receipts = () => this.page.getByTestId('receipt');
  async goto(po: string) {
    await this.page.goto(`/admin/orders/po/${po}`);
  }
}

export class SoDetailPage extends AdminShell {
  readonly cancel = () => this.page.getByTestId('cancel-so');
  readonly confirmCancel = () => this.page.getByTestId('confirm-cancel-so');
  readonly lines = () => this.page.getByTestId('so-lines').locator('tbody tr');
  readonly picks = () => this.page.getByTestId('so-picks').locator('tbody tr');
  readonly tracking = () => this.page.getByTestId('so-tracking');
  async goto(so: string) {
    await this.page.goto(`/admin/orders/so/${so}`);
  }
}

export class CountsPage extends AdminShell {
  readonly newCount = () => this.page.getByTestId('new-count');
  readonly save = () => this.page.getByTestId('save-count');
  readonly rows = () => this.page.getByTestId('count-row');
  tab(name: string): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }
  async goto(status = '') {
    await this.page.goto(`/admin/counts${status ? `?status=${status}` : ''}`);
  }
}

export class CountDetailPage extends AdminShell {
  readonly approve = () => this.page.getByTestId('approve-count');
  readonly reject = () => this.page.getByTestId('reject-count');
  readonly confirmReview = () => this.page.getByTestId('confirm-review');
  readonly summary = () => this.page.getByTestId('count-summary');
  readonly lines = () => this.page.getByTestId('count-line');
  readonly notes = () => this.page.getByLabel('Notes');
  async goto(id: number) {
    await this.page.goto(`/admin/counts/${id}`);
  }
}

export class UsersPage extends AdminShell {
  readonly newUser = () => this.page.getByTestId('new-user');
  readonly save = () => this.page.getByTestId('save-user');
  readonly rows = () => this.page.getByTestId('user-row');
  row(username: string): Locator {
    return this.page.locator(`[data-testid="user-row"][data-username="${username}"]`);
  }
  async goto() {
    await this.page.goto('/admin/users');
  }
}

export class ErpPage extends AdminShell {
  readonly syncNow = () => this.page.getByTestId('sync-now');
  readonly status = () => this.page.getByTestId('erp-status');
  readonly outboxPending = () => this.page.getByTestId('outbox-pending');
  readonly syncResult = () => this.page.getByTestId('sync-result');
  readonly outboxRows = () => this.page.getByTestId('outbox-row');
  readonly logRows = () => this.page.getByTestId('sync-log-row');
  async goto() {
    await this.page.goto('/admin/erp');
  }
}

export class SettingsPage extends AdminShell {
  setting(key: string): Locator {
    return this.page.getByTestId(`setting-${key}`);
  }
  readonly save = () => this.page.getByTestId('save-settings');
  async goto() {
    await this.page.goto('/admin/settings');
  }
}

export class TransactionsPage extends AdminShell {
  readonly type = () => this.page.getByLabel('Type');
  readonly sku = () => this.page.getByLabel('SKU');
  readonly filter = () => this.page.getByRole('button', { name: 'Filter' });
  readonly rows = () => this.page.getByTestId('transaction-row');
  async goto() {
    await this.page.goto('/admin/transactions');
  }
}
