import { test as setup } from '@playwright/test';
import { loginToken } from './api-client';
import { STORAGE_STATE, type Role } from './env';
import { injectSession } from './fixtures';

const roles: Role[] = ['admin', 'supervisor', 'operator'];

for (const role of roles) {
  setup(`store ${role} session`, async ({ page, playwright }) => {
    const ctx = await playwright.request.newContext();
    const token = await loginToken(ctx, role);
    await ctx.dispose();
    await injectSession(page, token);
    await page.context().storageState({ path: STORAGE_STATE(role) });
  });
}
