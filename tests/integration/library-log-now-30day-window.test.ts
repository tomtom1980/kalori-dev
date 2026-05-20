/**
 * @vitest-environment node
 *
 * Task C.CODEX Fix 1 — `POST /api/library/[id]/log-now` 30-day backfill
 * window enforcement.
 *
 * Codex finding (CRITICAL):
 *   `/api/entries/save` rejects fresh inserts older than `now() - 30d - grace`
 *   per Task C.5 (PRD §3.5 + §6 + F-VERIFY-203), but
 *   `/api/library/[id]/log-now` accepts an optional `logged_at` and only
 *   checks future-skew — a crafted authenticated request can create
 *   arbitrarily old `food_entries` rows, bypassing the C.5 server guard
 *   and corrupting historical aggregates/counters outside the allowed
 *   backfill window.
 *
 * Contract (mirrors `/api/entries/save`):
 *   - `logged_at` BEFORE `now() - 30d - grace` → 400 + `{ error: 'logged_at_too_old' }`.
 *   - `logged_at` AT EXACTLY `now() - 30d` → accepted (boundary inclusive).
 *   - Existing future-skew guard `'logged_at_future'` preserved with max 30s
 *     verbatim (regression check).
 *   - Idempotent replay semantics preserved — a `client_id` retry for an
 *     entry persisted >30d ago must still return 200/replayed (the C.5
 *     R2 fix ordering — guard fires AFTER the I11 SELECT for FRESH inserts
 *     only).
 *
 * Mirrors `tests/integration/entries-save-30day-window.test.ts` mock
 * topology, adapted to the log-now route's additional reads:
 *   - orphan-profile fence (`profiles.id, onboarding_completed_at`)
 *   - deleting fence (`profiles.deleting_at`)
 *   - timezone lookup (`profiles.timezone`)
 *   - library snapshot SELECT (`food_library_items` by id+user+!tombstone)
 *   - TOCTOU post-insert recheck (`food_library_items` by id+user+!tombstone)
 *   - counter bump COUNT + UPDATE
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type BuildOptions = {
  existingRow?: Row | null;
  insertError?: { code?: string; message?: string } | null;
};

type Calls = {
  inserted: Row | null;
  selectCount: number;
};

const LIBRARY_ITEM_ID = 'cccccccc-1111-4111-8111-111111111111';
const USER_ID = 'u-1';

function buildMocks(opts: BuildOptions = {}) {
  const calls: Calls = {
    inserted: null,
    selectCount: 0,
  };
  const existingRow = opts.existingRow ?? null;

  // Profile reads: orphan fence reads `id, onboarding_completed_at`; the
  // deleting fence reads `deleting_at`; the route also reads `timezone`.
  // We discriminate on the requested columns so all three reads resolve
  // to the right shape.
  const profileTable = {
    select: (cols?: string) => ({
      eq: () => ({
        single: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          if (cols && cols.includes('timezone')) {
            return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
          }
          return {
            data: { id: USER_ID, onboarding_completed_at: '2024-01-01T00:00:00Z' },
            error: null,
          };
        },
        maybeSingle: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          if (cols && cols.includes('timezone')) {
            return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
          }
          return {
            data: { id: USER_ID, onboarding_completed_at: '2024-01-01T00:00:00Z' },
            error: null,
          };
        },
      }),
    }),
  };

  // Pre-insert SELECT (I11 idempotency) returns existingRow once, then null.
  let firstSelectHit = existingRow;
  const entriesTable = {
    select: (_cols?: string, opts2?: { count?: string; head?: boolean }) => {
      if (opts2?.count === 'exact' && opts2.head) {
        // Counter bump COUNT chain — terminate on 2nd eq().
        return {
          eq: () => ({
            eq: () => Promise.resolve({ count: 1, error: null }),
          }),
        };
      }
      // I11 pre-insert SELECT.
      return {
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
      };
    },
    insert: (payload: Row) => ({
      select: () => ({
        single: async () => {
          calls.inserted = payload;
          if (opts.insertError) {
            return { data: null, error: opts.insertError };
          }
          return {
            data: {
              id: 'entry-1',
              ...payload,
            },
            error: null,
          };
        },
      }),
    }),
    delete: () => ({
      eq: () => ({
        eq: async () => ({ error: null, count: 1 }),
      }),
    }),
  };

  // food_library_items: snapshot SELECT (3 .eq/is chained) + TOCTOU recheck
  // (also 3-chain) + counter UPDATE.
  const libraryTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({
              data: {
                id: LIBRARY_ITEM_ID,
                display_name: 'pho-bo',
                default_portion: 1,
                default_unit: 'bowl',
                nutrition: {
                  kcal: 420,
                  macros: { protein_g: 25, carbs_g: 50, fat_g: 12, fiber_g: 2 },
                  micros: {},
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      eq: () => ({
        eq: () => ({
          is: async () => ({ data: null, error: null, count: 1 }),
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
    data: { user: { id: USER_ID } },
    error: null,
  }));

  return { from, getUser, calls };
}

describe('POST /api/library/[id]/log-now — 30-day backfill window (Codex C.CODEX Fix 1)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Fixed-clock so the 30-day boundary case is exact. Mirrors
    // entries-save-30day-window.test.ts.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
    vi.doUnmock('@sentry/nextjs');
  });

  async function postBody(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/library/[id]/log-now/route');
    return POST(
      new Request(`http://kalori.test/api/library/${LIBRARY_ITEM_ID}/log-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: LIBRARY_ITEM_ID }) },
    );
  }

  const validBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    meal_category: 'breakfast' as const,
  };

  function mockEverything(from: unknown, getUser: unknown) {
    vi.doMock('server-only', () => ({}));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@sentry/nextjs', () => ({
      captureException: vi.fn(),
      addBreadcrumb: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
  }

  it('rejects-31-days-past: returns 400 + { error: "logged_at_too_old" } AND no insert', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: thirtyOneDaysAgo });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    // Error shape must match /api/entries/save verbatim (load-bearing for
    // client error-message routing — same as C.5 contract).
    expect(json.error).toBe('logged_at_too_old');
    expect(calls.inserted).toBeNull();
  });

  it('accepts-exactly-30-days: boundary case is inclusive — returns 200 + inserts', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    const exactlyThirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: exactlyThirtyDaysAgo });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('grace-buffer: 30d minus 1 second still passes (mirror of save-route grace)', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    // -30d minus 1 second — within the grace, must pass.
    const oneSecondPast = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 1_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: oneSecondPast });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });

  it('grace-buffer-narrow: 30d + 5 minutes is still rejected (grace does not silently extend contract)', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    // 30d + 5min is outside the 4-min grace; must reject.
    const fiveMinutesPastWindow = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000,
    ).toISOString();
    const res = await postBody({ ...validBody, logged_at: fiveMinutesPastWindow });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_too_old');
    expect(calls.inserted).toBeNull();
  });

  it('future-skew-over-30-seconds-still-rejected (regression)', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    const beyondToleranceFuture = new Date(Date.now() + 31_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: beyondToleranceFuture });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_future');
    expect(calls.inserted).toBeNull();
  });

  it('idempotent-replay-old-entry: client_id retry for entry persisted >30d ago returns 200 + replayed, NOT 400', async () => {
    // Mirror of /api/entries/save R2 Finding #1 — the guard must run AFTER
    // the I11 SELECT so retries for old entries are honoured.
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const persistedRow: Row = {
      id: 'entry-old-1',
      user_id: USER_ID,
      client_id: validBody.client_id,
      logged_at: fortyFiveDaysAgo,
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: LIBRARY_ITEM_ID,
      items: [{ name: 'pho-bo', portion: 1, unit: 'bowl', kcal: 420 }],
      ai_reasoning: null,
    };
    const { from, getUser, calls } = buildMocks({ existingRow: persistedRow });
    mockEverything(from, getUser);

    const res = await postBody({ ...validBody, logged_at: fortyFiveDaysAgo });
    // Pre-fix would return 400 if the guard ran before SELECT; the
    // implementation MUST keep the guard AFTER the I11 SELECT for replays.
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(json.replayed).toBe(true);
    expect(json.entry.id).toBe('entry-old-1');
    expect(calls.inserted).toBeNull();
  });

  it('within-30d-window (5 days ago) accepted — happy backfill path', async () => {
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postBody({ ...validBody, logged_at: fiveDaysAgo });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
    expect(calls.inserted?.logged_at).toBe(fiveDaysAgo);
  });

  it('no-logged-at: defaults to now() — no rejection (omitted body field, normal log-now click)', async () => {
    // Regression — when client omits `logged_at`, route defaults to
    // `new Date().toISOString()`, which is well inside the window.
    const { from, getUser, calls } = buildMocks();
    mockEverything(from, getUser);

    const res = await postBody({ ...validBody });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
  });
});
