import { defineConfig, devices } from '@playwright/test';

/**
 * ScanDock e2e configuration.
 *
 * Projects:
 *  - setup            logs in once per role and stores the sessions (storageState)
 *  - api              black-box API tests, no browser (request fixture only)
 *  - scanner-mobile   handheld screens on a Pixel 7 emulation (what operators use)
 *  - admin-desktop    admin console at 1280x800
 *  - journeys         end-to-end business flows across scanner + admin + ERP
 *  - a11y             axe-core scans of the main screens
 *  - visual           screenshot comparisons (run inside the Playwright Docker image, see README)
 *  - smoke-firefox / smoke-webkit  cross-browser smoke on the critical path (@smoke)
 */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5180';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const ERP_URL = process.env.ERP_URL ?? 'http://localhost:4100';
const CI = !!process.env.CI;
const WEBKIT = CI || !!process.env.PW_WEBKIT;
/** Every project except setup and serial: what the CI shards run and what serial waits for locally. */
export const SHARDABLE_PROJECTS = [
  'api',
  'scanner-mobile',
  'admin-desktop',
  'journeys',
  'a11y',
  'visual',
  'smoke-firefox',
  ...(WEBKIT ? ['smoke-webkit'] : []),
];

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 4 : 8,
  timeout: 30_000,
  expect: {
    timeout: 7_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // JUnit is what Jira X-ray imports (Test Execution per run).
    ['junit', { outputFile: 'junit/results.xml', includeProjectInTestName: true }],
    ['json', { outputFile: 'junit/results.json' }],
    ...(process.env.PW_BLOB ? ([['blob', { outputDir: 'blob-report' }]] as const) : []),
  ],
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  metadata: { apiUrl: API_URL, erpUrl: ERP_URL },
  projects: [
    { name: 'setup', testMatch: /support\/auth\.setup\.ts/, testDir: '.' },
    { name: 'api', testDir: './tests/api' },
    {
      name: 'scanner-mobile',
      testDir: './tests/scanner',
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'admin-desktop',
      testDir: './tests/admin',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'journeys',
      testDir: './tests/journeys',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'visual',
      testDir: './tests/visual',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'smoke-firefox',
      testDir: './tests/smoke',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      // Tests that change global state (settings, ERP outage). On a shared stack they must run after
      // everything else, which project dependencies guarantee. Playwright never shards dependency
      // projects, so in CI (where each job has its own stack) the serial job sets PW_SERIAL_ALONE=1
      // and depends on `setup` only, while the shards run the other projects explicitly.
      name: 'serial',
      testDir: './tests/serial',
      dependencies: process.env.PW_SERIAL_ALONE ? ['setup'] : SHARDABLE_PROJECTS,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // WebKit needs system libraries (`npx playwright install-deps`) that a dev box may not have,
    // so it runs in CI / the Docker image by default. Locally: PW_WEBKIT=1 npm run test:e2e.
    ...(WEBKIT
      ? [
          {
            name: 'smoke-webkit',
            testDir: './tests/smoke',
            dependencies: ['setup'],
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
});
