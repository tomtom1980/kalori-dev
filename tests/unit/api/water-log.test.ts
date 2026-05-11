/**
 * @vitest-environment node
 *
 * Task 3.5 Milestone 3.1 — `POST /api/water/log` unit tests.
 *
 * Contract (architecture §5 + briefing §6.1 + bugfix-tomi 2026-05-09-water-
 * custom-button Codex R1 C1+C2 atomic RPC migration 0018):
 *   - Zod-strict body { client_id (UUID), unit ('glass'|'bottle'|'ml'),
 *     count (positive int), logged_on ('YYYY-MM-DD') }.
 *   - Auth guard via `getServerSupabase().auth.getUser()` → 401 on miss.
 *   - I11 idempotency, daily-cap (5000 ml) enforcement, 23505 race
 *     resolution, and post-write totalMl aggregation are all performed
 *     atomically inside the `log_water_with_cap` RPC (migration 0018).
 *     Tests mock `supabase.rpc('log_water_with_cap', ...)` directly.
 *   - I12 cache-tag: `revalidateTag(TAGS.userEntries(uid, logged_on))` fires
 *     on every success path (fresh + replay). No TAGS.userWater factory —
 *     reuses the per-day entries tag (synthesis §7).
 *   - Cap reject: RPC raises P0010 'over_daily_limit' with `details` set
 *     to the pre-write total. Route maps to HTTP 409 + contract body.
 *   - Generic DB errors (including the C1 fail-closed cap-evaluation
 *     read failure path) → 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type RpcOutcome =
  | {
      kind: 'success';
      row: Row;
      replayed?: boolean;
      total_ml: number;
    }
  | {
      kind: 'cap_reject';
      currentTotalMl: number;
    }
  | {
      kind: 'under_reject';
      currentTotalMl: number;
    }
  | {
      kind: 'db_error';
      message?: string;
    };

type BuildOptions = {
  /**
   * The single outcome the mocked RPC returns for the under-test request.
   * Mirrors the {row, replayed, total_ml} jsonb returned by
   * `public.log_water_with_cap` (migration 0018) on success, the P0010
   * exception on cap reject, and a generic Postgres error on DB failure.
   */
  rpcOutcome?: RpcOutcome;
};

type Calls = {
  revalidated: string[];
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
};

function buildMocks(opts: BuildOptions = {}) {
  const calls: Calls = {
    revalidated: [],
    rpcCalls: [],
  };

  const outcome = opts.rpcOutcome ?? {
    kind: 'success',
    row: {
      id: 'w-row-1',
      user_id: 'u-1',
      client_id: 'wc-1',
      date: '2026-04-22',
      count: 1,
      unit: 'glass',
    },
    total_ml: 250,
  };

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.rpcCalls.push({ fn, args });
    if (outcome.kind === 'success') {
      return {
        data: {
          row: outcome.row,
          replayed: outcome.replayed ?? false,
          total_ml: outcome.total_ml,
        },
        error: null,
      };
    }
    if (outcome.kind === 'cap_reject') {
      return {
        data: null,
        error: {
          code: 'P0010',
          message: 'over_daily_limit',
          details: String(outcome.currentTotalMl),
        },
      };
    }
    if (outcome.kind === 'under_reject') {
      return {
        data: null,
        error: {
          code: 'P0013',
          message: 'under_daily_limit',
          details: String(outcome.currentTotalMl),
        },
      };
    }
    // db_error — covers BOTH C1 fail-closed (cap-eval SELECT failure
    // inside the RPC raises out into rpcError) AND any generic
    // Postgres failure path. The route returns 500 for either.
    return {
      data: null,
      error: {
        code: '40001',
        message: outcome.message ?? 'transient database error',
      },
    };
  });

  // The route still does NOT call `from('water_log')` — every water
  // operation now goes through the RPC. We keep a `from` mock that
  // throws for water_log so a regression that re-introduces the
  // SUM-then-insert pattern blows up loudly.
  const from = vi.fn((table: string) => {
    // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at and
    // fails closed (HTTP 503) on read error. Tests must provide a mock
    // that returns `{ deleting_at: null }` for happy-path coverage.
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
            single: async () => ({ data: { deleting_at: null }, error: null }),
          }),
        }),
      };
    }
    if (table === 'water_log') {
      throw new Error(
        'Regression guard: route must use the log_water_with_cap RPC, not direct water_log SELECT/INSERT. ' +
          'See bugfix-tomi 2026-05-09-water-custom-button Codex R1 C2.',
      );
    }
    throw new Error(`unknown table in test: ${table}`);
  });

  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));

  return { from, getUser, rpc, calls };
}

describe('POST /api/water/log', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  async function postBody(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/water/log/route');
    return POST(
      new Request('http://kalori.test/api/water/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  const validBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    unit: 'glass',
    count: 1,
    logged_on: '2026-04-22',
  } as const;

  it('fresh insert: returns 200 + row + fires revalidateTag(userEntries) + invokes RPC with correct args', async () => {
    const { from, getUser, rpc, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { row: Row; replayed?: boolean; totalMl?: number };
    expect(json.row).toBeDefined();
    expect(json.replayed).toBeUndefined();
    expect(json.totalMl).toBe(250);
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-22');
    // RPC contract — route forwards body fields verbatim.
    expect(calls.rpcCalls).toHaveLength(1);
    const rpcCall = calls.rpcCalls[0];
    if (!rpcCall) throw new Error('rpcCall missing');
    expect(rpcCall.fn).toBe('log_water_with_cap');
    expect(rpcCall.args).toEqual({
      p_client_id: validBody.client_id,
      p_date: validBody.logged_on,
      p_count: validBody.count,
      p_unit: validBody.unit,
    });
  });

  it('I11 replay: RPC reports replayed=true → 200 + replayed:true + totalMl from RPC', async () => {
    const existing = {
      id: 'existing-w-row',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      date: '2026-04-22',
      count: 1,
      unit: 'glass',
    };
    const { from, getUser, rpc, calls } = buildMocks({
      rpcOutcome: { kind: 'success', row: existing, replayed: true, total_ml: 750 },
    });
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { row: Row; replayed?: boolean; totalMl?: number };
    expect(json.row.id).toBe('existing-w-row');
    expect(json.replayed).toBe(true);
    expect(json.totalMl).toBe(750);
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-22');
  });

  it('23505 race resolution is handled inside the RPC and surfaces as replayed=true', async () => {
    const raceRow = {
      id: 'race-w-row',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      date: '2026-04-22',
      count: 1,
      unit: 'glass',
    };
    const { from, getUser, rpc } = buildMocks({
      rpcOutcome: { kind: 'success', row: raceRow, replayed: true, total_ml: 250 },
    });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { row: Row; replayed?: boolean; totalMl?: number };
    expect(json.replayed).toBe(true);
    expect(json.row.id).toBe('race-w-row');
    expect(json.totalMl).toBe(250);
  });

  it('rejects unknown keys with 400 (zod .strict())', async () => {
    const { from, getUser, rpc } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody({ ...validBody, hacker: 'bad' });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const { from, getUser, rpc } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody({ client_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid logged_on format', async () => {
    const { from, getUser, rpc } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody({ ...validBody, logged_on: '2026/04/22' });
    expect(res.status).toBe(400);
  });

  it('rejects non-positive count', async () => {
    const { from, getUser, rpc } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody({ ...validBody, count: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 401 when getUser returns null user', async () => {
    const { from, rpc } = buildMocks();
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'invalid' },
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));
    const res = await postBody(validBody);
    expect(res.status).toBe(401);
  });

  // R3-C2-prime (bugfix-tomi 2026-05-09-water-fab-ux Codex round 3) —
  // the route returns an authoritative `totalMl` for the user's logged_on
  // day. As of the Codex R1 C1+C2 atomic-RPC fix, this value is now
  // computed INSIDE the `log_water_with_cap` RPC (migration 0018) so the
  // pre-write SUM, the cap check, the INSERT, and the post-write SUM
  // share a single transaction. These tests assert the route forwards
  // the RPC's `total_ml` to the client unchanged.
  describe('R3-C2-prime — server-authoritative totalMl', () => {
    it('fresh insert: response body totalMl == RPC total_ml', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: { id: 'w-row-1' },
          total_ml: 750,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { row: Row; totalMl?: number };
      expect(json.totalMl).toBe(750);
    });

    it('I11 replay: response totalMl == RPC total_ml on replay', async () => {
      const existing = {
        id: 'existing-w-row',
        user_id: 'u-1',
        client_id: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-22',
        count: 1,
        unit: 'glass',
      };
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: { kind: 'success', row: existing, replayed: true, total_ml: 750 },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { row: Row; replayed?: boolean; totalMl?: number };
      expect(json.replayed).toBe(true);
      expect(json.totalMl).toBe(750);
    });
  });

  it('GET returns 405', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: {}, from: () => ({}), rpc: vi.fn() }),
    }));
    const { GET } = await import('@/app/api/water/log/route');
    const res = GET();
    expect(res.status).toBe(405);
  });

  // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — daily water cap
  // enforcement at MAX_DAILY_WATER_ML = 5000 ml. The cap is now evaluated
  // inside the `log_water_with_cap` RPC (Codex R1 C1+C2 fix, migration
  // 0018) under a per-(user, date) advisory lock. The route maps the
  // RPC's P0010 'over_daily_limit' exception to HTTP 409 with the
  // contract body { error, currentTotalMl, limitMl }.
  describe('Bug-1 — daily water cap (5000 ml) server enforcement', () => {
    it('rejects with 409 OVER_DAILY_LIMIT when RPC raises P0010', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: { kind: 'cap_reject', currentTotalMl: 4750 },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({ ...validBody, unit: 'bottle', count: 1 });
      expect(res.status).toBe(409);
      const json = (await res.json()) as {
        error: string;
        currentTotalMl: number;
        limitMl: number;
      };
      expect(json.error).toBe('OVER_DAILY_LIMIT');
      expect(json.currentTotalMl).toBe(4750);
      expect(json.limitMl).toBe(5000);
    });

    it('cap-reject body shape matches contract { error, currentTotalMl, limitMl }', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: { kind: 'cap_reject', currentTotalMl: 4800 },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(409);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.error).toBe('OVER_DAILY_LIMIT');
      expect(typeof json.currentTotalMl).toBe('number');
      expect(json.currentTotalMl).toBe(4800);
      expect(json.limitMl).toBe(5000);
    });

    it('underflow reject maps to 409 UNDER_DAILY_LIMIT with current total', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: { kind: 'under_reject', currentTotalMl: 500 },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '88888888-8888-4888-8888-888888888888',
        unit: 'ml',
        count: -1000,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(409);
      const json = (await res.json()) as {
        error: string;
        currentTotalMl: number;
        limitMl: number;
      };
      expect(json.error).toBe('UNDER_DAILY_LIMIT');
      expect(json.currentTotalMl).toBe(500);
      expect(json.limitMl).toBe(0);
    });

    it('boundary success: RPC returns total_ml=5000 → 200', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: {
            id: 'boundary-row',
            user_id: 'u-1',
            client_id: '11111111-1111-4111-8111-111111111111',
            date: '2026-04-22',
            count: 1,
            unit: 'glass',
          },
          total_ml: 5000,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { totalMl?: number };
      expect(json.totalMl).toBe(5000);
    });

    it('idempotent replay returns 200 even if RPC reports a 5000 ml total (replay does not re-evaluate cap)', async () => {
      const existing = {
        id: 'existing-w-row',
        user_id: 'u-1',
        client_id: '11111111-1111-4111-8111-111111111111',
        date: '2026-04-22',
        count: 1,
        unit: 'glass',
      };
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: existing,
          replayed: true,
          total_ml: 5000,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { row: Row; replayed?: boolean; totalMl?: number };
      expect(json.replayed).toBe(true);
      expect(json.totalMl).toBe(5000);
    });
  });

  // Codex Round 1 C1 (bugfix-tomi 2026-05-09-water-custom-button) — the
  // prior implementation read `await computeDayTotalMl(...) ?? 0` and
  // used the coerced 0 for the cap check, so a transient PostgREST/RLS
  // read error silently bypassed the cap. The atomic RPC moves the
  // cap evaluation INSIDE the transaction; any DB error there raises
  // out into rpcError and the route returns 500 (fail closed).
  describe('Codex R1 C1 — fail closed on totals/cap-eval DB error', () => {
    it('RPC returns a non-cap DB error → route returns 500 (no fail-open with total=0)', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'db_error',
          message: 'pgrst-aggregation-failure',
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      // The cap evaluation happens inside the RPC. A DB read failure
      // there MUST NOT be silently coerced to total=0 + INSERT — it
      // surfaces as 500.
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error?: string };
      expect(json.error).toBe('db_error');
    });

    it('RPC returns null data without error → route returns 500 (defensive)', async () => {
      const { from, getUser } = buildMocks();
      const rpc = vi.fn(async () => ({ data: null, error: null }));
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error?: string };
      expect(json.error).toBe('empty_rpc_result');
    });
  });

  // Codex Round 1 C2 (bugfix-tomi 2026-05-09-water-custom-button) —
  // SUM-then-insert was not atomic. The route now calls the
  // `log_water_with_cap` RPC (migration 0018) which serializes
  // concurrent posts via per-(user, date) advisory lock. End-to-end
  // concurrency proofs require a live database (the advisory lock is a
  // Postgres primitive and cannot be simulated meaningfully in JS-side
  // mocks). At the unit-test layer we verify the route invokes the RPC
  // for EVERY call site instead of issuing direct SUM/INSERT against
  // water_log. The `from('water_log')` mock above throws if hit — that
  // throw is the regression guard.
  describe('Codex R1 C2 — atomic RPC replaces SUM-then-insert', () => {
    it('every successful POST goes through the log_water_with_cap RPC (no direct water_log access)', async () => {
      const { from, getUser, rpc, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(200);
      // Single RPC invocation; zero direct water_log SELECT/INSERT
      // attempts (the from-mock throws on water_log).
      expect(calls.rpcCalls).toHaveLength(1);
      const rpcCall = calls.rpcCalls[0];
      if (!rpcCall) throw new Error('rpcCall missing');
      expect(rpcCall.fn).toBe('log_water_with_cap');
    });

    it('cap reject also routes through the RPC (no fallback to JS-side SUM-then-insert)', async () => {
      const { from, getUser, rpc, calls } = buildMocks({
        rpcOutcome: { kind: 'cap_reject', currentTotalMl: 4750 },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody(validBody);
      expect(res.status).toBe(409);
      expect(calls.rpcCalls).toHaveLength(1);
    });
  });

  // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — `unit:'ml'`
  // per-row count cap was lifted from 200 to 5000 so the dashboard's
  // EDIT surface can POST a single delta up to the full daily allowance.
  // The cap remains 200 for `unit:'glass'|'bottle'` (no rationale to
  // lift). Daily-total cap (5 L) still enforced at the aggregate layer
  // (now inside the RPC).
  describe('Bug-2 — per-row count cap split per unit', () => {
    it('unit:"ml" count up to 5000 passes Zod (custom-amount EDIT delta)', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: {
            id: 'ml-w-1',
            user_id: 'u-1',
            client_id: '22222222-2222-4222-8222-222222222222',
            date: '2026-04-22',
            count: 1000,
            unit: 'ml',
          },
          total_ml: 1000,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '22222222-2222-4222-8222-222222222222',
        unit: 'ml',
        count: 1000,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(200);
    });

    it('unit:"ml" count = 5000 (boundary) passes Zod', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: {
            id: 'ml-w-2',
            user_id: 'u-1',
            client_id: '33333333-3333-4333-8333-333333333333',
            date: '2026-04-22',
            count: 5000,
            unit: 'ml',
          },
          total_ml: 5000,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '33333333-3333-4333-8333-333333333333',
        unit: 'ml',
        count: 5000,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(200);
    });

    it('unit:"ml" count = -5000 (negative boundary) passes Zod', async () => {
      const { from, getUser, rpc } = buildMocks({
        rpcOutcome: {
          kind: 'success',
          row: {
            id: 'ml-w-negative',
            user_id: 'u-1',
            client_id: '99999999-9999-4999-8999-999999999999',
            date: '2026-04-22',
            count: -5000,
            unit: 'ml',
          },
          total_ml: 0,
        },
      });
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '99999999-9999-4999-8999-999999999999',
        unit: 'ml',
        count: -5000,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(200);
    });

    it('unit:"ml" count = 5001 fails Zod ValidationError (above 5000 ceiling)', async () => {
      const { from, getUser, rpc } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '44444444-4444-4444-8444-444444444444',
        unit: 'ml',
        count: 5001,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('ValidationError');
    });

    it('unit:"ml" count = -5001 fails Zod ValidationError (below negative ceiling)', async () => {
      const { from, getUser, rpc } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        unit: 'ml',
        count: -5001,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('ValidationError');
    });

    it('unit:"glass" count = 201 still fails Zod (per-row cap unchanged for glass)', async () => {
      const { from, getUser, rpc } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '55555555-5555-4555-8555-555555555555',
        unit: 'glass',
        count: 201,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('ValidationError');
    });

    it('unit:"bottle" count = 201 still fails Zod (per-row cap unchanged for bottle)', async () => {
      const { from, getUser, rpc } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '66666666-6666-4666-8666-666666666666',
        unit: 'bottle',
        count: 201,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('ValidationError');
    });

    it('unit:"ml" count = 0 fails Zod (positive() unchanged)', async () => {
      const { from, getUser, rpc } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
      }));
      const res = await postBody({
        client_id: '77777777-7777-4777-8777-777777777777',
        unit: 'ml',
        count: 0,
        logged_on: '2026-04-22',
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('ValidationError');
    });
  });
});
