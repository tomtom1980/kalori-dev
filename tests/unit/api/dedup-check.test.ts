/**
 * @vitest-environment node
 *
 * Task 3.4 — `POST /api/library/dedup-check` unit tests.
 *
 * Contract (synthesis §5.3):
 *   - Zod-strict body: `{ normalized_name: string (1..200) }`.
 *   - Auth required.
 *   - Returns `{ match: FoodLibraryItem | null }`. Exact equality, no fuzzy.
 *   - No cache-tag writes (read-only).
 *   - RLS scopes per-user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

function buildMocks(opts: { matchRow?: Row | null } = {}) {
  const match = opts.matchRow ?? null;
  // Chain mirrors the route query (Task 4.7.2): user_id filter →
  // tombstone filter → normalized_name filter → maybeSingle.
  const libraryTable = {
    select: () => ({
      eq: () => ({
        is: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: match, error: null }),
          }),
        }),
      }),
    }),
  };
  // Task A.3 — fence preflight reads `profiles` for orphan detection
  // (cols `'id, onboarding_completed_at'`). Return a happy-path row so
  // the fence resolves and the route's own dedup query runs.
  const profilesTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { id: 'u-1', onboarding_completed_at: '2026-01-01T00:00:00.000Z' },
          error: null,
        }),
      }),
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === 'food_library_items') return libraryTable;
    if (table === 'profiles') return profilesTable;
    throw new Error(`unknown table: ${table}`);
  });
  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));
  return { from, getUser };
}

describe('POST /api/library/dedup-check', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  async function post(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/library/dedup-check/route');
    return POST(
      new Request('http://kalori.test/api/library/dedup-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('returns match:null when no existing row', async () => {
    const { from, getUser } = buildMocks({ matchRow: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({ normalized_name: 'eggs' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { match: unknown };
    expect(json.match).toBeNull();
  });

  it('returns existing library item when exact match', async () => {
    const row = {
      id: 'lib-1',
      user_id: 'u-1',
      normalized_name: 'eggs',
      display_name: 'Eggs',
    };
    const { from, getUser } = buildMocks({ matchRow: row });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({ normalized_name: 'eggs' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { match: Row };
    expect(json.match.id).toBe('lib-1');
  });

  it('400 on missing body field', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    const { from } = buildMocks();
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'no session' },
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({ normalized_name: 'eggs' });
    expect(res.status).toBe(401);
  });
});
