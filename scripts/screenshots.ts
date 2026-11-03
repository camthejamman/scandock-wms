/**
 * Refreshes the README screenshots from a running stack (npm run up, or npm run dev).
 *   npx tsx scripts/screenshots.ts
 * Resets the demo data first so the pictures always show the same state.
 */
import { chromium, devices, request } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5180';
const API = process.env.API_URL ?? 'http://localhost:4000';
const out = new URL('../docs/img/', import.meta.url).pathname;

async function main() {
  mkdirSync(out, { recursive: true });
  const rq = await request.newContext();
  await rq.post(`${API}/api/test/reset`);
  const token = async (username: string) => {
    const r = await rq.post(`${API}/api/auth/login`, { data: { username, pin: '1234' } });
    return (await r.json()).token as string;
  };
  const browser = await chromium.launch();

  const mobile = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await mobile.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('scandock.token', t), await token('picker1'));
  await page.goto(`${BASE}/scan/receive/PO-1001`);
  const scanItem = page.getByTestId('scan-item').getByRole('textbox');
  await scanItem.fill('041234000015');
  await scanItem.press('Enter');
  await page.getByTestId('receive-form').waitFor();
  await page.screenshot({ path: `${out}handheld-receive.png` });
  await page.goto(`${BASE}/scan/pick/SO-5002`);
  const scanBin = page.getByTestId('scan-bin').getByRole('textbox');
  await scanBin.fill('P-01-01');
  await scanBin.press('Enter');
  const scanItem2 = page.getByTestId('scan-item').getByRole('textbox');
  await scanItem2.fill('041234000015');
  await scanItem2.press('Enter');
  await page.getByTestId('confirm-pick').waitFor();
  await page.screenshot({ path: `${out}handheld-pick.png` });
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await desktop.newPage();
  await p2.goto(`${BASE}/login`);
  await p2.evaluate((t) => localStorage.setItem('scandock.token', t), await token('admin'));
  await p2.goto(`${BASE}/admin`);
  await p2.getByTestId('recent-transactions').locator('tbody tr').first().waitFor();
  await p2.screenshot({ path: `${out}admin-dashboard.png` });
  await p2.goto(`${BASE}/admin/orders?tab=so`);
  await p2.getByTestId('so-table').waitFor();
  await p2.screenshot({ path: `${out}admin-orders.png` });
  await browser.close();
  await rq.dispose();
  console.log(`screenshots written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
