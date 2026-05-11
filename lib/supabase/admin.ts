/**
 * Service-role Supabase client. SERVER-ONLY. TEST-ONLY.
 *
 * USAGE POLICY (design-doc §13 / I1):
 *   - Used EXCLUSIVELY from `tests/**` (RLS test harness + seeding).
 *   - Must NEVER be imported from `app/` or `components/` — enforced by the
 *     `kalori/no-admin-in-app` ESLint rule + CI grep guard.
 *   - The `SUPABASE_SECRET_KEY` env var is a `sb_secret_*` key that bypasses
 *     RLS. Leaking it to a browser bundle = full DB compromise.
 *
 * Test harness flow (testing-strategy.md §10.2):
 *   - `createUser` + `signInWithPassword` to produce per-user JWTs
 *   - Clients built via anon key + `Authorization: Bearer <jwt>` so downstream
 *     specs can exercise RLS `using`/`with check` as a real user.
 *
 * Not memoized: the harness may want fresh instances between specs for
 * session-free predictability, and re-creation is cheap for Node-side use.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getAdminSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      'Admin Supabase env vars missing: SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY (CI) or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (local dev) are required.',
    );
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
