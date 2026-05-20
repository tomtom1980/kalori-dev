/**
 * Shared test-infra PROD-Supabase refusal guard.
 *
 * Hard-fails any fixture that resolves a Supabase URL pointing at the
 * `kalori-prod` project ref (`dryysypycsexvlbabtwq`). Without this guard,
 * `.env.local` regenerated from `vercel env pull` (which carries PROD
 * credentials by default) would let `tests/e2e/fixtures/auth.ts`'s
 * `provisionTestUser` call `admin.auth.admin.createUser` against production
 * — leaking ephemeral test users into the prod `auth.users` table.
 *
 * Behaviour:
 *   - URL whose first hostname label is `dryysypycsexvlbabtwq` → throw with
 *     a remediation message naming the prod ref AND pointing at the dev
 *     project ref (`aaiohznsqlqchsoxaqkz`) for the operator to switch to.
 *   - URL with any other ref → return silently (pass-through). The guard is
 *     a blocklist for the single known prod project, not an allowlist; a
 *     future staging / contributor / preview project must not be pre-judged
 *     here.
 *   - Malformed URL (not parseable by `new URL()`) → return silently — let
 *     the downstream `createClient(url, ...)` surface the parse error so we
 *     don't mask Supabase's own error path with our guard's.
 *
 * Ordering constraint:
 *   This guard MUST fire AFTER the existing missing-env throw in
 *   `resolveEnv()` callers. The missing-env throw is what CI uses to
 *   classify auth-fixture failures as CI-DEFERRED; if the prod-ref guard
 *   fired first, a missing-env CI scenario would silently NOT trigger
 *   either path (URL would be undefined → guard no-ops → other checks would
 *   blow up later in an unhelpful way). Keep missing-env first, prod-ref
 *   second.
 */

/** kalori-prod Supabase project ref — sourced from CLAUDE.md project map. */
const PROD_SUPABASE_REF = 'dryysypycsexvlbabtwq';

/** kalori-dev Supabase project ref — surfaced in remediation message only. */
const DEV_SUPABASE_REF = 'aaiohznsqlqchsoxaqkz';

export function refuseProdSupabase(supabaseUrl: string): void {
  if (!supabaseUrl) return;
  let ref: string | null = null;
  try {
    ref = new URL(supabaseUrl).hostname.split('.')[0] ?? null;
  } catch {
    // Malformed URL — let createClient surface the parse error.
    return;
  }
  if (ref === PROD_SUPABASE_REF) {
    throw new Error(
      `Test fixtures must not run against PROD Supabase project (ref "${PROD_SUPABASE_REF}"). ` +
        `Current SUPABASE_TEST_URL / NEXT_PUBLIC_SUPABASE_URL resolves to the production project, ` +
        `which would create ephemeral test users in production. ` +
        `Remediation: regenerate .env.local from the kalori-dev project ` +
        `(ref "${DEV_SUPABASE_REF}") via "vercel env pull --environment=development", ` +
        `or restart the dev server with kalori-dev credentials from Planning/devapikeys.txt.`,
    );
  }
}
