/**
 * Global Vitest setup.
 * - Registers @testing-library/jest-dom matchers on Vitest's expect.
 * - Calls @testing-library/react `cleanup()` after every test so happy-dom
 *   containers don't accumulate across tests (multiple-element queries fail
 *   otherwise).
 * - Boots the MSW server (Task 1.3) once per suite so integration specs that
 *   hit `/api/ai/**` get deterministic stub responses from
 *   `tests/mocks/handlers.ts`. `afterEach(resetHandlers)` clears per-test
 *   overrides so test isolation is preserved without spec-level boilerplate.
 *   Any spec that wants finer control can also call `server.listen(...)` /
 *   `server.resetHandlers()` directly (see `tests/integration/msw-gemini.test.ts`).
 * - Hydrates `process.env` from `.env.local` if present (gitignored; mirrors
 *   `Planning/devapikeys.txt`). CI supplies the same variables via GitHub
 *   Actions secrets, so this is a local-convenience loader only. Missing
 *   variables are not an error — specs that need them `describe.skip` when
 *   they cannot resolve (see `tests/rls/_harness.test.ts`).
 */
import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
// Task 5.1.1 — install a fake IndexedDB on `globalThis` for unit / integration
// tests that exercise the offline outbox (`lib/offline/**`). happy-dom does
// not implement IDB; node has no IDB at all. fake-indexeddb's `auto` import
// pollyfills `indexedDB`, `IDBKeyRange`, etc. on the global scope.
//
// Tests that need to simulate Safari-private-mode (IDB-unavailable) MUST use
// `vi.stubGlobal('indexedDB', undefined)` and call `vi.unstubAllGlobals()`
// in their `afterEach` to restore the polyfill for the next test.
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

import { server } from './mocks/server';

// Register vitest-axe matchers so `expect(await axe(container)).toHaveNoViolations()`
// works in every component test (a11y C1 fix + ux-auditor §12.1 mandate).
expect.extend(matchers);

// Boot MSW before any test runs. `onUnhandledRequest: 'bypass'` lets real
// network calls (e.g. RLS harness talking to Supabase) pass through
// untouched — MSW only intercepts requests whose path matches a handler.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  cleanup();
  // Clear any per-test handler overrides so the next test starts from the
  // default handler set defined in `tests/mocks/handlers.ts`.
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

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

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));
