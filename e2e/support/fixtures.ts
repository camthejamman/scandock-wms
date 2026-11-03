import { test as base, expect, type Page } from '@playwright/test';
import { ApiClient, ErpClient, loginToken } from './api-client';
import { Factory } from './factory';
import { type Role, USERS } from './env';

interface Fixtures {
  /** Admin API client (default actor for setup). */
  api: ApiClient;
  /** API client factory for other roles / anonymous. */
  apiAs: (role: Role | 'anonymous' | { username: string; pin: string }) => Promise<ApiClient>;
  erp: ErpClient;
  factory: Factory;
  /** Put a signed-in session into the current page's browser context (fast, no UI login). */
  loginAs: (role: Role | { username: string; pin: string }) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  api: async ({ playwright }, use) => {
    const client = await ApiClient.create(playwright, 'admin');
    await use(client);
    await client.dispose();
  },
  apiAs: async ({ playwright }, use) => {
    const clients: ApiClient[] = [];
    await use(async (role) => {
      const c = await ApiClient.create(playwright, role);
      clients.push(c);
      return c;
    });
    for (const c of clients) await c.dispose();
  },
  erp: async ({ playwright }, use) => {
    const client = await ErpClient.create(playwright);
    await use(client);
    await client.dispose();
  },
  factory: async ({ api }, use) => {
    await use(new Factory(api));
  },
  loginAs: async ({ page, playwright }, use) => {
    await use(async (role) => {
      const bootstrap = await playwright.request.newContext();
      const token = await loginToken(bootstrap, role);
      await bootstrap.dispose();
      await injectSession(page, token);
    });
  },
});

export async function injectSession(page: Page, token: string): Promise<void> {
  // The app keeps its JWT in localStorage; set it before the app boots.
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('scandock.token', t), token);
}

export { expect, USERS };
export type { Role };
