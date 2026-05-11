import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PREVIEW_URL ?? `http://localhost:${PORT}`;

// Task 5.1.8 — Visual regression projects.
//
// Six baseline specs under `tests/visual/` × 3 chromium-baseline projects
// (mobile / tablet / desktop) = 18 PNG baselines. Cross-browser projects
// (Firefox + WebKit) compare advisory only — drift ≤0.5% does not block
// CI per AC4 (the CI workflow's `continue-on-error: true` enforces that).
//
// `snapshotPathTemplate` lands the PNGs at `tests/visual/__screenshots__/...`
// per AC1's wording.

const VISUAL_TEST_MATCH = ['visual/**/*.spec.ts'];
const VISUAL_SNAPSHOT_PATH_TEMPLATE =
  '{testDir}/visual/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}';

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'axe/**/*.spec.ts', 'visual/**/*.spec.ts'],
  // Hydrate process.env from .env.local once before any spec runs so fixtures
  // that reach Supabase (F-TEST-4 real-user auth fixture) see the same
  // credentials Vitest already reads via tests/setup.ts. CI inherits these
  // vars from GitHub Actions secrets and the loader silently no-ops when the
  // file is absent.
  globalSetup: './tests/e2e/fixtures/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 4,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Existing E2E + axe project (testMatch scoped to keep visual specs out).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['e2e/**/*.spec.ts', 'axe/**/*.spec.ts'],
    },
    // Visual regression — Chromium primary baseline (3 breakpoints).
    {
      name: 'visual-baseline-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: VISUAL_TEST_MATCH,
      snapshotPathTemplate: VISUAL_SNAPSHOT_PATH_TEMPLATE,
    },
    {
      name: 'visual-baseline-chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      testMatch: VISUAL_TEST_MATCH,
      snapshotPathTemplate: VISUAL_SNAPSHOT_PATH_TEMPLATE,
    },
    {
      name: 'visual-baseline-chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } },
      testMatch: VISUAL_TEST_MATCH,
      snapshotPathTemplate: VISUAL_SNAPSHOT_PATH_TEMPLATE,
    },
    // Cross-browser visual regression (advisory drift ≤0.5%).
    {
      name: 'visual-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
      testMatch: VISUAL_TEST_MATCH,
      snapshotPathTemplate: VISUAL_SNAPSHOT_PATH_TEMPLATE,
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
    },
    {
      name: 'visual-safari',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      testMatch: VISUAL_TEST_MATCH,
      snapshotPathTemplate: VISUAL_SNAPSHOT_PATH_TEMPLATE,
      expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
    },
  ],
  ...(isCI
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
