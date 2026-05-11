/**
 * @vitest-environment node
 *
 * Task 3.4 — `POST /api/entries/copy-yesterday` unit tests.
 *
 * Contract (synthesis §5.4):
 *   - Body: `{ ids: UUID[] (1..20), new_client_ids: UUID[] (same len),
 *     target_date?: 'YYYY-MM-DD' }`.
 *   - Auth required.
 *   - Reads source entries via user-scoped SELECT (RLS).
 *   - Inserts N new rows with new client_ids, logged_at = now() in user TZ,
 *     preserved meal_category + items + ai_reasoning.
 *   - Fires `revalidateTag(TAGS.userEntries(uid, target_day))` once.
 *   - Retry same payload → 23505 on new client_ids → re-SELECT + replayed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGS } from '@/lib/cache/tags';

type Row = Record<string, unknown>;

function buildMocks(opts: { sourceRows?: Row[]; insertError?: { code: string } | null } = {}) {
  const calls = { revalidated: [] as string[], inserted: null as Row[] | null };
  const sourceRows = opts.sourceRows ?? [
    {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 'u-1',
      client_id: 'old-cid-1',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
      ai_reasoning: null,
      library_item_id: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: 'u-1',
      client_id: 'old-cid-2',
      meal_category: 'lunch',
      source: 'text',
      items: [{ name: 'pho', portion: 1, unit: 'bowl', kcal: 450 }],
      ai_reasoning: null,
      library_item_id: null,
    },
  ];

  const profileTable = {
    // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at and
    // fails closed (HTTP 503) on read error. Both `single` and `maybeSingle`
    // serve `{ deleting_at: null }` for the fence read; the route's own
    // profile.timezone read still gets the timezone payload.
    select: (cols?: string) => ({
      eq: () => ({
        single: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
        },
        maybeSingle: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
        },
      }),
    }),
  };

  const entriesTable = {
    select: () => ({
      eq: () => ({
        in: () => ({
          // source select
          order: () => Promise.resolve({ data: sourceRows, error: null }),
        }),
      }),
    }),
    insert: (payload: Row[]) => ({
      select: () => {
        calls.inserted = payload;
        if (opts.insertError) {
          return Promise.resolve({ data: null, error: opts.insertError });
        }
        // Echo payload back, stamp server-side ids.
        const rows = payload.map((r, i) => ({ ...r, id: `new-${i}` }));
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileTable;
    if (table === 'food_entries') return entriesTable;
    throw new Error(`unknown table: ${table}`);
  });
  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));
  return { from, getUser, calls };
}

describe('POST /api/entries/copy-yesterday', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  async function post(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/entries/copy-yesterday/route');
    return POST(
      new Request('http://kalori.test/api/entries/copy-yesterday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  const validBody = {
    ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    new_client_ids: [
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ],
  };

  it('200 + inserts N rows with preserved meal_category + fresh client_ids + fires revalidateTag', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { created: Row[] };
    expect(json.created).toHaveLength(2);
    expect(calls.inserted).not.toBeNull();
    const inserted = calls.inserted ?? [];
    expect(inserted).toHaveLength(2);
    // Fresh client_ids came from new_client_ids.
    expect(inserted[0]?.client_id).toBe(validBody.new_client_ids[0]);
    expect(inserted[1]?.client_id).toBe(validBody.new_client_ids[1]);
    // meal_category preserved per-source.
    expect(inserted[0]?.meal_category).toBe('breakfast');
    expect(inserted[1]?.meal_category).toBe('lunch');
    // revalidateTag fires once for user-TZ today. Shape assertion only —
    // date rolls with the real clock.
    const tagged = calls.revalidated.find((t) => t.startsWith('user:u-1:entries:'));
    expect(tagged).toMatch(/^user:u-1:entries:\d{4}-\d{2}-\d{2}$/);
  });

  it('400 on ids.length != new_client_ids.length', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({
      ids: ['11111111-1111-4111-8111-111111111111'],
      new_client_ids: [],
    });
    expect(res.status).toBe(400);
  });

  it('400 on empty ids', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post({ ids: [], new_client_ids: [] });
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    const { from } = buildMocks();
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'no session' },
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    const res = await post(validBody);
    expect(res.status).toBe(401);
  });

  // F-UI-3.6-B-5 — `target_date` removed from the API contract. No caller
  // passes it (`CopyYesterdayModal` is the only caller; see its handleConfirm).
  // Clients that sent `target_date` would otherwise see rows inserted with
  // `now()` while the cache for a DIFFERENT day was invalidated — data +
  // cache would diverge. Zod .strict() now rejects the key entirely.
  it('rejects body with target_date (removed — Zod .strict() 400)', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));
    // Use a VALID ids/new_client_ids pair (two each, matching buildMocks'
    // default 2 source rows) so the only thing that should trip validation
    // is the `target_date` key being unrecognized under .strict().
    const res = await post({
      ...validBody,
      target_date: '2026-04-21',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('ValidationError');
  });

  it('computes target_day from profile timezone when target_date absent — revalidateTag fires for user-TZ today', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post({
      ids: validBody.ids,
      new_client_ids: validBody.new_client_ids,
    });
    expect(res.status).toBe(200);
    // The server-computed day should be derived from the profile TZ and
    // wrap `user:u-1:entries:<some-YYYY-MM-DD>`; we assert the prefix + shape.
    const tagged = calls.revalidated.find((t) => t.startsWith('user:u-1:entries:'));
    expect(tagged).toBeDefined();
    expect(tagged).toMatch(/^user:u-1:entries:\d{4}-\d{2}-\d{2}$/);
  });

  // Task 4.5 R2 S3 — copy-yesterday must invalidate ALL 6 canonical progress
  // range tags via the shared `revalidateAllProgressRanges` helper. Pre-fix
  // the route emitted only 3 (24h/7d/30d), leaving D/90d/1y stale.
  it('Task 4.5 R2 S3 — fresh insert invalidates all 6 progress range tags', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '24h'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', 'D'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '7d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '30d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '90d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '1y'));
  });

  it('Task 4.5 R2 S3 — 23505 race-replay invalidates all 6 progress range tags', async () => {
    // Simulate the 23505 race by stubbing insertError + the replay SELECT.
    const replayedRows = [
      { id: 'new-0', user_id: 'u-1', client_id: validBody.new_client_ids[0] },
      { id: 'new-1', user_id: 'u-1', client_id: validBody.new_client_ids[1] },
    ];
    const calls = { revalidated: [] as string[], inserted: null as Row[] | null };

    const profileTable = {
      // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at; serve
      // both `single` and `maybeSingle`; column-discriminate so the fence
      // gets `{ deleting_at: null }` and the route's TZ read gets the timezone.
      select: (cols?: string) => ({
        eq: () => ({
          single: async () => {
            if (cols && cols.includes('deleting_at')) {
              return { data: { deleting_at: null }, error: null };
            }
            return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
          },
          maybeSingle: async () => {
            if (cols && cols.includes('deleting_at')) {
              return { data: { deleting_at: null }, error: null };
            }
            return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
          },
        }),
      }),
    };
    const entriesTable = {
      select: () => ({
        eq: () => ({
          in: (col: string) => {
            if (col === 'id') {
              return {
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: validBody.ids[0],
                        meal_category: 'breakfast',
                        source: 'text',
                        items: [],
                        ai_reasoning: null,
                        library_item_id: null,
                      },
                      {
                        id: validBody.ids[1],
                        meal_category: 'lunch',
                        source: 'text',
                        items: [],
                        ai_reasoning: null,
                        library_item_id: null,
                      },
                    ],
                    error: null,
                  }),
              };
            }
            // replay SELECT on client_id
            return Promise.resolve({ data: replayedRows, error: null });
          },
        }),
      }),
      insert: () => ({
        select: () => {
          calls.inserted = [];
          return Promise.resolve({ data: null, error: { code: '23505' } });
        },
      }),
    };
    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profileTable;
      if (table === 'food_entries') return entriesTable;
      throw new Error(`unknown table: ${table}`);
    });
    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));

    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post(validBody);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { replayed?: boolean };
    expect(json.replayed).toBe(true);
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '24h'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', 'D'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '7d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '30d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '90d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '1y'));
  });

  // I5 — When some ids resolve to rows the user can't see (RLS-hidden) or
  // simply don't exist, the route must return `missingIds` so the client can
  // surface which ids failed. The previous impl conflated both cases under
  // an opaque "one or more ids not accessible" message.
  it('400 with missing_entries error + missingIds[] when ids do not resolve', async () => {
    // Source SELECT returns only the first id — the second is RLS-hidden or
    // nonexistent.
    const sourceRows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: 'u-1',
        client_id: 'old-cid-1',
        meal_category: 'breakfast',
        source: 'text',
        items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        ai_reasoning: null,
        library_item_id: null,
      },
    ];
    const { from, getUser } = buildMocks({ sourceRows });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post(validBody);
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error: string;
      missingIds?: string[];
    };
    expect(json.error).toBe('missing_entries');
    expect(json.missingIds).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});
