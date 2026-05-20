/**
 * Playwright global setup — load env files into `process.env` BEFORE any
 * fixture runs, mirroring the convenience loader in `tests/setup.ts` (Vitest).
 *
 * Why this file exists:
 *   - `@playwright/test` runs each spec file in a fresh worker process. Those
 *     workers inherit `process.env` from the orchestrator, so anything we
 *     hydrate here is visible inside the `authedPage` fixture.
 *   - Next dev / next start, when launched by `webServer` inside
 *     `playwright.config.ts`, automatically picks up `.env.local` via its
 *     own env loader. Playwright tests do NOT — hence this shim.
 *   - In CI the variables come from GitHub Actions secrets; the files won't
 *     exist, and this loader silently no-ops. `resolveEnv()` in the auth
 *     fixture still throws if anything is missing, which is the correct
 *     fail-loud behavior for a misconfigured CI.
 *
 * Precedence (highest wins — task E.1.4b):
 *   1. `.env.test.local`   ← test-only override (kalori-dev Supabase creds)
 *   2. Pre-existing process.env vars (CI secrets, shell exports)
 *   3. `.env.local`        ← convenience local-dev file (may point at PROD)
 *   4. `.env`              ← committed defaults
 *
 * The `.env.test.local` layer is required because the dev server's
 * `.env.local` intentionally points at the PROD Supabase project (kalori-
 * prod, ref `dryysypycsexvlbabtwq`), and `tests/_utils/refuse-prod-supabase.ts`
 * hard-fails every fixture that resolves a PROD ref. The test-local file
 * carries kalori-dev (ref `aaiohznsqlqchsoxaqkz`) credentials sourced from
 * `Planning/devapikeys.txt`. It is gitignored — see `.gitignore` rule
 * `.env*.local` plus the explicit `.env.test.local` entry added in E.1.4b.
 *
 * Override semantics are intentionally asymmetric:
 *   - `.env.test.local` OVERRIDES any matching key already in process.env.
 *     This is what makes the test layer authoritative — without override,
 *     a stale `NEXT_PUBLIC_SUPABASE_URL` exported by the parent shell (or
 *     left over from a prior `pnpm dev` session in CI) would mask the
 *     test creds and route the suite at PROD.
 *   - `.env.local` + `.env` DO NOT override — they only fill in keys not
 *     already set. This preserves the existing behaviour from
 *     `F-LIBOVR-E2E-INFRA-DRIFT` where `.env.local` is a defaults-only
 *     loader, and matches what Next.js does for non-test env files.
 *
 * Do not add any spec-level teardown here — the fixture owns per-test
 * create/delete, which is the correct scope for E2E hermeticity (see
 * `tests/e2e/fixtures/auth.ts` docstring).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadEnvFile as parseEnvFileContent } from '../../_utils/env-loader';

// F-LIBOVR-E2E-INFRA-DRIFT — the inline parser was extracted to
// `tests/_utils/env-loader.ts` so Vitest + Playwright share one chokepoint
// (the prior byte-identical duplicates between this file and `tests/setup.ts`
// were the root cause of the drift). We retain the file-IO + `process.env`
// write here because those concerns are setup-specific (CI never reads
// `.env.local`; missing-file is OK).
//
// E.1.4b — `override` flag added so `.env.test.local` can supersede any
// already-set env var. The legacy callers (`.env.local`, `.env`) keep the
// default `override = false` behaviour to preserve the historical contract.
function loadEnvFile(path: string, options: { override?: boolean } = {}): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  const parsed = parseEnvFileContent(raw);
  const override = options.override === true;
  for (const [key, value] of Object.entries(parsed)) {
    if (!override && key in process.env) continue;
    process.env[key] = value;
  }
}

export default async function globalSetup(): Promise<void> {
  // 1. Test-only override — highest precedence. Loaded FIRST with
  //    `override: true` so its values supersede any pre-existing env
  //    (stale shell exports, parent-process leakage from `pnpm dev`,
  //    etc.). Carries kalori-dev Supabase + Gemini test creds.
  loadEnvFile(resolve(process.cwd(), '.env.test.local'), { override: true });

  // 2. Local-dev convenience — fills in any keys the test-local file
  //    didn't supply (e.g. Sentry DSN, OAuth client IDs that are env-
  //    agnostic). Does NOT override; if the test-local layer set a key,
  //    that value wins.
  loadEnvFile(resolve(process.cwd(), '.env.local'));

  // 3. Committed defaults — lowest precedence. Same defaults-only
  //    semantics. CI workflows typically have no `.env` file checked in;
  //    this is a no-op there.
  loadEnvFile(resolve(process.cwd(), '.env'));
}
