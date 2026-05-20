import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { loadEnvFile as parseEnvFileContent } from './tests/_utils/env-loader';

const isCI = !!process.env.CI;
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PREVIEW_URL ?? `http://localhost:${PORT}`;

// E.1.9 Codex finding 1 — Playwright webServer env override.
//
// globalSetup hydrates the orchestrator + worker process.env, but the
// webServer command (`pnpm dev`) is spawned as a CHILD process and Next.js
// independently loads `.env.local` for the app server. If `.env.local` points
// at PROD Supabase (which is intentional for the human-driven `pnpm dev`
// workflow per CLAUDE.md), the app server runs against PROD while tests run
// against DEV — false confidence at best, prod-data damage at worst.
//
// Solution: parse `.env.test.local` HERE (before defineConfig is invoked)
// and inject it into the webServer's `env:` so the spawned `pnpm dev`
// inherits the test creds. Same precedence as globalSetup:
//   test-local OVERRIDES → local convenience FILLS-IN → committed defaults
function buildWebServerEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  // Start with the current process.env (will be inherited anyway).
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  // Layer 1 (highest) — .env.test.local always overrides.
  const testLocalPath = resolve(process.cwd(), '.env.test.local');
  if (existsSync(testLocalPath)) {
    const parsed = parseEnvFileContent(readFileSync(testLocalPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) out[k] = v;
  }
  // Layer 2 — .env.local only fills in keys the test-local didn't supply.
  const localPath = resolve(process.cwd(), '.env.local');
  if (existsSync(localPath)) {
    const parsed = parseEnvFileContent(readFileSync(localPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in out)) out[k] = v;
    }
  }
  // Layer 3 — .env defaults.
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const parsed = parseEnvFileContent(readFileSync(envPath, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in out)) out[k] = v;
    }
  }

  // Safety belt: if a `.env.test.local` exists AND the final URL still
  // resolves to a known PROD ref, refuse to launch. The dev env should
  // ALWAYS win at the spawned-server level when .env.test.local is present.
  if (existsSync(testLocalPath)) {
    const finalUrl = out.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const KNOWN_PROD_REF = 'dryysypycsexvlbabtwq';
    if (finalUrl.includes(KNOWN_PROD_REF)) {
      throw new Error(
        `[playwright.config] Refusing to launch webServer: NEXT_PUBLIC_SUPABASE_URL ` +
          `still resolves to PROD ref ${KNOWN_PROD_REF} after applying .env.test.local. ` +
          `Check Planning/devapikeys.txt → .env.test.local mapping.`,
      );
    }
  }

  return out;
}

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
  // The real Supabase auth fixture provisions and signs in a fresh user per
  // test. Local 4-worker full-matrix visual runs can trip Supabase auth rate
  // limits, so keep local E2E serialized unless the caller opts in.
  workers: isCI ? 2 : Number(process.env.PLAYWRIGHT_WORKERS ?? 1),
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
      testIgnore: ['e2e/ios-calendar-trigger.spec.ts'],
    },
    // iOS Mobile Safari coverage for the dashboard calendar trigger
    // (bugfix-tomi 2026-05-16-ios-calendar-fix Bug #1). Webkit is the
    // engine iOS Safari ships, so this is the closest local approximation
    // of the real-device hit-test behaviour without a device farm. Two
    // device descriptors run (iPhone 15 Pro + iPad Pro 11) inside the
    // same project; spec drives the viewport per test block.
    {
      name: 'webkit-ios',
      use: { ...devices['iPhone 15 Pro'] },
      testMatch: ['e2e/ios-calendar-trigger.spec.ts'],
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
          // E.1.9 Codex Round 2 finding 1 — when `.env.test.local` exists we
          // MUST spawn a fresh server with the injected env. Allowing reuse
          // of a previously-running `pnpm dev` (started from `.env.local` →
          // PROD) lets tests drive a prod-backed app while fixtures resolve
          // dev creds. The simple rule: reuse only when the operator has
          // NOT opted into the test-local override.
          reuseExistingServer: !existsSync(resolve(process.cwd(), '.env.test.local')),
          timeout: 120_000,
          // E.1.9 Codex Round 1 finding 1 — inherit test-env-resolved values
          // so the spawned Next dev server runs against the SAME Supabase
          // project as the test fixtures. Without this, `pnpm dev` reads
          // `.env.local` (PROD) directly and the test/server pair diverges.
          env: buildWebServerEnv(),
        },
      }),
});
