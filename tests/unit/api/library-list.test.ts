/**
 * @vitest-environment node
 *
 * `GET /api/library/list` — client-hydration source for the LibraryTab when
 * the LogFlow modal opens from a chrome trigger (FAB / `n` keybinding /
 * meal-column +ADD) instead of `/log` direct-nav.
 *
 * Contract:
 *   - Auth required via `requireProfileOrJson401` (Task A.3 fence).
 *   - On success: 200 + `{ items: LogLibraryItem[] }` (mapped via
 *     `toLogLibraryItem`).
 *   - On orphan profile: 401 + `{ error: 'profile_lookup_failed' }`.
 *   - On transient profile-lookup error: 503 +
 *     `{ error: 'profile_lookup_unavailable' }` (does NOT trigger
 *     refresh-interceptor sign-out).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

function buildMocks(
  opts: {
    libraryRows?: Row[];
    profileRow?: Row | null;
    profileError?: { message: string } | null;
    user?: { id: string } | null;
  } = {},
) {
  const libraryRows = opts.libraryRows ?? [];

  // Sweep: .delete().eq().not().lt().select() — needs to resolve before the
  // active-list SELECT. We don't assert on it; just need the chain to await.
  const sweepBuilder = {
    eq: () => ({
      not: () => ({
        lt: () => ({
          select: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
  // Active list: .select().eq().is().order() — final await yields { data, error }.
  const activeListThenable = {
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: libraryRows, error: null }),
  };
  const libraryTable = {
    delete: () => sweepBuilder,
    select: () => ({
      eq: () => ({
        is: () => ({
          order: () => activeListThenable,
        }),
      }),
    }),
  };

  // Profile fence — runs before the library query.
  const profileRow =
    opts.profileRow === undefined
      ? { id: 'u-1', onboarding_completed_at: '2026-01-01T00:00:00.000Z' }
      : opts.profileRow;
  const profilesTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: profileRow,
          error: opts.profileError ?? null,
        }),
      }),
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'food_library_items') return libraryTable;
    if (table === 'profiles') return profilesTable;
    throw new Error(`unknown table: ${table}`);
  });

  const userValue = opts.user === undefined ? { id: 'u-1' } : opts.user;
  const getUser = vi.fn(async () => ({
    data: { user: userValue },
    error: userValue ? null : { message: 'no session' },
  }));

  return { from, getUser };
}

const ROW_PHO: Row = {
  id: 'lib-1',
  client_id: 'c-1',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 350,
  default_unit: 'g',
  nutrition: {
    kcal: 520,
    macros: { protein_g: 32, carbs_g: 48, fat_g: 14, fiber_g: 3 },
  },
  thumbnail_url: 'https://cdn/pho.jpg',
  log_count: 12,
  last_used_at: '2026-04-20T12:00:00.000Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-03-01T00:00:00.000Z',
};

describe('GET /api/library/list', () => {
  beforeEach(() => {
    vi.resetModules();
    // `server-only` is a build-time guard not available at Vitest runtime —
    // stubbed per the `library-fetch-list.test.ts` precedent so the route's
    // transitive `lib/library/fetch.ts` import resolves.
    vi.doMock('server-only', () => ({}));
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('server-only');
  });

  async function get(): Promise<Response> {
    const { GET } = await import('@/app/api/library/list/route');
    return GET();
  }

  it('returns 200 with mapped LogLibraryItem array on success', async () => {
    const { from, getUser } = buildMocks({ libraryRows: [ROW_PHO] });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toEqual({
      id: 'lib-1',
      name: 'Pho Bo',
      kcal: 520,
      lastUsedIso: '2026-04-20T12:00:00.000Z',
      logCount: 12,
      defaultPortion: 350,
      proteinG: 32,
      carbsG: 48,
      fatG: 14,
      fiberG: 3,
      micros: {},
      // Phase 2C — fixture row lacks cholesterol_mg → mapper defaults to 0.
      cholesterolMg: 0,
      unit: 'g',
      thumbnailUrl: 'https://cdn/pho.jpg',
    });
  });

  it('returns 200 with empty array when user has no library items', async () => {
    const { from, getUser } = buildMocks({ libraryRows: [] });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[] };
    expect(json.items).toEqual([]);
  });

  it('returns 422 profile_lookup_failed when fence rejects (orphan profile)', async () => {
    // Codex R2 Improvement — orphan branch returns 422 (Unprocessable Entity),
    // not 401, to escape authFetch's session-expiry pattern. Body shape unchanged.
    const { from, getUser } = buildMocks({ profileRow: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(422);
    expect(res.status).not.toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('profile_lookup_failed');
  });

  it('returns 503 profile_lookup_unavailable on transient profile-lookup error', async () => {
    const { from, getUser } = buildMocks({
      profileRow: null,
      profileError: { message: 'connection reset' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('profile_lookup_unavailable');
  });

  it('returns 401 unauthenticated when no session (US-STAB-D2 canonical envelope)', async () => {
    const { from, getUser } = buildMocks({ user: null });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await get();
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    // Task D.2 (US-STAB-D2): body string flipped from 'unauthorized' to
    // 'unauthenticated' to match the canonical JSON 401 envelope. The
    // status remains 401 and the fence path remains the source of the
    // response.
    expect(json.error).toBe('unauthenticated');
  });
});
