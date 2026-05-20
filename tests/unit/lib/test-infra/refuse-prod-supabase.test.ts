/**
 * bugfix-tomi mini-batch A item #1 — F-LIBOVR-E2E-INFRA-DRIFT.
 *
 * Vitest spec for the shared PROD-Supabase refusal guard
 * (`tests/_utils/refuse-prod-supabase.ts`). Mirrors the cookieNameForUrl
 * project-ref derivation shape (`new URL(url).hostname.split('.')[0]`).
 *
 * Behaviour contract:
 *   - URL whose project ref matches `dryysypycsexvlbabtwq` (kalori-prod) →
 *     throw with a remediation message that names the prod ref AND tells the
 *     operator to regen `.env.local` from the dev project.
 *   - URL whose project ref matches `aaiohznsqlqchsoxaqkz` (kalori-dev) → no
 *     throw, returns void.
 *   - Any other URL (unknown ref) → no throw (pass-through). The guard is a
 *     blocklist for the single known-prod project, not an allowlist; future
 *     environments are not pre-judged here.
 *   - Malformed URL (not parseable by `new URL()`) → no throw — let the
 *     downstream `createClient(url, ...)` surface the parse error so we don't
 *     mask Supabase's own error path with our guard's.
 *
 * The guard is wired into `tests/e2e/fixtures/auth.ts`'s `resolveEnv()` AND
 * `tests/e2e/library/_seed.ts`'s `resolveEnv()` AFTER the missing-env throw,
 * so the CI-DEFERRED "Auth fixture env missing" classification is preserved
 * (verified by integration-side tests; this unit spec only covers the pure
 * predicate logic).
 */
import { describe, expect, it } from 'vitest';

import { refuseProdSupabase } from '@/tests/_utils/refuse-prod-supabase';

const PROD_URL = 'https://dryysypycsexvlbabtwq.supabase.co';
const DEV_URL = 'https://aaiohznsqlqchsoxaqkz.supabase.co';
const UNKNOWN_URL = 'https://some-other-project.supabase.co';

describe('refuseProdSupabase — F-LIBOVR-E2E-INFRA-DRIFT shared guard', () => {
  it('throws when the URL points at the kalori-prod project ref', () => {
    expect(() => refuseProdSupabase(PROD_URL)).toThrow(/must not run against PROD Supabase/i);
  });

  it('throws with the prod ref in the error message', () => {
    expect(() => refuseProdSupabase(PROD_URL)).toThrow(/dryysypycsexvlbabtwq/);
  });

  it('throws with a remediation hint pointing at the dev project', () => {
    expect(() => refuseProdSupabase(PROD_URL)).toThrow(/aaiohznsqlqchsoxaqkz/);
  });

  it('returns silently when the URL points at the kalori-dev project ref', () => {
    expect(() => refuseProdSupabase(DEV_URL)).not.toThrow();
  });

  it('returns silently when the URL is an unknown project ref (pass-through)', () => {
    // The guard is a blocklist for the single known prod project, not an
    // allowlist — unknown refs (e.g. a future staging project, a contributor's
    // personal Supabase project) must not crash.
    expect(() => refuseProdSupabase(UNKNOWN_URL)).not.toThrow();
  });

  it('returns silently on a malformed URL (let createClient surface the parse error)', () => {
    expect(() => refuseProdSupabase('not-a-valid-url')).not.toThrow();
  });

  it('returns silently on an empty string (defensive — caller still has to feed it to createClient)', () => {
    expect(() => refuseProdSupabase('')).not.toThrow();
  });
});
