/**
 * Playwright global setup — load `.env.local` into `process.env` BEFORE any
 * fixture runs, mirroring the convenience loader in `tests/setup.ts` (Vitest).
 *
 * Why this file exists:
 *   - `@playwright/test` runs each spec file in a fresh worker process. Those
 *     workers inherit `process.env` from the orchestrator, so anything we
 *     hydrate here is visible inside the `authedPage` fixture.
 *   - Next dev / next start, when launched by `webServer` inside
 *     `playwright.config.ts`, automatically picks up `.env.local` via its
 *     own env loader. Playwright tests do NOT — hence this shim.
 *   - In CI the variables come from GitHub Actions secrets; the file won't
 *     exist, and this loader silently no-ops. `resolveEnv()` in the auth
 *     fixture still throws if anything is missing, which is the correct
 *     fail-loud behavior for a misconfigured CI.
 *
 * Do not add any spec-level teardown here — the fixture owns per-test
 * create/delete, which is the correct scope for E2E hermeticity (see
 * `tests/e2e/fixtures/auth.ts` docstring).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue; // never override an already-set var
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export default async function globalSetup(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env'));
}
