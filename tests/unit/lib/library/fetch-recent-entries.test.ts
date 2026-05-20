/**
 * @vitest-environment node
 *
 * Task C.2 (US-STAB-C2) — unit tests for `fetchRecentEntries`.
 *
 * Contract (briefing §"Files NEW", §"Recent Entries section", consumed by
 * `<RecentEntriesSection />` as `ReadonlyArray<RecentEntry>`):
 *
 *   - Return shape: `RecentEntry[]` — `{ entry_id, food_name, calories,
 *     logged_at, meal_category, library_item_id, portion_label }`.
 *   - Pulls last-N `food_entries` rows for the user, ordered by
 *     `logged_at DESC`.
 *   - Filters out rows older than 14 days (default — configurable via
 *     `windowDays` option) using `.gte('logged_at', cutoffIso)`.
 *   - Caps result set via PostgREST `.range(0, maxRows - 1)` (lesson #5).
 *   - RLS-scoped: caller passes `userId`, helper applies
 *     `.eq('user_id', userId)`.
 *   - Soft-fail: never throws on Supabase error — returns `[]`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

interface FilterCall {
  method: string;
  args: unknown[];
}

/**
 * Build a Supabase `food_entries` SELECT mock that records every filter
 * call. The returned chain is fully chainable in any order and resolves
 * to `result` when awaited at the `.range()` terminal.
 */
function makeRecentEntriesMock(
  calls: FilterCall[],
  result: { data: Row[] | null; error: unknown },
): unknown {
  const chain = {
    select(...args: unknown[]) {
      calls.push({ method: 'select', args });
      return chain;
    },
    eq(...args: unknown[]) {
      calls.push({ method: 'eq', args });
      return chain;
    },
    gte(...args: unknown[]) {
      calls.push({ method: 'gte', args });
      return chain;
    },
    order(...args: unknown[]) {
      calls.push({ method: 'order', args });
      return chain;
    },
    range(...args: unknown[]) {
      calls.push({ method: 'range', args });
      return Promise.resolve(result);
    },
  };
  return chain;
}

describe('lib/library/fetchRecentEntries', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('server-only');
    vi.doUnmock('@sentry/nextjs');
  });

  it('returns [] when no entries in the last 14 days', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const result = await fetchRecentEntries('u-1');

    expect(result).toEqual([]);
    expect(calls.some((c) => c.method === 'select')).toBe(true);
  });

  it('applies .range(0, maxRows - 1) so PostgREST 1000-row default does not silently truncate', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    await fetchRecentEntries('u-1', { maxRows: 10 });

    const rangeCall = calls.find((c) => c.method === 'range');
    expect(rangeCall).toBeDefined();
    expect(rangeCall!.args).toEqual([0, 9]);
  });

  it('respects a custom maxRows cap', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    await fetchRecentEntries('u-1', { maxRows: 5 });

    const rangeCall = calls.find((c) => c.method === 'range');
    expect(rangeCall!.args).toEqual([0, 4]);
  });

  it('filters to logged_at >= now() - 14 days via .gte() (default window)', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const beforeMs = Date.now();
    await fetchRecentEntries('u-1');
    const afterMs = Date.now();

    const gteCall = calls.find((c) => c.method === 'gte');
    expect(gteCall).toBeDefined();
    expect(gteCall!.args[0]).toBe('logged_at');
    const cutoffIso = gteCall!.args[1] as string;
    const cutoffMs = Date.parse(cutoffIso);
    const expectedMin = beforeMs - 14 * 24 * 60 * 60 * 1000 - 1000;
    const expectedMax = afterMs - 14 * 24 * 60 * 60 * 1000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('respects a custom windowDays option', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const beforeMs = Date.now();
    await fetchRecentEntries('u-1', { windowDays: 7 });
    const afterMs = Date.now();

    const gteCall = calls.find((c) => c.method === 'gte');
    const cutoffMs = Date.parse(gteCall!.args[1] as string);
    const expectedMin = beforeMs - 7 * 24 * 60 * 60 * 1000 - 1000;
    const expectedMax = afterMs - 7 * 24 * 60 * 60 * 1000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('orders by logged_at DESC (most recent first)', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    await fetchRecentEntries('u-1');

    const orderCall = calls.find((c) => c.method === 'order');
    expect(orderCall).toBeDefined();
    expect(orderCall!.args[0]).toBe('logged_at');
    expect(orderCall!.args[1]).toMatchObject({ ascending: false });
  });

  it('scopes by user_id (RLS defense-in-depth)', async () => {
    vi.doMock('server-only', () => ({}));
    const calls: FilterCall[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock(calls, { data: [], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    await fetchRecentEntries('user-42');

    const userIdEqCall = calls.find((c) => c.method === 'eq' && c.args[0] === 'user_id');
    expect(userIdEqCall).toBeDefined();
    expect(userIdEqCall!.args[1]).toBe('user-42');
  });

  it('maps DB rows to the public RecentEntry shape', async () => {
    vi.doMock('server-only', () => ({}));
    const dbRow = {
      id: 'entry-1',
      logged_at: '2026-05-14T12:00:00Z',
      meal_category: 'breakfast',
      source: 'library',
      library_item_id: '11111111-1111-4111-8111-111111111111',
      items: [
        {
          name: 'Pho Bo',
          portion: 400,
          unit: 'g',
          kcal: 520,
        },
      ],
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock([], { data: [dbRow], error: null }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const result = await fetchRecentEntries('u-1');

    expect(result).toHaveLength(1);
    const e = result[0]!;
    expect(e.entry_id).toBe('entry-1');
    expect(e.food_name).toBe('Pho Bo');
    expect(e.calories).toBe(520);
    expect(e.logged_at).toBe('2026-05-14T12:00:00Z');
    expect(e.meal_category).toBe('breakfast');
    expect(e.library_item_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(e.portion_label).toBe('400 g');
  });

  it('returns [] (and never throws) on Supabase error — caller renders empty state', async () => {
    // Codex R1 Finding 4 fix added a Sentry.captureException call before
    // the empty-array return. Mock the import so this test stays pure
    // (no real Sentry SDK traffic during unit runs).
    vi.doMock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () =>
          makeRecentEntriesMock([], {
            data: null,
            error: { code: '500', message: 'connection_failed' },
          }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const result = await fetchRecentEntries('u-1');

    // Soft-fail: never surface the error up the RSC tree.
    expect(result).toEqual([]);
  });

  it('captures Supabase error to Sentry before returning empty fallback (Codex R1 Finding 4)', async () => {
    // Adversarial test for Codex R1 Finding 4 (MEDIUM). PostgREST errors
    // are resolved values, not thrown exceptions — Sentry's auto-
    // instrumentation does NOT see them. Without this capture, an RLS or
    // schema outage looks identical to "no recent logs" to operators.
    // Contract: `Sentry.captureException(err)` MUST be called BEFORE the
    // empty-array return path.
    const captureExceptionMock = vi.fn();
    vi.doMock('@sentry/nextjs', () => ({
      captureException: captureExceptionMock,
    }));
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () =>
          makeRecentEntriesMock([], {
            data: null,
            error: { code: '42P01', message: 'relation does not exist' },
          }),
      }),
    }));

    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const result = await fetchRecentEntries('u-1');

    // Soft-fail return shape preserved (no contract change per
    // F-C2-FRONTEND-BACKEND-CONTRACT-RECONCILE followup).
    expect(result).toEqual([]);
    // Sentry capture fired BEFORE the empty-array return.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const firstCall = captureExceptionMock.mock.calls[0]!;
    const capturedError = firstCall[0] as { code?: string; message?: string };
    expect(capturedError.code).toBe('42P01');
    const captureContext = firstCall[1] as
      | { tags?: { component?: string; scope?: string } }
      | undefined;
    expect(captureContext?.tags?.component).toBe('fetch-recent-entries');
  });

  it('normalizes invalid meal_category to "snack"', async () => {
    vi.doMock('server-only', () => ({}));
    const dbRow = {
      id: 'entry-2',
      logged_at: '2026-05-14T12:00:00Z',
      meal_category: 'WEIRD_VALUE',
      items: [{ name: 'X', kcal: 100 }],
    };
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        from: () => makeRecentEntriesMock([], { data: [dbRow], error: null }),
      }),
    }));
    const { fetchRecentEntries } = await import('@/lib/library/fetchRecentEntries');
    const result = await fetchRecentEntries('u-1');
    expect(result[0]!.meal_category).toBe('snack');
  });
});
