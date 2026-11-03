/**
 * Push a JUnit results file to Jira X-ray Cloud as a Test Execution.
 *
 *   XRAY_CLIENT_ID=… XRAY_CLIENT_SECRET=… XRAY_PROJECT_KEY=SD npx tsx scripts/xray-import.ts e2e/junit/results.xml
 *
 * Without credentials it runs in dry-run mode and only summarises the file, which is handy locally.
 * X-ray matches test cases by the test name; naming tests after their X-ray key (e.g. "SD-123 …")
 * or tagging them with the requirement id lets X-ray link executions to requirements.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'e2e/junit/results.xml';
const xml = readFileSync(file, 'utf8');
const total = Number(/tests="(\d+)"/.exec(xml)?.[1] ?? 0);
const failures = Number(/failures="(\d+)"/.exec(xml)?.[1] ?? 0);
const skipped = Number(/skipped="(\d+)"/.exec(xml)?.[1] ?? 0);
console.log(`${file}: ${total} tests, ${failures} failed, ${skipped} skipped`);

const { XRAY_CLIENT_ID, XRAY_CLIENT_SECRET, XRAY_PROJECT_KEY } = process.env;
if (!XRAY_CLIENT_ID || !XRAY_CLIENT_SECRET || !XRAY_PROJECT_KEY) {
  console.log(
    'dry run: set XRAY_CLIENT_ID, XRAY_CLIENT_SECRET and XRAY_PROJECT_KEY to import into X-ray Cloud',
  );
  process.exit(0);
}

const auth = await fetch('https://xray.cloud.getxray.app/api/v2/authenticate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ client_id: XRAY_CLIENT_ID, client_secret: XRAY_CLIENT_SECRET }),
});
if (!auth.ok) throw new Error(`X-ray auth failed: ${auth.status} ${await auth.text()}`);
const token = (await auth.json()) as string;

const summary = `ScanDock automated run ${new Date().toISOString()}`;
const res = await fetch(
  `https://xray.cloud.getxray.app/api/v2/import/execution/junit?projectKey=${encodeURIComponent(XRAY_PROJECT_KEY)}&testExecKey=&summary=${encodeURIComponent(summary)}`,
  {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/xml' },
    body: xml,
  },
);
if (!res.ok) throw new Error(`X-ray import failed: ${res.status} ${await res.text()}`);
console.log('X-ray import:', await res.json());
