/**
 * @vitest-environment node
 *
 * Task C.5 — `POST /api/entries/save` 30-day backfill window enforcement.
 *
 * Contract (PRD §3.5 + §6 + verification-report.md §F-VERIFY-203):
 *   - `logged_at` BEFORE `now() - 30 days` → 400 + `{ error: 'logged_at_too_old' }`.
 *   - `logged_at` AT EXACTLY `now() - 30 days` → accepted (the window is
 *     inclusive on the lower bound).
 *   - Existing future-skew guard `'logged_at_future'` preserved with max 30s
 *     verbatim (regression check).
 *
 * Mirrors the mock topology of `tests/unit/api/entries-save.test.ts`. Uses
 * `vi.useFakeTimers` so the boundary cases are deterministic across CI clock
 * drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type BuildOptions = {
  existingRow?: Row | null;
  insertRow?: Row;
  insertError?: { code?: string; message?: string } | null;
  profileRow?: Row | null;
};

type Calls = {
  revalidated: string[];
  inserted: Row | null;
  selectCount: number;
};

function buildMocks(opts: BuildOptions = {}) {
  const calls: Calls = {
    revalidated: [],
    inserted: null,
    selectCount: 0,
  };
  const profileRow = opts.profileRow ?? { id: 'u-1', timezone: 'Asia/Ho_Chi_Minh' };
  const existingRow = opts.existingRow ?? null;
  const insertRow = opts.insertRow ?? {
    id: 'row-1',
    user_id: 'u-1',
    client_id: 'cid-1',
    logged_at: '2026-04-21T10:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    ai_reasoning: null,
  };

  const profileTable = {
    select: (cols?: string) => ({
      eq: () => ({
        single: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: profileRow, error: null };
        },
        maybeSingle: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: profileRow, error: null };
        },
      }),
    }),
  };

  let firstSelectHit = existingRow;
  const entriesTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.selectCount += 1;
            const row = firstSelectHit;
            firstSelectHit = null;
            return { data: row, error: null };
          },
        }),
      }),
    }),
    insert: (payload: Row) => ({
      select: () => ({
        single: async () => {
          calls.inserted = payload;
          if (opts.insertError) {
            return { data: null, error: opts.insertError };
          }
          return { data: insertRow, error: null };
        },
      }),
    }),
  };

  const libraryTable = {
    insert: (payload: Row) => ({
      select: () => ({
        single: async () => ({
          data: { id: 'lib-1', ...payload },
          error: null,
        }),
      }),
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileTable;
    if (table === 'food_entries') return entriesTable;
    if (table === 'food_library_items') return libraryTable;
    throw new Error(`unknown table in test: ${table}`);
  });

  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));

  return { from, getUser, calls };
}

describe('POST /api/entries/save — 30-day backfill window (Task C.5)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Fixed-clock so the 30-day boundary case is exact. The future-skew
    // guard and the new past-30d guard both compute `Date.now()` at request
    // receipt, so freezing the clock pins both bounds.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  async function postBody(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/entries/save/route');
    return POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  const validBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    meal_category: 'breakfast' as const,
    source: 'text' as const,
    items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
  };

  it('rejects-31-days-past: returns 400 + { error: "logged_at_too_old" } AND no insert (AC3)', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: thirtyOneDaysAgo });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_too_old');
    expect(calls.inserted).toBeNull();
  });

  it('accepts-exactly-30-days: boundary case is inclusive — returns 200 + inserts (AC4)', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const exactlyThirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: exactlyThirtyDaysAgo });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('AC4-precision: client-displayed minimum stays valid under realistic mount-to-submit delay (Codex R1 grace buffer)', async () => {
    // Reproduces Codex finding #1: the TimeEditor pins `nowAtMount` lazily at
    // mount and formats `min` to MINUTE precision. The server recomputes the
    // 30-day bound with a fresh `Date.now()` at request receipt. Network
    // latency + minute-slice truncation + modal-open time means the value the
    // user CAN CLICK (`min` attribute) is up to ~60s STALER than the server's
    // computed bound. Without a grace buffer, the user's selection of the
    // displayed minimum is rejected as `logged_at_too_old` despite being a
    // valid, in-window selection from the user's perspective.
    //
    // Fix: server's lower bound subtracts a 2-minute grace so the client's
    // displayed `min` is always inside the accepted window even with realistic
    // mount-to-submit delay. The grace covers minute-slice (~60s),
    // modal-open-time drift (~60s typical), and network latency.
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Simulate the bug: client picks `now - 30d` at MOUNT time. THEN time
    // advances 30 seconds before the request actually lands on the server.
    // Pre-fix: server computes (Date.now() - 30d), the client's value is now
    // 30s OLDER than the server's bound, so the request fails.
    const clientNowAtMount = Date.now();
    const clientMinValue = new Date(clientNowAtMount - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Advance the system clock 30 seconds to simulate mount-to-submit delay.
    vi.setSystemTime(new Date(clientNowAtMount + 30_000));

    const res = await postBody({ ...validBody, logged_at: clientMinValue });
    // With the 2-minute grace buffer: passes. Without it: 400.
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('AC4-precision: grace buffer does NOT extend the contract by hours — 5min past 30d still rejected', async () => {
    // Defense-in-depth on the previous test — verify the grace is narrow
    // (~minutes) and does not silently extend the 30-day contract.
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // 30 days + 5 minutes is outside the grace — must still reject.
    const fiveMinutesPastWindow = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000,
    ).toISOString();
    const res = await postBody({ ...validBody, logged_at: fiveMinutesPastWindow });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_too_old');
    expect(calls.inserted).toBeNull();
  });

  it('AC4-precision: -30d minus 1 second still passes (well inside grace)', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // -30d minus 1 second — within the 2-minute grace, should pass.
    const oneSecondPast = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 1_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: oneSecondPast });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('future-skew-over-30-seconds-still-rejected (regression)', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const beyondToleranceFuture = new Date(Date.now() + 31_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: beyondToleranceFuture });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    // CRITICAL — the existing error shape `'logged_at_future'` is load-bearing
    // for client error-message routing. C.5 must NOT regress it.
    expect(json.error).toBe('logged_at_future');
    expect(calls.inserted).toBeNull();
  });

  it('within-30-second-future-skew still accepted (regression for clock-drift tolerance)', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const nearFuture = new Date(Date.now() + 29_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: nearFuture });
    expect(res.status).toBe(200);
  });

  // Codex Round 2 — Finding #1 regression: the R1 30-day past guard runs
  // BEFORE the existing idempotency SELECT, so a retry under the same
  // `client_id` for an entry already persisted >30d ago is rejected with 400
  // instead of the original row (200/replayed). Breaks the route's
  // idempotency contract under offline-then-online retry scenarios.
  //
  // Fix: reorder the route handler so the idempotency lookup runs BEFORE the
  // backfill-too-old guard. The guard remains in place for NEW saves; replays
  // are honoured regardless of the persisted row's age.
  it('R2-idempotency-replay-old-entry: client_id retry for entry persisted >30d ago returns 200 + replayed, NOT 400', async () => {
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const persistedRow: Row = {
      id: 'row-old-1',
      user_id: 'u-1',
      client_id: validBody.client_id,
      logged_at: fortyFiveDaysAgo,
      meal_category: 'breakfast',
      source: 'text',
      items: validBody.items,
      ai_reasoning: null,
    };
    const { from, getUser, calls } = buildMocks({ existingRow: persistedRow });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Retry the same client_id with the same old logged_at — replay path.
    const res = await postBody({ ...validBody, logged_at: fortyFiveDaysAgo });
    // Pre-fix: 400 logged_at_too_old (guard fires before SELECT).
    // Post-fix: 200 with original row + replayed: true.
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(json.replayed).toBe(true);
    expect(json.entry.id).toBe('row-old-1');
    expect(calls.inserted).toBeNull();
  });

  // Codex Round 2 — Finding #2: the R1 2-minute grace is insufficient under
  // the worst-case staleness budget. Breakdown:
  //   - datetime-local minute truncation: up to 59s (floor)
  //   - modal-open-to-submit drift: ~60-90s (user reads + adjusts)
  //   - network latency: a few hundred ms (negligible)
  // Worst case: ~150s of staleness between displayed `min` and server's
  // Date.now(). The R1 2-minute (120s) grace is insufficient; expand to 4
  // minutes (240s).
  it('R2-AC4-precision-minute-trunc: client at minute boundary mounts, submits its displayed min ~3 minutes later — request accepted', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Simulate: client mounts at T, picks `floor(T to minute) - 30d` as the
    // displayed `min`. The user reads + adjusts for ~3 minutes 30 seconds
    // before submitting. Server receives the request at T + 210s and
    // recomputes its lower bound as (T + 210s) - 30d - grace.
    //
    // With 2-min (120s) grace: client value at T-30d is at T+210s-30d-120s =
    // T+90s-30d, so client's T-30d is 90s OLDER than server's bound → 400.
    // With 4-min (240s) grace: server bound = T+210s-30d-240s = T-30s-30d, so
    // client's T-30d is 30s NEWER than server's bound → 200.
    const clientNowAtMount = Date.now();
    // Floor to minute — datetime-local input truncates seconds.
    const flooredToMinute = Math.floor(clientNowAtMount / 60_000) * 60_000;
    const clientMinValue = new Date(flooredToMinute - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Advance clock 3 minutes 30 seconds (210s — within 4min grace, beyond
    // the old 2min grace).
    vi.setSystemTime(new Date(clientNowAtMount + 210_000));

    const res = await postBody({ ...validBody, logged_at: clientMinValue });
    // Pre-fix (2-min grace): 400. Post-fix (4-min grace): 200.
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('within-30d-window (5 days ago) accepted — happy backfill path (AC2 server contract)', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: fiveDaysAgo });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
    // Insert payload preserved the backfilled timestamp — no silent
    // overwrite to `now()`.
    expect(calls.inserted?.logged_at).toBe(fiveDaysAgo);
  });
});
