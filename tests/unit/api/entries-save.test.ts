/**
 * @vitest-environment node
 *
 * Task 3.4 — `POST /api/entries/save` unit tests.
 *
 * Scope: route-handler behaviour with a fully mocked Supabase client.
 *   - I11 idempotency (synthesis §5.1): 2 POSTs same client_id → 1 row, 2nd
 *     returns `replayed: true`.
 *   - I12 cache-tag: `revalidateTag(TAGS.userEntries(uid, day))` fires on
 *     fresh insert AND on replay.
 *   - Zod-strict: unknown keys → 400.
 *   - Unauth: getUser null → 401.
 *   - Internal errors → 500.
 *
 * Integration-level cross-user-collision test lives in
 * `tests/integration/entries-save-cross-user-collision.test.ts` (real DB).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type BuildOptions = {
  /** Row returned by pre-insert SELECT — null when no existing row. */
  existingRow?: Row | null;
  /** Row returned by INSERT path (if no pre-existing row). */
  insertRow?: Row;
  /** Error code to inject into the INSERT terminal. */
  insertError?: { code?: string; message?: string } | null;
  /** Row returned by 23505 re-SELECT path. */
  raceReSelectRow?: Row | null;
  /** Profile row returned by the profile SELECT (for timezone lookup). */
  profileRow?: Row | null;
};

type Calls = {
  revalidated: string[];
  inserted: Row | null;
  selectCount: number;
  /**
   * Task 4.7.3 — payload captured from the `food_library_items` insert (or
   * `null` when no library insert was attempted). Used by the B2 save-to-
   * library tests to assert server-computed `normalized_name` + full
   * nutrition-row shape.
   */
  libraryInserted: Row | null;
  /** Count of library-table insert attempts (catches duplicate-insert regressions). */
  libraryInsertCount: number;
};

/**
 * Build a mocked Supabase client + a revalidateTag spy.
 *
 * The route does roughly:
 *   1. SELECT from profiles (timezone).
 *   2. SELECT from food_entries WHERE user_id + client_id.
 *   3. If hit → return replayed.
 *   4. Else INSERT; on 23505 → re-SELECT same WHERE → return replayed.
 *   5. revalidateTag(...)
 */
function buildMocks(opts: BuildOptions = {}) {
  const calls: Calls = {
    revalidated: [],
    inserted: null,
    selectCount: 0,
    libraryInserted: null,
    libraryInsertCount: 0,
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
    // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at (fail-closed).
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
            // After 23505 re-SELECT path, further calls should find the row
            // that the concurrent insert committed.
            if (opts.raceReSelectRow !== undefined && !firstSelectHit) {
              firstSelectHit = opts.raceReSelectRow;
            }
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
    insert: (payload: Row) => {
      calls.libraryInserted = payload;
      calls.libraryInsertCount += 1;
      return {
        select: () => ({
          single: async () => ({
            data: { id: 'lib-1', ...payload },
            error: null,
          }),
        }),
      };
    },
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

describe('POST /api/entries/save', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
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
    logged_at: '2026-04-21T10:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
  } as const;

  it('fresh insert: returns 200 + entry + fires revalidateTag with user-TZ day', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(json.entry).toBeDefined();
    expect(json.replayed).toBeUndefined();
    // day: 2026-04-21 10:00 UTC = 17:00 Asia/Ho_Chi_Minh → day '2026-04-21'
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-21');
  });

  it('I11 replay: second POST with same client_id → 200 + replayed:true, no second insert', async () => {
    const existing = {
      id: 'existing-row',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: validBody.items,
    };
    const { from, getUser, calls } = buildMocks({ existingRow: existing });
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(json.entry.id).toBe('existing-row');
    expect(json.replayed).toBe(true);
    expect(calls.inserted).toBeNull();
    // revalidateTag still fires on replay (idempotent tag write is cheap).
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-21');
  });

  it('23505 race: insert raises 23505 → re-SELECT → return replayed', async () => {
    const raceRow = {
      id: 'race-row',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: validBody.items,
    };
    const { from, getUser, calls } = buildMocks({
      existingRow: null,
      raceReSelectRow: raceRow,
      insertError: { code: '23505', message: 'duplicate key' },
    });
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entry: Row; replayed?: boolean };
    expect(json.replayed).toBe(true);
    expect(json.entry.id).toBe('race-row');
  });

  it('rejects unknown keys with 400 (zod .strict())', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({ ...validBody, hacker: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when getUser returns null user', async () => {
    const { from } = buildMocks();
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'invalid' },
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(401);
  });

  // Task 4.7.3 — server now COMPUTES normalized_name from items[0].name; the
  // client no longer sends it. This test locks the contract: when the body
  // omits `normalized_name`, the route still creates a library row and fires
  // the cache tag.
  it('save_to_library=true with no dedup match inserts library row + fires userLibrary tag', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validBody,
      save_to_library: true,
      // No normalized_name — server computes it from items[0].name = 'eggs'.
    });
    expect(res.status).toBe(200);
    expect(calls.revalidated).toContain('user:u-1:library');
    // Server-computed: normalizeName('eggs') === 'eggs'.
    expect(calls.libraryInserted?.normalized_name).toBe('eggs');
  });

  // ---------------------------------------------------------------------------
  // Task 4.7.3 — B2 save-to-library server fix.
  //
  // Background: ConfirmationScreen.save() never sends `normalized_name`, but
  // the prior route gated the entire library-insert block on
  // `body.normalized_name`, producing a silent no-op. The fix moves the
  // normalization server-side via the canonical `normalizeName` helper and
  // persists the FULL nutrition row (kcal + macros + micros), not just kcal.
  // ---------------------------------------------------------------------------
  describe('save-to-library — server-computed normalized_name + full nutrition (Task 4.7.3)', () => {
    it('B2: persists library row with token-sorted normalized_name + full nutrition + display_name', async () => {
      const { from, getUser, calls } = buildMocks();
      const revalidateTag = vi.fn((tag: string) => {
        calls.revalidated.push(tag);
      });
      vi.doMock('next/cache', () => ({ revalidateTag }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        // Crucial: NO normalized_name in body — locks the regression.
        items: [
          {
            name: 'Pho Bo',
            portion: 1,
            unit: 'bowl',
            kcal: 450,
            macros: { protein_g: 28, carbs_g: 50, fat_g: 12, fiber_g: 3 },
            micros: { sodium_mg: 1200 },
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(calls.libraryInsertCount).toBe(1);
      expect(calls.libraryInserted).toBeTruthy();
      const row = calls.libraryInserted as Row;
      // normalizeName('Pho Bo') → tokens ['pho','bo'] → sort → 'bo pho'.
      expect(row.normalized_name).toBe('bo pho');
      expect(row.display_name).toBe('Pho Bo');
      expect(row.created_from).toBe('text');
      expect(row.user_id).toBe('u-1');
      // FULL nutrition shape — kcal + macros + micros.
      const nutrition = row.nutrition as {
        kcal: number;
        macros: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
        micros: Record<string, number>;
      };
      expect(nutrition.kcal).toBe(450);
      expect(nutrition.macros.protein_g).toBe(28);
      expect(nutrition.macros.carbs_g).toBe(50);
      expect(nutrition.macros.fat_g).toBe(12);
      expect(nutrition.macros.fiber_g).toBe(3);
      expect(nutrition.micros.sodium_mg).toBe(1200);
      // Cache tag still fires.
      expect(calls.revalidated).toContain('user:u-1:library');
    });

    it('defaults macros to zeros and micros to {} when items[0].macros / micros are missing', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        items: [{ name: 'Eggs', portion: 2, unit: 'pc', kcal: 140 }],
      });

      expect(res.status).toBe(200);
      const row = calls.libraryInserted as Row;
      const nutrition = row.nutrition as {
        kcal: number;
        macros: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
        micros: Record<string, number>;
      };
      expect(nutrition.kcal).toBe(140);
      expect(nutrition.macros).toEqual({
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
      });
      expect(nutrition.micros).toEqual({});
    });

    it('regression: save_to_library=false does NOT insert library row', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: false,
      });

      expect(res.status).toBe(200);
      expect(calls.libraryInsertCount).toBe(0);
      expect(calls.libraryInserted).toBeNull();
    });

    it("source: 'manual' with save_to_library=true does NOT insert library row (created_from CHECK guard)", async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        source: 'manual',
        save_to_library: true,
      });

      // Entry insert still succeeds.
      expect(res.status).toBe(200);
      // Library insert SKIPPED — `food_library_items.created_from` only allows
      // 'text' | 'photo'; inserting with 'manual' would 23514.
      expect(calls.libraryInsertCount).toBe(0);
      expect(calls.libraryInserted).toBeNull();
    });

    it('whitespace-only first-item name → no library insert (NOT NULL guard)', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        items: [{ name: '   ', portion: 1, unit: 'pc', kcal: 100 }],
      });

      // Entry-side: Zod requires name.min(1); '   ' has length 3 so it passes
      // schema, but normalizeName collapses to '' which would violate the
      // library NOT NULL constraint. Route must skip the library insert.
      expect(res.status).toBe(200);
      expect(calls.libraryInsertCount).toBe(0);
      expect(calls.libraryInserted).toBeNull();
    });

    it("Vietnamese diacritics: 'Phở bò' normalizes to 'bo pho'", async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        items: [
          {
            name: 'Phở bò',
            portion: 1,
            unit: 'bowl',
            kcal: 450,
          },
        ],
      });

      expect(res.status).toBe(200);
      const row = calls.libraryInserted as Row;
      expect(row.normalized_name).toBe('bo pho');
      // Display preserves the original Unicode.
      expect(row.display_name).toBe('Phở bò');
    });

    it('server IGNORES client-supplied normalized_name and ALWAYS recomputes from items[0].name', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      // Hostile client: sends a malicious `normalized_name` that disagrees
      // with `items[0].name`. Server must trust the computed value.
      const res = await postBody({
        ...validBody,
        save_to_library: true,
        normalized_name: 'attacker_supplied_value',
        items: [{ name: 'Eggs', portion: 2, unit: 'pc', kcal: 140 }],
      });

      expect(res.status).toBe(200);
      const row = calls.libraryInserted as Row;
      expect(row.normalized_name).toBe('eggs');
      expect(row.normalized_name).not.toBe('attacker_supplied_value');
    });

    // AC1 (REV 2 — Task A.1) -------------------------------------------------
    //
    // The save-to-library success path MUST invoke
    // `revalidatePath('/library', 'page')` so that Next.js's client-side
    // Router Cache (segment cache used by `<Link>` prefetcher) drops its
    // stale prefetched /library payload after the new row commits. Without
    // this call, a post-save navigation to /library serves the prefetch
    // captured before the insert (within the ~30s prefetch TTL) and the
    // newly created row is not visible until the prefetch expires or the
    // user hard-refreshes — the exact symptom logged as issuelog #4.
    //
    // The existing `revalidateTag(TAGS.userLibrary(uid), 'max')` is KEPT
    // alongside this call as forward-compat for the eventual
    // `cacheComponents: true` flip (per the lib/dashboard/fetch.ts +
    // lib/aggregations/progress-fetch.ts precedent — `revalidateTag` calls
    // are no-ops under the current cache mode but become load-bearing once
    // readers register cacheTag subscriptions).
    it('AC1: save_to_library=true fires revalidatePath(/library, page) for router-cache invalidation', async () => {
      const { from, getUser, calls } = buildMocks();
      // `revalidatePath(path, type?)` — capture both args; type is optional
      // but our route always passes 'page', so the assertion below uses
      // a 2-tuple match.
      const revalidatePathCalls: Array<[string] | [string, string]> = [];
      const revalidateTag = vi.fn((tag: string) => {
        calls.revalidated.push(tag);
      });
      const revalidatePath = vi.fn((path: string, type?: string) => {
        if (type === undefined) {
          revalidatePathCalls.push([path]);
        } else {
          revalidatePathCalls.push([path, type]);
        }
      });
      vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
      });

      expect(res.status).toBe(200);
      // `revalidatePath('/library', 'page')` must fire exactly once on the
      // success path. Type argument 'page' (not 'layout') invalidates the
      // /library leaf segment + its layout chain, which is the correct
      // surface — the masthead + filter rail are layout-level peers but
      // the new row appears in the leaf grid.
      expect(revalidatePathCalls).toContainEqual(['/library', 'page']);
      // Existing tag fire is RETAINED (forward-compat).
      expect(calls.revalidated).toContain('user:u-1:library');
    });

    // AC1-error-path (Task A.1 Codex Round 1) ---------------------------------
    //
    // Codex Critical Finding B: when `food_library_items` INSERT returns a
    // PostgREST error ({ data: null, error: <PostgrestError> }) — RLS denial,
    // 23505 unique-violation, schema drift, etc. — Supabase RESOLVES rather
    // than throws. The pre-fix code awaited the chain without destructuring
    // `error`, so the unconditional `revalidateTag` + new `revalidatePath`
    // calls would fire AS IF the insert succeeded, producing the exact
    // "cache lying about library state" symptom Task A.1 was created to fix.
    //
    // The fix:
    //   1. Destructure `{ data: libRow, error: libError }` from the chain.
    //   2. Guard `revalidateTag` + `revalidatePath` behind `!libError`.
    //   3. On `libError !== null`, call `Sentry.captureException(libError, …)`
    //      so PostgREST failures surface in production observability rather
    //      than silently 200-ing while the library row is missing.
    //
    // The route still returns 200 because the food entry write (load-bearing)
    // already committed; the library row is enrichment-only (design-doc §10.3).
    // ---------------------------------------------------------------------------
    it('AC1-error-path: when food_library_items INSERT errors, route does NOT invalidate cache and emits Sentry signal', async () => {
      const { from, getUser, calls } = buildMocks();

      // Override the libraryTable mock so insert returns { data: null, error }.
      // We rebuild the `from` dispatcher to keep entriesTable + profileTable
      // intact while flipping libraryTable to the error shape.
      const libError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      };
      const errorLibraryTable = {
        insert: (payload: Row) => {
          calls.libraryInserted = payload;
          calls.libraryInsertCount += 1;
          return {
            select: () => ({
              single: async () => ({ data: null, error: libError }),
            }),
          };
        },
      };
      const wrappedFrom = vi.fn((table: string) => {
        if (table === 'food_library_items') return errorLibraryTable;
        return from(table);
      });

      const revalidatePathCalls: Array<[string] | [string, string]> = [];
      const revalidateTag = vi.fn((tag: string) => {
        calls.revalidated.push(tag);
      });
      const revalidatePath = vi.fn((path: string, type?: string) => {
        if (type === undefined) {
          revalidatePathCalls.push([path]);
        } else {
          revalidatePathCalls.push([path, type]);
        }
      });
      const captureException = vi.fn();
      vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
      vi.doMock('@sentry/nextjs', () => ({ captureException }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from: wrappedFrom }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
      });

      // Route still returns 200 — entry write succeeded; library failure
      // is enrichment-only.
      expect(res.status).toBe(200);
      // Library insert was attempted (and failed).
      expect(calls.libraryInsertCount).toBe(1);
      // CRITICAL: no library cache invalidation when insert errored.
      expect(revalidatePathCalls).not.toContainEqual(['/library', 'page']);
      expect(calls.revalidated).not.toContain('user:u-1:library');
      // Sentry observability fired for the failed library insert.
      expect(captureException).toHaveBeenCalledTimes(1);
      const [capturedError] = captureException.mock.calls[0] ?? [];
      expect(capturedError).toBe(libError);
    });
  });

  it('caps ai_reasoning at 500 chars (F11)', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validBody,
      ai_reasoning: 'x'.repeat(501),
    });
    expect(res.status).toBe(400);
  });

  // F-UI-3.6-B-3 (I10) — Zod accepts any ISO datetime but doesn't bound the
  // future. A buggy / tampered client could stamp an entry far in the future
  // and corrupt the day-bucket + dashboard aggregates.
  it('rejects logged_at far in the future with 400 + no insert', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const farFuture = '2100-01-01T00:00:00.000Z';
    const res = await postBody({ ...validBody, logged_at: farFuture });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_future');
    expect(calls.inserted).toBeNull();
  });

  it('allows logged_at within 5-minute clock-skew tolerance of now', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const nearFuture = new Date(Date.now() + 60_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: nearFuture });
    expect(res.status).toBe(200);
  });

  // F-UI-3.6-B-4 — replay-day must use the PERSISTED row's logged_at, not
  // the (possibly mutated) incoming body. Otherwise a client that edits
  // logged_at and retries invalidates the cache for the wrong day bucket.
  it('I11 replay: revalidateTag uses the PERSISTED row logged_at day, not the incoming body day', async () => {
    // Persisted row is on 2026-04-21 Asia/Ho_Chi_Minh (original day).
    const persistedRow: Row = {
      id: 'row-1',
      user_id: 'u-1',
      client_id: validBody.client_id,
      logged_at: '2026-04-21T10:00:00.000Z', // HCM: 17:00 → 2026-04-21
      meal_category: 'breakfast',
      source: 'text',
      items: validBody.items,
    };
    const { from, getUser, calls } = buildMocks({ existingRow: persistedRow });
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Client retries the SAME client_id but with a DIFFERENT logged_at
    // (2026-04-20 in HCM). Server should IGNORE the incoming logged_at for
    // cache revalidation and use the persisted row's day.
    const res = await postBody({
      ...validBody,
      logged_at: '2026-04-20T10:00:00.000Z', // HCM: 17:00 → 2026-04-20
    });
    expect(res.status).toBe(200);
    // Must invalidate the ORIGINAL row's day, not the body's day.
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-21');
    expect(calls.revalidated).not.toContain('user:u-1:entries:2026-04-20');
  });

  it('23505 race: revalidateTag uses the RACE ROW logged_at day, not the incoming body day', async () => {
    const raceRow: Row = {
      id: 'race-row',
      user_id: 'u-1',
      client_id: validBody.client_id,
      // Race-committed row's day = 2026-04-20 HCM.
      logged_at: '2026-04-20T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: validBody.items,
    };
    const { from, getUser, calls } = buildMocks({
      existingRow: null,
      raceReSelectRow: raceRow,
      insertError: { code: '23505', message: 'duplicate key' },
    });
    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validBody,
      // Incoming body logged_at = 2026-04-21 HCM — different from race row.
      logged_at: '2026-04-21T10:00:00.000Z',
    });
    expect(res.status).toBe(200);
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-20');
    expect(calls.revalidated).not.toContain('user:u-1:entries:2026-04-21');
  });
});
