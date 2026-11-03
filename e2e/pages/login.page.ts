import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(readonly page: Page) {}

  readonly username = () => this.page.getByLabel('Username');
  readonly pin = () => this.page.getByLabel('PIN', { exact: true });
  readonly submit = () => this.page.getByRole('button', { name: /sign in/i });
  readonly error = () => this.page.getByRole('alert');
  readonly demoHint = () => this.page.getByText(/demo accounts/i);

  async goto() {
    await this.page.goto('/login');
  }

  async login(username: string, pin: string) {
    await this.goto();
    await this.username().fill(username);
    await this.pin().fill(pin);
    await this.submit().click();
  }
}
