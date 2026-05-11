/**
 * @vitest-environment node
 *
 * Task 5.3 Codex Round 2 NEW-C1 — `set_account_deleting` RPC grant revoke
 * RLS test (mirror of `delete-user-data-rpc-grant.test.ts` for the Phase 0
 * fence-set RPC).
 *
 * Background. The Phase 0 fence sets `profiles.deleting_at = now()` via the
 * `set_account_deleting(p_user_id)` SECURITY DEFINER function (migration
 * 0016). The cascade now runs this under SERVICE-ROLE (not user-scoped) so
 * Phase 2's `delete_user_data` (revoked from authenticated in 0015) can
 * also use the same admin client. Migration 0017 closes the matching gap:
 *   - relax the `auth.uid() = p_user_id` guard so a NULL `auth.uid()`
 *     (service-role) is accepted, while a non-null `auth.uid()` still
 *     requires self-target;
 *   - REVOKE EXECUTE from `authenticated` so a malicious or buggy client
 *     cannot mark its own account as deleting (would silently 423-block
 *     all of its own mutation routes — minor self-DoS).
 *
 * Test contract:
 *   - Authenticated user calls `client.rpc('set_account_deleting', ...)` →
 *     PostgREST returns SQLSTATE 42501 (permission denied for function).
 *   - Service-role client calls the same RPC → success (mirrors the
 *     production cascade path).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('Codex R2 NEW-C1 — set_account_deleting RPC: authenticated EXECUTE revoked', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness?.teardown();
  }, 30_000);

  it('authenticated user CANNOT execute set_account_deleting even for self', async () => {
    const { data, error } = await harness.userA.client.rpc('set_account_deleting', {
      p_user_id: harness.userA.id,
    });

    expect(error).not.toBeNull();
    const code = (error as { code?: string } | null)?.code ?? '';
    const message = (error as { message?: string } | null)?.message ?? '';
    const combined = `${code} ${message}`.toLowerCase();
    expect(
      combined.includes('42501') || combined.includes('permission denied'),
      `expected permission-denied error; got code=${code} message=${message}`,
    ).toBe(true);
    expect(data).toBeNull();
  });

  it('service-role client CAN execute set_account_deleting (cascade path)', async () => {
    // Build a throwaway user; do not touch shared harness fixtures because
    // marking deleting_at will block the user's mutation routes globally.
    const { data: createData, error: createErr } = await harness.admin.auth.admin.createUser({
      email: `test-fence-set-${Date.now()}@kalori.test`,
      password: 'KaloriRlsTest!2026',
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    const throwawayId = createData?.user?.id;
    expect(throwawayId).toBeDefined();
    if (!throwawayId) return;

    try {
      const { error: rpcErr } = await harness.admin.rpc('set_account_deleting', {
        p_user_id: throwawayId,
      });
      expect(rpcErr).toBeNull();
    } finally {
      try {
        await harness.admin.auth.admin.deleteUser(throwawayId);
      } catch {
        /* ignore */
      }
    }
  });
});
