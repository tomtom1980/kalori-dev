/**
 * @vitest-environment node
 *
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — POST /api/entries/save
 * with AI-derived per-item alcohol metadata.
 *
 * Replaces the manual top-level `body.alcohol` toggle pathway: the
 * confirmation UI no longer exposes a toggle. Instead, Gemini sets
 * `is_alcoholic` + `volume_ml` + `abv_percent` per item in the
 * AI-parsed food entry. The save route now scans `body.items[]` for
 * alcoholic items and inserts an alcohol_logs row for each one when
 * the entry's meal_category is 'drink'.
 *
 * Non-drink meal_category with AI-flagged alcohol → silently SKIP the
 * alcohol_log insert (the entry itself still persists). This is
 * intentional: the AI may false-positive (kombucha, mocktail) and the
 * user picked a non-drink category, so we honor the user's choice
 * rather than 400-rejecting the entire entry. (Contrast: legacy
 * top-level body.alcohol still 400s on non-drink because that path
 * was an explicit user opt-in via a toggle.)
 *
 * Bounds: same as the lib/ai/schemas.ts ParsedItem contract — volume_ml
 * in (0, 5000], abv_percent in (0, 100]. Three-layer defense (prompt
 * directive, AI Zod schema, route Zod schema) against AI drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

type BuildOptions = {
  existingRow?: Row | null;
  insertRow?: Row;
  insertError?: { code?: string; message?: string } | null;
  alcoholInsertError?: { code?: string; message?: string } | null;
  alcoholRow?: Row | null;
  profileRow?: Row | null;
};

type Calls = {
  inserted: Row | null;
  alcoholInserts: Row[];
  entryDeleteCount: number;
};

function buildMocks(opts: BuildOptions = {}) {
  const calls: Calls = {
    inserted: null,
    alcoholInserts: [],
    entryDeleteCount: 0,
  };
  const profileRow = opts.profileRow ?? { id: 'u-1', timezone: 'Asia/Ho_Chi_Minh' };
  const existingRow = opts.existingRow ?? null;
  const insertRow = opts.insertRow ?? {
    id: 'entry-test-1',
    user_id: 'u-1',
    client_id: '11111111-1111-4111-8111-111111111111',
    logged_at: '2026-04-21T10:00:00.000Z',
    meal_category: 'drink',
    source: 'text',
    items: [{ name: 'beer', portion: 1, unit: 'can', kcal: 153 }],
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
          return { data: insertRow, error: null };
        },
      }),
    }),
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

  // alcohol_logs table: select-for-replay returns alcoholRow (or null);
  // insert records the payload for assertion.
  let alcoholReadRemaining = opts.alcoholRow === undefined ? null : opts.alcoholRow;
  const alcoholTable = {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          const data = alcoholReadRemaining;
          // After first read returns the row, subsequent reads return null
          // (the row is consumed). For per-item alcohol where multiple
          // items might be alcoholic, each read returns null so each
          // insert proceeds.
          alcoholReadRemaining = null;
          return { data, error: null };
        },
      }),
    }),
    insert: (payload: Row) => {
      calls.alcoholInserts.push(payload);
      return Promise.resolve({
        data: opts.alcoholInsertError
          ? null
          : { id: `alc-${calls.alcoholInserts.length}`, ...payload },
        error: opts.alcoholInsertError ?? null,
      });
    },
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileTable;
    if (table === 'food_entries') return entriesTable;
    if (table === 'alcohol_logs') return alcoholTable;
    if (table === 'food_library_items') {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: null, error: null }) }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({ is: () => Promise.resolve({ error: null }) }),
          }),
        }),
      };
    }
    throw new Error(`unknown table in test: ${table}`);
  });

  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));

  return { from, getUser, calls };
}

describe('POST /api/entries/save — AI-derived per-item alcohol', () => {
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

  const baseItem = {
    name: 'beer',
    portion: 1,
    unit: 'can',
    kcal: 153,
    macros: { protein_g: 1.6, carbs_g: 12.6, fat_g: 0, fiber_g: 0 },
    micros: {},
    confidence: 0.85,
  };

  const validAlcoholicBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    logged_at: '2026-04-21T10:00:00.000Z',
    meal_category: 'drink' as const,
    source: 'text' as const,
    items: [{ ...baseItem, is_alcoholic: true, volume_ml: 355, abv_percent: 5 }],
  };

  it('Test A — inserts an alcohol_logs row when item is_alcoholic=true and meal=drink', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validAlcoholicBody);
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    expect(calls.alcoholInserts[0]).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-test-1',
      volume_ml: 355,
      abv_percent: 5,
      // 355 * 0.05 * 0.789 = 14.00475 → toFixed(3) = 14.005
      alcohol_grams: 14.005,
      consumed_at: validAlcoholicBody.logged_at,
    });
  });

  it('Test B — does NOT insert alcohol_logs when meal_category != drink even if item is_alcoholic=true', async () => {
    const { from, getUser, calls } = buildMocks({
      alcoholRow: null,
      insertRow: {
        id: 'entry-test-2',
        user_id: 'u-1',
        client_id: '11111111-1111-4111-8111-111111111111',
        logged_at: '2026-04-21T10:00:00.000Z',
        meal_category: 'snack',
        source: 'text',
        items: [{ name: 'kombucha', portion: 1, unit: 'bottle', kcal: 30 }],
        ai_reasoning: null,
      },
    });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // AI-flagged as alcoholic, but user picked snack → silently skip
    // alcohol_log insert; entry itself still persists.
    const res = await postBody({
      ...validAlcoholicBody,
      meal_category: 'snack',
      items: [
        { ...baseItem, name: 'kombucha', is_alcoholic: true, volume_ml: 355, abv_percent: 5 },
      ],
    });
    expect(res.status).toBe(200);
    expect(calls.inserted).not.toBeNull();
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test C — does NOT insert alcohol_logs when item is_alcoholic=false even if meal=drink', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      items: [{ ...baseItem, name: 'water', is_alcoholic: false }],
    });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test D — rejects with 400 when item abv_percent is out of bounds (>100)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      items: [{ ...baseItem, is_alcoholic: true, volume_ml: 350, abv_percent: 150 }],
    });
    expect(res.status).toBe(400);
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test D2 — rejects with 400 when item volume_ml is out of bounds (>5000)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      items: [{ ...baseItem, is_alcoholic: true, volume_ml: 9999, abv_percent: 5 }],
    });
    expect(res.status).toBe(400);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test E — replays the same client_id without inserting a duplicate alcohol_logs row', async () => {
    const existing = {
      id: 'entry-existing-replay',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'drink',
      source: 'text',
      items: validAlcoholicBody.items,
    };
    // alcoholRow truthy → existing alcohol log present → no duplicate insert
    const { from, getUser, calls } = buildMocks({
      existingRow: existing,
      alcoholRow: { id: 'alc-existing' },
    });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validAlcoholicBody);
    const json = (await res.json()) as { replayed?: boolean };
    expect(res.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test F — multi-item parse: only alcoholic items contribute an alcohol_logs row', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Burger + IPA: one alcohol_logs row expected (for the IPA only).
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        { ...baseItem, name: 'burger', is_alcoholic: false },
        { ...baseItem, name: 'IPA', is_alcoholic: true, volume_ml: 473, abv_percent: 6.5 },
      ],
    });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    expect(calls.alcoholInserts[0]).toMatchObject({
      volume_ml: 473,
      abv_percent: 6.5,
    });
  });

  // Codex Round 1 C1 + I1 (bugfix-tomi 2026-05-19-bac-improvements):
  //
  // C1 — alcohol_logs has a UNIQUE constraint on entry_id (migration 0026
  // line 48–49). The legacy per-item loop inserted one row per alcoholic
  // item under the same entry_id, which would 23505 the 2nd insert for any
  // multi-drink entry ("two beers and a glass of wine"). Fix: aggregate
  // across all alcoholic items in the entry into a SINGLE alcohol_logs row.
  //
  // I1 — `item.portion` was ignored when computing grams + volume. The AI
  // prompt contract states `volume_ml` is PER SERVING (e.g. 355 for one
  // 12oz beer can), so `portion: 2` ("two beers") must multiply: 2 × 355 =
  // 710 ml of beer consumed; 2 × 355 × 0.05 × 0.789 = 28.0095 g ethanol.
  //
  // The aggregate row's `abv_percent` is a volume-weighted average so the
  // DB triple (volume_ml, abv_percent, alcohol_grams) remains internally
  // consistent: alcohol_grams ≈ volume_ml × abv_percent/100 × 0.789. The
  // BAC engine reads `alcohol_grams` directly, so as long as that field is
  // the true aggregate of ethanol consumed, downstream math is correct.

  it('Test M — multi-drink entry aggregates into ONE alcohol_logs row (C1 fix)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Beer (355 ml × 5%) + wine (150 ml × 12%).
    // Expected aggregate:
    //   total_volume = 355 + 150 = 505 ml
    //   beer_grams = 355 × 0.05 × 0.789 = 14.00475 → toFixed(3) = 14.005
    //   wine_grams = 150 × 0.12 × 0.789 = 14.202   → toFixed(3) = 14.202
    //   total_grams = 14.005 + 14.202 = 28.207 (then toFixed(3) at boundary)
    //   weighted_abv = (28.207 / (505 × 0.789)) × 100 ≈ 7.077…%
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        {
          ...baseItem,
          name: 'beer',
          is_alcoholic: true,
          volume_ml: 355,
          abv_percent: 5,
          portion: 1,
          unit: 'can',
        },
        {
          ...baseItem,
          name: 'wine',
          is_alcoholic: true,
          volume_ml: 150,
          abv_percent: 12,
          portion: 1,
          unit: 'glass',
        },
      ],
    });
    expect(res.status).toBe(200);
    // Exactly one row, regardless of how many alcoholic items the entry holds.
    expect(calls.alcoholInserts).toHaveLength(1);
    const row = calls.alcoholInserts[0]!;
    expect(row).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-test-1',
      volume_ml: 505,
      consumed_at: validAlcoholicBody.logged_at,
    });
    // Aggregate alcohol grams ≈ 28.207 (allow tiny FP slack for rounding strategy).
    expect(Math.abs((row.alcohol_grams as number) - 28.207)).toBeLessThan(0.01);
    // Volume-weighted ABV ≈ 7.077%.
    expect(Math.abs((row.abv_percent as number) - 7.077)).toBeLessThan(0.05);
  });

  it('Test P — portion=2 multiplies volume + grams (I1 fix)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // "Two beers" — portion=2, volume_ml=355 (per-serving).
    // Expected:
    //   total_volume = 2 × 355 = 710 ml
    //   total_grams  = 2 × 355 × 0.05 × 0.789 = 28.0095 → toFixed(3) = 28.010
    //   abv_percent  = 5 (single beverage type)
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        {
          ...baseItem,
          name: 'beer',
          is_alcoholic: true,
          volume_ml: 355,
          abv_percent: 5,
          portion: 2,
          unit: 'can',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    const row = calls.alcoholInserts[0]!;
    expect(row).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-test-1',
      volume_ml: 710,
      consumed_at: validAlcoholicBody.logged_at,
    });
    expect(Math.abs((row.alcohol_grams as number) - 28.01)).toBeLessThan(0.01);
    // Single beverage type → weighted-avg ABV equals the input ABV.
    expect(Math.abs((row.abv_percent as number) - 5)).toBeLessThan(0.01);
  });

  // Codex Round 2 C1-r2 (bugfix-tomi 2026-05-19-bac-improvements) — REPLAY
  // path corruption fix.
  //
  // The R1 fix made `ensureAlcoholLogForEntry` skip-on-existing on the
  // replay branch (idempotent if the prior save's alcohol log committed)
  // but still computed contributions from `body.items` (the REQUEST body),
  // not from the entry's PERSISTED items. Two failure modes that R1 did not
  // catch:
  //
  //   R-A (replay-noop): a retry under the same client_id with DIFFERENT
  //     items must NOT mutate the canonical alcohol log. If a prior save
  //     committed alcohol_logs, a retry with a different drink (e.g. user
  //     edits "wine" → "beer" but keeps the same client_id) must return
  //     200/replayed without inserting a new row. The existing-row
  //     short-circuit covers this case — Test R-A locks that contract.
  //
  //   R-B (replay-repair): if the prior request failed mid-way (entry row
  //     committed, alcohol_logs row never landed), a retry under the same
  //     client_id must REPAIR by inserting the alcohol_logs row computed
  //     from the ORIGINAL entry's stored items (NOT the retry's items —
  //     the retry's items may have drifted, and the entry's stored items
  //     are canonical). The R2 fix re-aggregates from `existing.items`
  //     rather than `body.items` on the replay path so a content-drifted
  //     retry cannot smuggle a fabricated alcohol log onto an entry whose
  //     original items had different drink metadata.

  it('Test R-A — replay-noop: retry with different alcoholic items does NOT mutate canonical log (C1-r2 fix)', async () => {
    // Existing entry: ORIGINAL items had wine (150 ml × 12%). Prior save
    // committed an alcohol_logs row (alcoholRow truthy).
    const existing = {
      id: 'entry-replay-noop',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'drink',
      source: 'text',
      items: [
        {
          name: 'wine',
          portion: 1,
          unit: 'glass',
          kcal: 120,
          is_alcoholic: true,
          volume_ml: 150,
          abv_percent: 12,
        },
      ],
    };
    const { from, getUser, calls } = buildMocks({
      existingRow: existing,
      alcoholRow: { id: 'alc-original-wine' },
    });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Retry with DIFFERENT items — beer instead of wine, same client_id.
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        {
          ...baseItem,
          name: 'beer',
          is_alcoholic: true,
          volume_ml: 355,
          abv_percent: 5,
          portion: 1,
        },
      ],
    });
    const json = (await res.json()) as { replayed?: boolean };
    expect(res.status).toBe(200);
    expect(json.replayed).toBe(true);
    // No new alcohol_logs insert — original wine log stands.
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test R-B — replay-repair: missing alcohol_logs recomputed from STORED items, not retry body (C1-r2 fix)', async () => {
    // Existing entry: ORIGINAL items had wine. Prior save partially failed
    // — entry committed but alcohol_logs never landed (alcoholRow: null
    // makes the read return null on replay).
    const existing = {
      id: 'entry-replay-repair',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'drink',
      source: 'text',
      items: [
        {
          name: 'wine',
          portion: 1,
          unit: 'glass',
          kcal: 120,
          is_alcoholic: true,
          volume_ml: 150,
          abv_percent: 12,
        },
      ],
    };
    const { from, getUser, calls } = buildMocks({
      existingRow: existing,
      alcoholRow: null,
    });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // Retry with DIFFERENT items — beer instead of wine, same client_id.
    // The repair MUST use the STORED items (wine) not the retry's items
    // (beer), so the inserted row reflects the original wine metadata.
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        {
          ...baseItem,
          name: 'beer',
          is_alcoholic: true,
          volume_ml: 355,
          abv_percent: 5,
          portion: 1,
        },
      ],
    });
    const json = (await res.json()) as { replayed?: boolean };
    expect(res.status).toBe(200);
    expect(json.replayed).toBe(true);
    // Repair inserted ONE row, computed from the STORED wine — NOT the beer.
    expect(calls.alcoholInserts).toHaveLength(1);
    expect(calls.alcoholInserts[0]).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-replay-repair',
      volume_ml: 150,
      // wine: 150 * 0.12 * 0.789 = 14.202
      alcohol_grams: 14.202,
      consumed_at: existing.logged_at,
    });
  });

  // Security Review (bugfix-tomi 2026-05-19-bac-improvements) — H1 (HIGH):
  // Unbounded `portion` on ParsedItemSchema would let a crafted item
  // {volume_ml: 5000, abv_percent: 100, portion: 99999, is_alcoholic: true}
  // compute alcohol_grams ≈ 5000 × 100/100 × 99999 × 0.789 ≈ 394M, which
  // overflows numeric(8,3) alcohol_grams (max 99999.999) → 22003 numeric
  // overflow → 500 → entry DELETE. Fix: cap portion at 100 in Zod.
  it('Security H1 — rejects portion > 100 with 400 (NOT 500 DB overflow)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        { ...baseItem, is_alcoholic: true, volume_ml: 5000, abv_percent: 100, portion: 99999 },
      ],
    });
    expect(res.status).toBe(400);
    // Entry never reached the DB → no insert, no alcohol_logs row.
    expect(calls.inserted).toBeNull();
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  // Security Review M1 (MEDIUM) — legacy top-level body.alcohol slot must
  // reject Infinity / NaN. Per-item schema enforces .finite() but the
  // legacy slot only had .positive().max(...) which accepts Infinity.
  it('Security M1 — rejects body.alcohol with Infinity volume_ml (400)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      // Legacy slot — must NOT accept Infinity even though .positive() does.
      alcohol: { volume_ml: Number.POSITIVE_INFINITY, abv_percent: 5 },
    });
    expect(res.status).toBe(400);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Security M1 — rejects body.alcohol with NaN abv_percent (400)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...validAlcoholicBody,
      alcohol: { volume_ml: 355, abv_percent: Number.NaN },
    });
    expect(res.status).toBe(400);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test M+P — multi-drink with portion>1 aggregates correctly (C1 + I1 combined)', async () => {
    const { from, getUser, calls } = buildMocks({ alcoholRow: null });
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(),
      revalidatePath: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    // "Two beers and a glass of wine."
    //   beer:  portion=2, volume_ml=355  → 710 ml,  710 × 0.05 × 0.789 = 28.0095 g
    //   wine:  portion=1, volume_ml=150  → 150 ml,  150 × 0.12 × 0.789 = 14.202  g
    //   total_volume = 710 + 150 = 860 ml
    //   total_grams  ≈ 42.2115 g
    //   weighted_abv = (42.2115 / (860 × 0.789)) × 100 ≈ 6.221%
    const res = await postBody({
      ...validAlcoholicBody,
      items: [
        {
          ...baseItem,
          name: 'beer',
          is_alcoholic: true,
          volume_ml: 355,
          abv_percent: 5,
          portion: 2,
          unit: 'can',
        },
        {
          ...baseItem,
          name: 'wine',
          is_alcoholic: true,
          volume_ml: 150,
          abv_percent: 12,
          portion: 1,
          unit: 'glass',
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    const row = calls.alcoholInserts[0]!;
    expect(row).toMatchObject({
      user_id: 'u-1',
      entry_id: 'entry-test-1',
      volume_ml: 860,
      consumed_at: validAlcoholicBody.logged_at,
    });
    expect(Math.abs((row.alcohol_grams as number) - 42.212)).toBeLessThan(0.01);
    expect(Math.abs((row.abv_percent as number) - 6.221)).toBeLessThan(0.05);
  });
});
