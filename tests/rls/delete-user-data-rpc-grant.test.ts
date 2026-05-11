/**
 * @vitest-environment node
 *
 * Task 5.3 Codex Round 1 C2 — `delete_user_data` RPC grant revoke RLS test.
 *
 * Original behaviour (`supabase/migrations/0014_delete_user_data_definer.sql:64`):
 *   `grant execute on function public.delete_user_data(uuid) to authenticated;`
 *
 * Problem: any signed-in browser can call `supabase.rpc('delete_user_data',
 * { p_user_id: <self> })`. The internal `auth.uid() <> p_user_id` guard
 * prevents cross-user attack — but a malicious or buggy CLIENT can wipe its
 * OWN database rows while skipping storage cleanup, auth.users delete, and
 * cross-tab signout. Only the SERVER cascade orchestrator (which holds
 * service-role) should reach this RPC.
 *
 * Fix (`supabase/migrations/0015_delete_user_data_revoke_authenticated.sql`):
 *   `revoke execute on function public.delete_user_data(uuid) from authenticated;`
 *   service_role retains execute via default postgres function permissions.
 *
 * Test contract:
 *   - Authenticated user (`harness.userA`) calls
 *     `client.rpc('delete_user_data', { p_user_id: <self.id> })` →
 *     PostgREST returns an error mentioning permission/access (Postgres
 *     SQLSTATE 42501 — `permission denied for function delete_user_data`).
 *   - Service-role client (`harness.admin`) calls the same RPC against a
 *     freshly created throwaway user → success (no permission error).
 *
 * RED-first: with migration 0014 still authoritative, the authenticated
 * call SUCCEEDS (returns null result) — the test asserts it must FAIL with
 * a permission error.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('Codex R1 C2 — delete_user_data RPC: authenticated EXECUTE revoked', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness?.teardown();
  }, 30_000);

  it('authenticated user CANNOT execute delete_user_data even for self', async () => {
    const { data, error } = await harness.userA.client.rpc('delete_user_data', {
      p_user_id: harness.userA.id,
    });

    // Per Postgres conventions: SQLSTATE 42501 = `permission denied`. The
    // exact human message is "permission denied for function
    // delete_user_data". PostgREST surfaces the message; the code should
    // be present in the error envelope.
    expect(error).not.toBeNull();
    // Defensive normalize — PostgREST puts the SQLSTATE into `code` (or
    // sometimes leaves it in `message`). Either should mention 42501 or
    // the literal "permission denied".
    const code = (error as { code?: string } | null)?.code ?? '';
    const message = (error as { message?: string } | null)?.message ?? '';
    const combined = `${code} ${message}`.toLowerCase();
    expect(
      combined.includes('42501') || combined.includes('permission denied'),
      `expected permission-denied error; got code=${code} message=${message}`,
    ).toBe(true);
    // No payload returned.
    expect(data).toBeNull();
  });

  it('service-role client CAN execute delete_user_data for any user', async () => {
    // Build a throwaway user just for this assertion; harness.userB is
    // shared across the suite so we can't actually delete its rows here.
    const { data: createData, error: createErr } = await harness.admin.auth.admin.createUser({
      email: `test-rpc-c2-${Date.now()}@kalori.test`,
      password: 'KaloriRlsTest!2026',
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    const throwawayId = createData?.user?.id;
    expect(throwawayId).toBeDefined();
    if (!throwawayId) return;

    try {
      // Service-role client retains execute privilege per default Postgres
      // function permissions (revoke targets only `authenticated`).
      const { error: rpcErr } = await harness.admin.rpc('delete_user_data', {
        p_user_id: throwawayId,
      });
      expect(rpcErr).toBeNull();
    } finally {
      try {
        await harness.admin.auth.admin.deleteUser(throwawayId);
      } catch {
        /* ignore — the RPC may have already wiped this user */
      }
    }
  });
});
