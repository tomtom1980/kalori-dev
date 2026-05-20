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
  /** Error code to inject into the alcohol ledger insert terminal. */
  alcoholInsertError?: { code?: string; message?: string } | null;
  /** Existing alcohol ledger row returned by replay repair lookup. */
  alcoholRow?: Row | null;
  /** Row returned by 23505 re-SELECT path. */
  raceReSelectRow?: Row | null;
  /** Profile row returned by the profile SELECT (for timezone lookup). */
  profileRow?: Row | null;
};

type Calls = {
  revalidated: string[];
  inserted: Row | null;
  alcoholInserted: Row | null;
  alcoholInsertCount: number;
  entryDeleteCount: number;
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
    alcoholInserted: null,
    alcoholInsertCount: 0,
    entryDeleteCount: 0,
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
    // Bug 1 + Codex R1: select() now supports BOTH the I11 idempotency
    // SELECT path (no opts) AND the COUNT chain used by save-to-library's
    // log_count derivation. The COUNT chain shape is
    // `.select('id', { count: 'exact', head: true }).eq().eq()` →
    // promise resolves with { count, error }.
    select: (_cols?: string, qopts?: { count?: string; head?: boolean }) => {
      if (qopts?.count === 'exact' && qopts.head) {
        return {
          eq: () => ({
            eq: () => Promise.resolve({ count: 1, error: null }),
          }),
        };
      }
      return {
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
      };
    },
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
    // Link UPDATE chain used by Bug 1 + Codex R1 fix:
    //   .update({ library_item_id }).eq('id', x).eq('user_id', y)
    // No-op terminal — returns { error: null } so the route continues.
    update: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null, count: 1 }),
      }),
    }),
    delete: () => ({
      eq: () => ({
        eq: async () => {
          calls.entryDeleteCount += 1;
          return { error: null };
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
    // Bug 1 + Codex R1 (C1 + I1): 23505-recovery SELECT chain.
    //   .select('id, log_count')
    //     .eq('user_id', u).eq('normalized_name', n).is('deleted_at', null).maybeSingle()
    // Default mock returns null (no existing row) — happy path doesn't
    // trigger this chain anyway because libRow is truthy.
    select: (cols?: string, qopts?: { count?: string; head?: boolean }) => {
      if (qopts?.count === 'exact' && qopts.head) {
        return {
          eq: () => ({
            gte: () => ({
              lt: async () => ({ count: 0, error: null }),
            }),
          }),
        };
      }
      if (cols === 'id') {
        return {
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: { id: '66666666-6666-4666-8666-666666666666' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    },
    // Bump UPDATE chain used by Bug 1 + Codex R1 fix:
    //   .update({ log_count, last_used_at })
    //     .eq('id', x).eq('user_id', u).is('deleted_at', null)
    update: () => ({
      eq: () => ({
        eq: () => ({
          is: () => Promise.resolve({ error: null }),
        }),
      }),
    }),
  };

  const alcoholTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: opts.alcoholRow === undefined ? { id: 'alc-existing' } : opts.alcoholRow,
          error: null,
        }),
      }),
    }),
    insert: (payload: Row) => {
      calls.alcoholInserted = payload;
      calls.alcoholInsertCount += 1;
      return Promise.resolve({
        data: opts.alcoholInsertError ? null : { id: 'alc-1', ...payload },
        error: opts.alcoholInsertError ?? null,
      });
    },
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileTable;
    if (table === 'food_entries') return entriesTable;
    if (table === 'food_library_items') return libraryTable;
    if (table === 'alcohol_logs') return alcoholTable;
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

    it('persists AI recipe eligibility metadata when save_to_library creates a row', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        items: [
          {
            name: 'Pho Bo',
            portion: 1,
            unit: 'bowl',
            kcal: 450,
            recipeEligible: true,
            recipeEligibilityReason: 'mixed_dish',
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(calls.libraryInserted).toEqual(
        expect.objectContaining({
          recipe_eligibility: 'eligible',
          recipe_eligibility_reason: 'mixed_dish',
        }),
      );
      expect(calls.libraryInserted?.recipe_eligibility_checked_at).toEqual(expect.any(String));
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

    it('save_to_library=true with library_item_id links and bumps existing library item without inserting or changing serving defaults', async () => {
      const { from, getUser, calls } = buildMocks();
      vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => ({ auth: { getUser }, from }),
      }));

      const res = await postBody({
        ...validBody,
        save_to_library: true,
        library_item_id: '66666666-6666-4666-8666-666666666666',
        items: [
          {
            name: 'watermelon',
            portion: 1400,
            unit: 'g',
            kcal: 480,
            macros: { protein_g: 8, carbs_g: 112, fat_g: 2, fiber_g: 6 },
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(calls.inserted).toEqual(
        expect.objectContaining({
          library_item_id: '66666666-6666-4666-8666-666666666666',
        }),
      );
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

    // ---------------------------------------------------------------------
    // Bug 1 + Codex R1 follow-up (C1 + I1) — entry↔library link + 23505 recovery.
    //
    // Bug 1 (original): the save-to-library INSERT did NOT set `log_count` or
    // `last_used_at`. New library rows used DB defaults (`log_count = 0`,
    // `last_used_at = null`) so the LibraryCard "Nx logged" badge read `0×`
    // until the user re-logged the same item.
    //
    // Codex R1 findings (against the first-pass fix that hardcoded
    // `log_count: 1`):
    //   C1 (Critical): the new library row gets `log_count: 1`, but the
    //   food_entries row inserted earlier in the same request has
    //   `library_item_id = body.library_item_id ?? null` — it CANNOT point
    //   at the not-yet-created library row. The re-log path COUNT(*)s
    //   entries WHERE library_item_id = libRow.id. So the FIRST re-log
    //   writes log_count = 1 (only the re-log entry counted) instead of 2,
    //   permanently off-by-one.
    //
    //   I1 (Improvement): partial unique index on active
    //   (user_id, normalized_name) means two simultaneous save-to-library
    //   requests for the same food → only ONE library row exists. The
    //   losing INSERT gets 23505 and the route swallows the error → losing
    //   tab's contribution is silently dropped from log_count.
    //
    // The unified fix (single coherent invariant):
    //   1. Attempt the library INSERT.
    //   2. On 23505, SELECT the existing active row by
    //      (user_id, normalized_name) — winner-side's row.
    //   3. UPDATE food_entries to set library_item_id = libRow.id (the
    //      link step C1 demands).
    //   4. Derive log_count via COUNT(*) FROM food_entries WHERE
    //      library_item_id = libRow.id, matching the re-log COUNT pattern
    //      in `/api/library/[id]/log-now/route.ts:512-519`.
    // Fresh path: COUNT = 1 → log_count = 1.
    // Race path:  COUNT = 2 → log_count = 2 (both entries linked).
    // Re-log:     COUNT = 2 → log_count = 2 (no off-by-one).
    // ---------------------------------------------------------------------
    describe('Bug 1 + Codex R1 follow-up (C1 + I1) — link entry to library + 23505 recovery', () => {
      type ExtBuildOptions = {
        /** Inject error on the library_items INSERT (e.g. 23505 race). */
        libraryInsertError?: { code?: string; message?: string } | null;
        /** Existing active row returned by the 23505-recovery SELECT. */
        existingLibraryRow?: { id: string; log_count?: number } | null;
        /** True COUNT(*) of food_entries pointing at the library row. */
        libraryCountAfterLink?: number;
        /**
         * Codex R2 C1-R2 — inject error on the entry↔library link UPDATE.
         * The UPDATE chain is `.update(payload, { count: 'exact' }).eq().eq()`.
         * Tests inject a PostgREST error here to assert the route does NOT
         * bump log_count, does NOT invalidate cache, and does NOT enqueue
         * sketch when the link UPDATE fails.
         */
        linkUpdateError?: { code?: string; message?: string } | null;
        /**
         * Codex R2 C1-R2 — `count` returned by the link UPDATE chain. A
         * value of 0 means the UPDATE matched no rows (entry tombstoned in
         * the window; very rare since the row is brand-new). Same gate
         * applies: no bump, no invalidate, no enqueue.
         */
        linkUpdateAffectedCount?: number;
      };

      type ExtCalls = {
        linkUpdatePayload: Row | null;
        linkUpdateCount: number;
        libraryBumpPayload: Row | null;
        libraryBumpCount: number;
        libraryRecoverSelectCount: number;
        sketchEnqueueCount: number;
        sketchEnqueueArgs: Row | null;
      };

      function buildExtMocks(opts: ExtBuildOptions = {}) {
        const base = buildMocks();
        const ext: ExtCalls = {
          linkUpdatePayload: null,
          linkUpdateCount: 0,
          libraryBumpPayload: null,
          libraryBumpCount: 0,
          libraryRecoverSelectCount: 0,
          sketchEnqueueCount: 0,
          sketchEnqueueArgs: null,
        };

        const insertRow = {
          id: 'row-1',
          user_id: 'u-1',
          client_id: 'cid-1',
          logged_at: '2026-04-21T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
          ai_reasoning: null,
          library_item_id: null,
        };

        const entriesTable = {
          select: (_cols?: string, qopts?: { count?: string; head?: boolean }) => {
            // COUNT(*) chain — `.select('id', { count: 'exact', head: true })`
            // .eq().eq() → terminal promise with { count, error }.
            if (qopts?.count === 'exact' && qopts.head) {
              return {
                eq: () => ({
                  eq: () =>
                    Promise.resolve({
                      count: opts.libraryCountAfterLink ?? 1,
                      error: null,
                    }),
                }),
              };
            }
            // I11 idempotency SELECT path.
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => {
                    base.calls.selectCount += 1;
                    return { data: null, error: null };
                  },
                }),
              }),
            };
          },
          insert: (payload: Row) => ({
            select: () => ({
              single: async () => {
                base.calls.inserted = payload;
                return { data: insertRow, error: null };
              },
            }),
          }),
          // Link UPDATE chain:
          //   .update({ library_item_id }, { count: 'exact' }).eq('id', x).eq('user_id', y)
          // Codex R2 C1-R2: `{ count: 'exact' }` was added so the route can
          // detect zero-row-match (entry tombstoned in the window between
          // INSERT and the link UPDATE). The second arg is forwarded but the
          // mock ignores it; injection is via `linkUpdateError` /
          // `linkUpdateAffectedCount` opts.
          update: (payload: Row, _options?: unknown) => {
            ext.linkUpdatePayload = payload;
            ext.linkUpdateCount += 1;
            return {
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    error: opts.linkUpdateError ?? null,
                    count: opts.linkUpdateError ? null : (opts.linkUpdateAffectedCount ?? 1),
                  }),
              }),
            };
          },
        };

        const libraryTable = {
          insert: (payload: Row) => {
            base.calls.libraryInserted = payload;
            base.calls.libraryInsertCount += 1;
            return {
              select: () => ({
                single: async () => {
                  if (opts.libraryInsertError) {
                    return { data: null, error: opts.libraryInsertError };
                  }
                  return {
                    data: { id: 'lib-1', display_name: payload.display_name },
                    error: null,
                  };
                },
              }),
            };
          },
          // 23505-recovery SELECT chain:
          //   .select('id, log_count')
          //     .eq('user_id', u).eq('normalized_name', n).is('deleted_at', null).maybeSingle()
          select: (_cols?: string, qopts?: { count?: string; head?: boolean }) => {
            if (qopts?.count === 'exact' && qopts.head) {
              return {
                eq: () => ({
                  gte: () => ({
                    lt: async () => ({ count: 0, error: null }),
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => {
                      ext.libraryRecoverSelectCount += 1;
                      return { data: opts.existingLibraryRow ?? null, error: null };
                    },
                  }),
                }),
              }),
            };
          },
          // Bump UPDATE chain:
          //   .update({ log_count, last_used_at })
          //     .eq('id', x).eq('user_id', u).is('deleted_at', null)
          update: (payload: Row) => {
            ext.libraryBumpPayload = payload;
            ext.libraryBumpCount += 1;
            return {
              eq: () => ({
                eq: () => ({
                  is: () => Promise.resolve({ error: null }),
                }),
              }),
            };
          },
        };

        const from = vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { id: 'u-1', timezone: 'Asia/Ho_Chi_Minh' }, error: null };
                  },
                  maybeSingle: async () => {
                    if (cols && cols.includes('deleting_at')) {
                      return { data: { deleting_at: null }, error: null };
                    }
                    return { data: { id: 'u-1', timezone: 'Asia/Ho_Chi_Minh' }, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'food_entries') return entriesTable;
          if (table === 'food_library_items') return libraryTable;
          throw new Error(`unknown table in test: ${table}`);
        });

        return { from, getUser: base.getUser, calls: base.calls, ext };
      }

      it('C1: save-to-library UPDATEs food_entries.library_item_id to the new library row id', async () => {
        const { from, getUser, ext } = buildExtMocks({ libraryCountAfterLink: 1 });
        vi.doMock('next/cache', () => ({
          revalidateTag: vi.fn(),
          revalidatePath: vi.fn(),
        }));
        vi.doMock('@/lib/supabase/server', () => ({
          getServerSupabase: async () => ({ auth: { getUser }, from }),
        }));

        const res = await postBody({
          ...validBody,
          save_to_library: true,
        });

        expect(res.status).toBe(200);
        // The brand-new food_entries row's library_item_id MUST now point at
        // the freshly-inserted library row. Without this link the COUNT(*)
        // re-log derivation undercounts forever (C1).
        expect(ext.linkUpdateCount).toBe(1);
        expect(ext.linkUpdatePayload).toEqual(
          expect.objectContaining({ library_item_id: 'lib-1' }),
        );
      });

      it('Bug 1 + C1: save-to-library writes log_count via COUNT(*) AFTER linking entry (= 1 on fresh save)', async () => {
        // The bump UPDATE on food_library_items must fire AFTER the link
        // step, using the COUNT-derived value. Fresh save → 1 entry linked
        // → log_count = 1.
        const { from, getUser, ext } = buildExtMocks({ libraryCountAfterLink: 1 });
        vi.doMock('next/cache', () => ({
          revalidateTag: vi.fn(),
          revalidatePath: vi.fn(),
        }));
        vi.doMock('@/lib/supabase/server', () => ({
          getServerSupabase: async () => ({ auth: { getUser }, from }),
        }));

        const res = await postBody({
          ...validBody,
          save_to_library: true,
        });

        expect(res.status).toBe(200);
        expect(ext.libraryBumpCount).toBe(1);
        expect(ext.libraryBumpPayload).toEqual(expect.objectContaining({ log_count: 1 }));
        // last_used_at stamped as ISO string by the bump.
        expect(typeof ext.libraryBumpPayload?.last_used_at).toBe('string');
        const lastUsedMs = Date.parse(ext.libraryBumpPayload?.last_used_at as string);
        expect(Number.isFinite(lastUsedMs)).toBe(true);
      });

      it('C1: simulated re-log path produces log_count = 2 (COUNT sees both entries; no off-by-one)', async () => {
        // After the first save links its entry, the second save (re-log via
        // save-to-library on same name → 23505 path, or the dedicated
        // log-now path) writes log_count=2. We assert the bump payload
        // reflects the COUNT-derived value: 2 entries linked → 2.
        const { from, getUser, ext } = buildExtMocks({ libraryCountAfterLink: 2 });
        vi.doMock('next/cache', () => ({
          revalidateTag: vi.fn(),
          revalidatePath: vi.fn(),
        }));
        vi.doMock('@/lib/supabase/server', () => ({
          getServerSupabase: async () => ({ auth: { getUser }, from }),
        }));

        const res = await postBody({
          ...validBody,
          save_to_library: true,
        });

        expect(res.status).toBe(200);
        expect(ext.libraryBumpPayload).toEqual(expect.objectContaining({ log_count: 2 }));
      });

      it('I1: 23505 race on library INSERT — SELECTs existing row, links entry to winner, bumps via COUNT', async () => {
        // Loser-side of concurrent-tab race: library INSERT fails with 23505
        // (winner created the row first). Route must:
        //   1. SELECT existing active row by (user_id, normalized_name).
        //   2. UPDATE just-inserted entry's library_item_id → existing row id.
        //   3. Bump log_count via COUNT(*) which now sees BOTH entries
        //      (this loser's entry + winner's entry already committed).
        const { from, getUser, calls, ext } = buildExtMocks({
          libraryInsertError: { code: '23505', message: 'duplicate key value' },
          existingLibraryRow: { id: 'lib-existing-from-winner', log_count: 1 },
          libraryCountAfterLink: 2,
        });
        const revalidatePath = vi.fn();
        const revalidateTag = vi.fn((tag: string) => {
          calls.revalidated.push(tag);
        });
        vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
        vi.doMock('@/lib/supabase/server', () => ({
          getServerSupabase: async () => ({ auth: { getUser }, from }),
        }));

        const res = await postBody({
          ...validBody,
          save_to_library: true,
        });

        // Route still returns 200 — entry write is authoritative.
        expect(res.status).toBe(200);
        // Library INSERT was attempted and failed with 23505.
        expect(calls.libraryInsertCount).toBe(1);
        // 23505-recovery SELECT fired to find the winner's row.
        expect(ext.libraryRecoverSelectCount).toBe(1);
        // Entry linked to the EXISTING winner's library row (not the lost id).
        expect(ext.linkUpdateCount).toBe(1);
        expect(ext.linkUpdatePayload).toEqual(
          expect.objectContaining({ library_item_id: 'lib-existing-from-winner' }),
        );
        // Bump UPDATE fired with COUNT-derived log_count = 2.
        expect(ext.libraryBumpCount).toBe(1);
        expect(ext.libraryBumpPayload).toEqual(expect.objectContaining({ log_count: 2 }));
        // Cache invalidation fires (tag + path) even on the recovery path —
        // user's badge must reflect the recovered state.
        expect(calls.revalidated).toContain('user:u-1:library');
        expect(revalidatePath).toHaveBeenCalledWith('/library', 'page');
      });

      // ---------------------------------------------------------------------
      // Codex R2 Critical (C1-R2) — link-confirmed gating of the bump path.
      //
      // The R1 fix added a `food_entries.library_item_id` link UPDATE between
      // the library INSERT and the COUNT-derived bump. Round-2 Codex flagged
      // a residual: if the link UPDATE errors OR matches 0 rows, the code
      // still falls through to the COUNT/bump path. `Math.max(1, trueCount
      // ?? 1)` floors COUNT=0 to 1, so the bump writes `log_count=1` and
      // invalidates /library cache while the food_entries row remains
      // orphaned. The R1 invariant `log_count == COUNT(entries linked)` is
      // permanently broken from first observation, and the sketch pipeline
      // also fires for a row that has zero linked entries.
      //
      // Fix: the link UPDATE now passes `{ count: 'exact' }` so the route
      // gets the affected-row count, and a `linkConfirmed` flag gates the
      // entire downstream chain (bump UPDATE + cache invalidation + sketch
      // enqueue). On link failure / 0-row-match, the route still returns
      // 200 (entry write is authoritative per design-doc §10.3) but skips
      // the enrichment writes; the library row's DB-default `log_count = 0`
      // remains consistent with the "no linked entries" reality and will
      // self-heal on the next re-log via the log-now route's COUNT-derive
      // pattern.
      //
      // Improvement I1-R2 (concurrent-saves race producing stale-last-write
      // log_count under 3+ overlapping requests) is DEFERRED to
      // pending_minor_findings — self-heals on the next re-log via the
      // log-now route's COUNT-from-statement pattern (architecture.md §3.5),
      // accepted under the 2-round-cap rule.
      // ---------------------------------------------------------------------
      describe('Codex R2 C1-R2 — link-confirmed gating of bump + cache + sketch', () => {
        it('C1-R2: link UPDATE error → no bump, no cache invalidation, no sketch, route still 200', async () => {
          const { from, getUser, calls, ext } = buildExtMocks({
            linkUpdateError: { code: '40001', message: 'serialization failure' },
            libraryCountAfterLink: 1,
          });
          const revalidatePath = vi.fn();
          const revalidateTag = vi.fn((tag: string) => {
            calls.revalidated.push(tag);
          });
          const captureException = vi.fn();
          const sketchEnqueue = vi.fn((args: Row) => {
            ext.sketchEnqueueCount += 1;
            ext.sketchEnqueueArgs = args;
          });
          vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
          vi.doMock('@sentry/nextjs', () => ({ captureException }));
          vi.doMock('@/lib/library/sketch-enqueue', () => ({
            enqueueSketchGeneration: sketchEnqueue,
          }));
          vi.doMock('@/lib/supabase/server', () => ({
            getServerSupabase: async () => ({ auth: { getUser }, from }),
          }));

          const res = await postBody({
            ...validBody,
            save_to_library: true,
          });

          // Entry write is authoritative — still 200.
          expect(res.status).toBe(200);
          // Library INSERT happened (fresh insert succeeded).
          expect(calls.libraryInsertCount).toBe(1);
          // Link UPDATE was attempted and errored.
          expect(ext.linkUpdateCount).toBe(1);
          // CRITICAL invariant: NO bump UPDATE when link failed.
          expect(ext.libraryBumpCount).toBe(0);
          // CRITICAL invariant: NO cache invalidation when link failed.
          expect(calls.revalidated).not.toContain('user:u-1:library');
          expect(revalidatePath).not.toHaveBeenCalledWith('/library', 'page');
          // CRITICAL invariant: NO sketch enqueue when link failed.
          expect(ext.sketchEnqueueCount).toBe(0);
          // Sentry was notified for observability.
          expect(captureException).toHaveBeenCalled();
        });

        it('C1-R2: link UPDATE matches 0 rows → no bump, no cache invalidation, no sketch, route still 200', async () => {
          const { from, getUser, calls, ext } = buildExtMocks({
            linkUpdateError: null,
            linkUpdateAffectedCount: 0,
            libraryCountAfterLink: 0,
          });
          const revalidatePath = vi.fn();
          const revalidateTag = vi.fn((tag: string) => {
            calls.revalidated.push(tag);
          });
          const captureException = vi.fn();
          const sketchEnqueue = vi.fn((args: Row) => {
            ext.sketchEnqueueCount += 1;
            ext.sketchEnqueueArgs = args;
          });
          vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
          vi.doMock('@sentry/nextjs', () => ({ captureException }));
          vi.doMock('@/lib/library/sketch-enqueue', () => ({
            enqueueSketchGeneration: sketchEnqueue,
          }));
          vi.doMock('@/lib/supabase/server', () => ({
            getServerSupabase: async () => ({ auth: { getUser }, from }),
          }));

          const res = await postBody({
            ...validBody,
            save_to_library: true,
          });

          expect(res.status).toBe(200);
          expect(calls.libraryInsertCount).toBe(1);
          expect(ext.linkUpdateCount).toBe(1);
          // CRITICAL — orphan-library-row guard:
          // - `libraryCountAfterLink: 0` simulates COUNT seeing the unlinked
          //   reality. If the route fell through to the bump path,
          //   `Math.max(1, 0)` would still write log_count=1 (the original
          //   R2 finding's exact failure mode). The gate must short-circuit
          //   BEFORE the COUNT/bump even runs.
          expect(ext.libraryBumpCount).toBe(0);
          expect(calls.revalidated).not.toContain('user:u-1:library');
          expect(revalidatePath).not.toHaveBeenCalledWith('/library', 'page');
          expect(ext.sketchEnqueueCount).toBe(0);
          // Sentry was notified — 0-row-match is silent in PostgREST so the
          // operator needs an explicit observability signal.
          expect(captureException).toHaveBeenCalled();
        });

        it('C1-R2 positive regression: link UPDATE confirmed (count=1) → bump + cache + sketch fire as before', async () => {
          const { from, getUser, calls, ext } = buildExtMocks({
            linkUpdateError: null,
            linkUpdateAffectedCount: 1,
            libraryCountAfterLink: 1,
          });
          const revalidatePath = vi.fn();
          const revalidateTag = vi.fn((tag: string) => {
            calls.revalidated.push(tag);
          });
          const sketchEnqueue = vi.fn((args: Row) => {
            ext.sketchEnqueueCount += 1;
            ext.sketchEnqueueArgs = args;
          });
          vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
          vi.doMock('@/lib/library/sketch-enqueue', () => ({
            enqueueSketchGeneration: sketchEnqueue,
          }));
          vi.doMock('@/lib/supabase/server', () => ({
            getServerSupabase: async () => ({ auth: { getUser }, from }),
          }));

          const res = await postBody({
            ...validBody,
            save_to_library: true,
          });

          // Happy path stays happy — gate must not break the success branch.
          expect(res.status).toBe(200);
          expect(ext.linkUpdateCount).toBe(1);
          expect(ext.libraryBumpCount).toBe(1);
          expect(ext.libraryBumpPayload).toEqual(expect.objectContaining({ log_count: 1 }));
          expect(calls.revalidated).toContain('user:u-1:library');
          expect(revalidatePath).toHaveBeenCalledWith('/library', 'page');
          // Sketch enqueue fires for fresh INSERT + confirmed link.
          expect(ext.sketchEnqueueCount).toBe(1);
          expect(ext.sketchEnqueueArgs).toEqual(
            expect.objectContaining({ libraryItemId: 'lib-1' }),
          );
        });
      });

      it('I1 — non-23505 library INSERT error preserves prior behaviour (no link, no bump, Sentry fires)', async () => {
        // A non-23505 error (RLS denial, schema drift, 5xx, etc.) is NOT the
        // concurrent-race path. Pre-existing behaviour must be preserved:
        //   - swallow + Sentry capture
        //   - no cache invalidation (no successful library row exists)
        //   - no link UPDATE on food_entries (would point at nothing)
        //   - no bump UPDATE on food_library_items
        const { from, getUser, calls, ext } = buildExtMocks({
          libraryInsertError: { code: '42501', message: 'permission denied' },
          existingLibraryRow: null,
          libraryCountAfterLink: 1,
        });
        const captureException = vi.fn();
        const revalidatePath = vi.fn();
        const revalidateTag = vi.fn((tag: string) => {
          calls.revalidated.push(tag);
        });
        vi.doMock('next/cache', () => ({ revalidateTag, revalidatePath }));
        vi.doMock('@sentry/nextjs', () => ({ captureException }));
        vi.doMock('@/lib/supabase/server', () => ({
          getServerSupabase: async () => ({ auth: { getUser }, from }),
        }));

        const res = await postBody({
          ...validBody,
          save_to_library: true,
        });

        // Entry write is authoritative — still 200.
        expect(res.status).toBe(200);
        expect(calls.libraryInsertCount).toBe(1);
        // No link, no bump, no library-cache invalidation.
        expect(ext.linkUpdateCount).toBe(0);
        expect(ext.libraryBumpCount).toBe(0);
        expect(calls.revalidated).not.toContain('user:u-1:library');
        expect(revalidatePath).not.toHaveBeenCalledWith('/library', 'page');
        // Sentry fired for observability.
        expect(captureException).toHaveBeenCalled();
      });
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
      //
      // Codex R1 follow-up (C1 + I1) note: 23505 is now the RECOVERY path
      // (the concurrent-tab race that SELECTs the existing winner row and
      // bumps log_count). This test exercises a NON-23505 error (RLS
      // denial, schema drift, 5xx) where the route must preserve the
      // original swallow + Sentry + no-cache-invalidate contract.
      const libError = {
        code: '42501',
        message: 'permission denied for table food_library_items',
      };
      const errorLibraryTable = {
        select: (_cols?: string, qopts?: { count?: string; head?: boolean }) => {
          if (qopts?.count === 'exact' && qopts.head) {
            return {
              eq: () => ({
                gte: () => ({
                  lt: async () => ({ count: 0, error: null }),
                }),
              }),
            };
          }
          return (from('food_library_items') as { select: (cols?: string) => unknown }).select(
            _cols,
          );
        },
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

  it('rejects logged_at beyond 30-second clock-skew tolerance of now', async () => {
    const { from, getUser, calls } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const futureBeyondTolerance = new Date(Date.now() + 31_000).toISOString();
    const res = await postBody({ ...validBody, logged_at: futureBeyondTolerance });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('logged_at_future');
    expect(calls.inserted).toBeNull();
  });

  it('persists an alcohol log with server-computed grams for alcoholic drinks', async () => {
    const { from, calls } = buildMocks({
      alcoholRow: null,
      insertRow: {
        id: 'entry-alcohol-1',
        user_id: 'u-1',
        client_id: validBody.client_id,
        logged_at: validBody.logged_at,
        meal_category: 'drink',
        source: 'manual',
        items: validBody.items,
        ai_reasoning: null,
      },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'drink',
      source: 'manual',
      alcohol: { volume_ml: 355, abv_percent: 5 },
    });

    expect(res.status).toBe(200);
    expect(calls.alcoholInsertCount).toBe(1);
    expect(calls.alcoholInserted).toEqual({
      user_id: 'u-1',
      entry_id: 'entry-alcohol-1',
      volume_ml: 355,
      abv_percent: 5,
      alcohol_grams: 14.005,
      consumed_at: validBody.logged_at,
    });
  });

  it('rejects alcohol metadata on non-drink entries before inserting', async () => {
    const { from, calls } = buildMocks();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'breakfast',
      alcohol: { volume_ml: 355, abv_percent: 5 },
    });
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe('alcohol_requires_drink_category');
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInsertCount).toBe(0);
  });

  it('compensates the food entry insert when alcohol ledger persistence fails', async () => {
    const { from, calls } = buildMocks({
      insertRow: {
        id: 'entry-alcohol-failed',
        user_id: 'u-1',
        client_id: validBody.client_id,
        logged_at: validBody.logged_at,
        meal_category: 'drink',
        source: 'manual',
        items: validBody.items,
        ai_reasoning: null,
      },
      alcoholInsertError: { code: '42501', message: 'RLS rejected alcohol log' },
      alcoholRow: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'drink',
      source: 'manual',
      alcohol: { volume_ml: 355, abv_percent: 5 },
    });
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('db_error');
    expect(calls.alcoholInsertCount).toBe(1);
    expect(calls.entryDeleteCount).toBe(1);
  });

  it('does not create an alcohol log when alcohol metadata is absent', async () => {
    const { from, calls } = buildMocks();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody(validBody);

    expect(res.status).toBe(200);
    expect(calls.alcoholInsertCount).toBe(0);
  });

  it('rejects out-of-bounds alcohol volume and ABV before inserting', async () => {
    const { from, calls } = buildMocks();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'drink',
      alcohol: { volume_ml: 0, abv_percent: 101 },
    });
    const json = (await res.json()) as { error: string; issues: Array<{ path: string[] }> };

    expect(res.status).toBe(400);
    expect(json.error).toBe('ValidationError');
    expect(json.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['alcohol.volume_ml', 'alcohol.abv_percent']),
    );
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInsertCount).toBe(0);
  });

  it('does not duplicate alcohol logs on replay', async () => {
    const { from, calls } = buildMocks({
      existingRow: {
        id: 'entry-existing',
        user_id: 'u-1',
        client_id: validBody.client_id,
        logged_at: validBody.logged_at,
        meal_category: 'drink',
        source: 'manual',
        items: validBody.items,
        ai_reasoning: null,
      },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'drink',
      source: 'manual',
      alcohol: { volume_ml: 355, abv_percent: 5 },
    });
    const json = (await res.json()) as { replayed?: boolean };

    expect(res.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInsertCount).toBe(0);
  });

  it('repairs a missing alcohol log on idempotent replay after a prior partial failure', async () => {
    // Codex Round 2 C1-r2 — replay repair recomputes from the PERSISTED
    // entry's items[], NOT the retry body. This test models a partial-
    // failure scenario where:
    //   1. The prior save committed the entry (existingRow seeded with
    //      alcoholic items: is_alcoholic=true, volume_ml=355, abv_percent=5)
    //   2. The prior save's alcohol_logs insert failed (alcoholRow=null
    //      so the read returns no row)
    //   3. A retry under the same client_id arrives. The replay branch
    //      sees existing.items has alcohol metadata and inserts the
    //      missing alcohol_logs row from those STORED items.
    //
    // Pre-C1-r2 contract used `body.alcohol` (legacy slot) on the retry
    // body to drive repair. That contract was unsafe for content-drifted
    // retries (a retry with a different drink could fabricate a log that
    // disagrees with the original entry's items). The C1-r2 fix narrows
    // the repair to stored items only.
    const alcoholicItems = [
      {
        name: 'beer',
        portion: 1,
        unit: 'can',
        kcal: 153,
        is_alcoholic: true,
        volume_ml: 355,
        abv_percent: 5,
      },
    ];
    const { from, calls } = buildMocks({
      alcoholRow: null,
      existingRow: {
        id: 'entry-existing',
        user_id: 'u-1',
        client_id: validBody.client_id,
        logged_at: validBody.logged_at,
        meal_category: 'drink',
        source: 'text',
        items: alcoholicItems,
        ai_reasoning: null,
      },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from,
      }),
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

    const res = await postBody({
      ...validBody,
      meal_category: 'drink',
      source: 'text',
      items: alcoholicItems,
    });
    const json = (await res.json()) as { replayed?: boolean };

    expect(res.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInsertCount).toBe(1);
    expect(calls.alcoholInserted).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-existing',
      consumed_at: validBody.logged_at,
    });
  });

  it('allows logged_at within 30-second clock-skew tolerance of now', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const nearFuture = new Date(Date.now() + 29_000).toISOString();
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
