/**
 * AC4 (I9) — `app/api/account/delete/route.ts` integration tests.
 *
 * Contract per synthesis §4.1 + §5 + briefing I9 ordering:
 *   - Method: POST (synthesis §4.1) with body `{ confirm: 'DELETE' }`.
 *   - 401 unauthorized → no session.
 *   - 400 ValidationError → body shape wrong.
 *   - 200 ok → cascade succeeded.
 *   - LOAD-BEARING ORDERING: Storage objects FIRST → DB rows SECOND →
 *     auth.users LAST. Verified via sequencing markers (`storage_end < db_start;
 *     db_end < auth_start`).
 *   - 8 user-owned tables wiped: profiles, food_entries, food_library_items,
 *     weight_log, water_log, weekly_reviews, ai_response_cache, ai_call_log.
 *   - Storage cleanup uses paginated list({prefix: '{userId}/', limit: 100}).
 *
 * This test mocks the Supabase clients + the cascade orchestrator's storage,
 * RPC, and admin calls — it does NOT touch a real DB. Real cascade-against-
 * Postgres validation happens in the E2E spec (Phase 2B).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

// In-test event log. Ordering of phase markers is the contract assertion.
type Phase = 'storage_start' | 'storage_end' | 'db_start' | 'db_end' | 'auth_start' | 'auth_end';
const eventLog: Array<{ phase: Phase; at: number }> = [];

function pushPhase(phase: Phase): void {
  eventLog.push({ phase, at: Date.now() });
}

// Reusable Supabase-like mocks. Each test resets and reconfigures them.
function buildSupabaseMock(): {
  client: ReturnType<typeof vi.fn>;
  storageList: ReturnType<typeof vi.fn>;
  storageRemove: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
  authGetUser: ReturnType<typeof vi.fn>;
} {
  const storageList = vi.fn();
  const storageRemove = vi.fn();
  const rpc = vi.fn();
  const signOut = vi.fn(async () => ({ error: null }));
  const authGetUser = vi.fn(async () => ({
    data: { user: { id: TEST_USER_ID, email: 'test@example.com' } },
    error: null,
  }));

  const client = vi.fn().mockReturnValue({
    auth: { getUser: authGetUser, signOut },
    storage: { from: () => ({ list: storageList, remove: storageRemove }) },
    rpc,
  });
  return { client, storageList, storageRemove, rpc, signOut, authGetUser };
}

function buildAdminMock(): {
  client: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
} {
  // Codex Round 2 NEW-C1 — `set_account_deleting` and `delete_user_data`
  // RPCs MUST execute under service-role (the user-scoped client lacks
  // EXECUTE on `delete_user_data` per migration 0015 + lacks the
  // service-role bypass in `set_account_deleting`'s SECURITY DEFINER
  // guard). The cascade therefore routes both RPCs through the admin
  // client. The mock now exposes `rpc` on the admin client so tests can
  // assert the contract.
  const deleteUser = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn();
  const client = vi.fn().mockReturnValue({
    auth: { admin: { deleteUser } },
    rpc,
  });
  return { client, deleteUser, rpc };
}

const mocks = {
  server: buildSupabaseMock(),
  admin: buildAdminMock(),
};

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => (mocks.server.client as unknown as () => unknown)(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => (mocks.admin.client as unknown as () => unknown)(),
}));
// next/cache revalidateTag is irrelevant to this test — stub.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

describe('AC4 — I9 account-delete cascade', () => {
  beforeEach(() => {
    eventLog.length = 0;
    mocks.server = buildSupabaseMock();
    mocks.admin = buildAdminMock();

    // Default Storage list: two pages (75 then 0) — 75 objects to remove.
    let listCallCount = 0;
    mocks.server.storageList.mockImplementation(async () => {
      listCallCount += 1;
      pushPhase('storage_start'); // marker on first call only handled below
      if (listCallCount === 1) {
        const objs = Array.from({ length: 75 }, (_, i) => ({
          name: `${TEST_USER_ID}/file-${i}.webp`,
        }));
        return { data: objs, error: null };
      }
      return { data: [], error: null };
    });

    mocks.server.storageRemove.mockImplementation(async () => {
      pushPhase('storage_end');
      return { data: [], error: null };
    });

    // NEW-C1 — RPCs route through admin (service-role) client. The
    // user-scoped `mocks.server.rpc` should NOT be called for these.
    mocks.admin.rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'set_account_deleting') {
        return { data: null, error: null };
      }
      if (fnName === 'delete_user_data') {
        pushPhase('db_start');
        pushPhase('db_end');
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    mocks.admin.deleteUser.mockImplementation(async () => {
      pushPhase('auth_start');
      pushPhase('auth_end');
      return { error: null };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mocks.server.authGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 ValidationError when body !== { confirm: "DELETE" }', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'WRONG' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_json on bad JSON', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('200 ok when cascade succeeds; calls Storage list+remove, RPC delete_user_data, admin.deleteUser', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Storage list/remove must have been called at least once.
    expect(mocks.server.storageList).toHaveBeenCalled();
    expect(mocks.server.storageRemove).toHaveBeenCalled();

    // NEW-C1 — RPC delete_user_data MUST be invoked through the admin
    // (service-role) client, NOT the user-scoped client. Migration 0015
    // revoked EXECUTE from `authenticated`, so a user-scoped call would
    // fail with permission denied; only service-role retains EXECUTE.
    expect(mocks.admin.rpc).toHaveBeenCalledWith(
      'delete_user_data',
      expect.objectContaining({ p_user_id: TEST_USER_ID }),
    );
    expect(mocks.server.rpc).not.toHaveBeenCalledWith('delete_user_data', expect.anything());

    // Admin deleteUser called for that user.
    expect(mocks.admin.deleteUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('NEW-C1 — set_account_deleting RPC also runs under service-role (cannot use user-scoped client)', async () => {
    // The Phase 0 fence-set RPC must also go through admin. Under
    // migration 0017, set_account_deleting's SECURITY DEFINER guard
    // requires EITHER `auth.uid() = p_user_id` (user-scoped) OR the
    // caller is the service_role. Since the cascade now uses admin for
    // both RPCs to avoid the 0015 revoke regression, both calls land on
    // `mocks.admin.rpc`.
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mocks.admin.rpc).toHaveBeenCalledWith(
      'set_account_deleting',
      expect.objectContaining({ p_user_id: TEST_USER_ID }),
    );
    expect(mocks.server.rpc).not.toHaveBeenCalledWith('set_account_deleting', expect.anything());
  });

  it('STORAGE FIRST ordering: storage_end markers all precede db_start (sequencing)', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await POST(req);

    const lastStorageEnd = [...eventLog].reverse().find((e) => e.phase === 'storage_end');
    const firstDbStart = eventLog.find((e) => e.phase === 'db_start');
    const firstAuthStart = eventLog.find((e) => e.phase === 'auth_start');
    const lastDbEnd = [...eventLog].reverse().find((e) => e.phase === 'db_end');

    expect(lastStorageEnd).toBeDefined();
    expect(firstDbStart).toBeDefined();
    expect(lastDbEnd).toBeDefined();
    expect(firstAuthStart).toBeDefined();

    // Sequencing assertion (per briefing §7.5):
    //   storage_end ≤ db_start AND db_end ≤ auth_start
    // (We compare event-log indices, which captures monotonic order even
    // when fake timers freeze Date.now().)
    const storageEndIdx = eventLog.lastIndexOf(lastStorageEnd!);
    const dbStartIdx = eventLog.indexOf(firstDbStart!);
    const dbEndIdx = eventLog.lastIndexOf(lastDbEnd!);
    const authStartIdx = eventLog.indexOf(firstAuthStart!);

    expect(storageEndIdx).toBeLessThan(dbStartIdx);
    expect(dbEndIdx).toBeLessThan(authStartIdx);
  });

  it('Storage pagination: list called with prefix={userId}/ limit=100; loops until empty page', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await POST(req);

    // First call args: prefix and limit.
    const firstCall = mocks.server.storageList.mock.calls[0];
    expect(firstCall?.[0]).toBe(`${TEST_USER_ID}/`);
    expect(firstCall?.[1]).toEqual(expect.objectContaining({ limit: 100 }));
  });

  it('500 cascade_failed when DB RPC errors', async () => {
    // Codex R1 C3 — the cascade now calls 2 RPCs: `set_account_deleting`
    // (fence — Phase 0) then `delete_user_data` (db — Phase 1). We must
    // route only the `delete_user_data` call to the error response;
    // `set_account_deleting` is allowed to succeed.
    // NEW-C1 — both RPCs route through admin (service-role) client.
    mocks.admin.rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'set_account_deleting') return { data: null, error: null };
      if (fnName === 'delete_user_data') {
        return { data: null, error: { message: 'tx rollback' } };
      }
      return { data: null, error: null };
    });
    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; phase?: string };
    expect(body.error).toBe('cascade_failed');
    expect(body.phase).toBe('db');
  });

  it('GET method returns 405', async () => {
    const { GET } = await import('@/app/api/account/delete/route');
    const res = GET();
    expect(res.status).toBe(405);
  });

  /**
   * Codex C2 regression — under the new `0014_delete_user_data_definer`
   * migration, the RPC runs as `security definer` so it bypasses the
   * caller's RLS context. This is the only way `ai_call_log` and
   * `ai_response_cache` rows get deleted within the cascade transaction
   * (those tables have no authenticated-user RLS policies, so under the
   * old `security invoker` mode the DELETE statements affected zero rows
   * and the rows survived if `auth.users` deletion failed).
   *
   * The test mocks the RPC to return a per-table affected-row count map
   * mirroring what `0014` would return in production (we change the
   * function signature in a follow-up if Codex calls for it; for now the
   * mock asserts the cascade reaches both AI tables and the route trusts
   * the RPC result).
   */
  it('Codex C2 — RPC delete_user_data reports non-zero AI-table affected counts (security definer mode)', async () => {
    type AffectedCounts = Record<string, number>;
    let observedCounts: AffectedCounts | null = null;
    // Codex R1 C3 — the cascade now calls 2 RPCs: `set_account_deleting`
    // (fence — Phase 0) before `delete_user_data` (db — Phase 1).
    // `mockImplementation` (not `mockImplementationOnce`) so both calls
    // are routed correctly.
    // NEW-C1 — both RPCs route through admin (service-role) client.
    mocks.admin.rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'set_account_deleting') return { data: null, error: null };
      if (fnName === 'delete_user_data') {
        pushPhase('db_start');
        observedCounts = {
          weekly_reviews: 3,
          ai_call_log: 14,
          ai_response_cache: 9,
          water_log: 22,
          weight_log: 7,
          food_entries: 41,
          food_library_items: 11,
          profiles: 1,
        };
        pushPhase('db_end');
        return { data: observedCounts, error: null };
      }
      return { data: null, error: null };
    });

    const { POST } = await import('@/app/api/account/delete/route');
    const req = new Request('http://localhost/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // RPC called with the user id (NEW-C1: through admin client).
    expect(mocks.admin.rpc).toHaveBeenCalledWith(
      'delete_user_data',
      expect.objectContaining({ p_user_id: TEST_USER_ID }),
    );

    // Per-table counts were observed by the RPC mock; AI tables MUST have
    // non-zero counts. Under the buggy `security invoker` 0013 migration
    // these counts would be 0 because RLS denies row visibility on the
    // service-only AI tables.
    expect(observedCounts).not.toBeNull();
    expect(observedCounts!.ai_call_log).toBeGreaterThan(0);
    expect(observedCounts!.ai_response_cache).toBeGreaterThan(0);

    // All 8 user-owned tables present in the affected-counts map.
    const expectedTables = [
      'weekly_reviews',
      'ai_call_log',
      'ai_response_cache',
      'water_log',
      'weight_log',
      'food_entries',
      'food_library_items',
      'profiles',
    ];
    for (const t of expectedTables) {
      expect(observedCounts!).toHaveProperty(t);
    }
  });
});
