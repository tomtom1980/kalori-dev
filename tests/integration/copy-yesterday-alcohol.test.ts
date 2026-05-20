/**
 * @vitest-environment node
 *
 * Codex Round 2 C2-r2 (bugfix-tomi 2026-05-19-bac-improvements) —
 * copy-yesterday must write `alcohol_logs` rows for any copied entries
 * whose items carry alcohol metadata. Before this fix, the route re-
 * inserted the source entry's items[] (preserving `is_alcoholic` /
 * `volume_ml` / `abv_percent`) but NEVER touched `alcohol_logs`. The
 * copied beer/wine would appear on the food entry history but contribute
 * 0 to the BAC engine (which reads from `alcohol_logs` only).
 *
 * Contract (from plan.md "open question" resolution):
 *   - Copied entries get a brand-new `alcohol_logs.consumed_at` equal to
 *     the NEW (copied) entry's `consumed_at`, NOT yesterday's drink time.
 *     Rationale: BAC must not "resurrect" yesterday's exact drinking
 *     timeline; copying to today represents a fresh drinking event.
 *   - Aggregator math is identical to the save route's path (UNIQUE
 *     entry_id collapse, portion multiplier, weighted-avg ABV). Shared
 *     helper at `lib/alcohol/aggregate-entry-logs.ts`.
 *   - Non-alcoholic copied entries write NO alcohol_logs row.
 *   - Idempotency: copy-yesterday called twice for the same source set
 *     does NOT duplicate alcohol_logs rows — each copy run produces NEW
 *     food_entries with NEW alcohol_logs (each having its own UNIQUE
 *     entry_id), and a replay (23505 on the new client_ids) skips the
 *     alcohol writes because the prior copy already linked them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('POST /api/entries/copy-yesterday — alcohol_logs propagation (C2-r2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  const userId = 'u-1';

  function buildMocks(opts: {
    sourceRows: Row[];
    insertedRows?: Row[]; // override what insert returns (e.g. for replay)
    insertError?: { code: string } | null;
    alcoholExistingByEntryId?: Map<string, Row | null>; // existing alcohol_logs per entry_id
  }) {
    const insertedRows = opts.insertedRows;
    const calls = {
      alcoholInserts: [] as Row[],
      alcoholReads: [] as string[],
      foodEntriesInserts: 0,
    };
    const alcoholExisting = opts.alcoholExistingByEntryId ?? new Map<string, Row | null>();

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols?: string) => ({
            eq: () => ({
              single: async () =>
                cols && cols.includes('deleting_at')
                  ? { data: { deleting_at: null }, error: null }
                  : { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null },
              maybeSingle: async () =>
                cols && cols.includes('deleting_at')
                  ? { data: { deleting_at: null }, error: null }
                  : { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null },
            }),
          }),
        };
      }
      if (table === 'food_entries') {
        return {
          select: () => ({
            // Route: .eq('user_id', …).in('id', ids).order(...)
            eq: () => ({
              in: () => ({
                order: async () => ({ data: opts.sourceRows, error: null }),
              }),
            }),
          }),
          insert: (payload: Row | Row[]) => ({
            select: async () => {
              calls.foodEntriesInserts += 1;
              const rows = Array.isArray(payload) ? payload : [payload];
              if (opts.insertError) {
                return { data: null, error: opts.insertError };
              }
              if (insertedRows) {
                return { data: insertedRows, error: null };
              }
              // Default: echo with synthesized server-side id, preserving
              // each row's client_id + items + logged_at.
              const rowsWithIds = rows.map((r, i) => ({
                ...r,
                id: `new-entry-${i + 1}`,
              }));
              return { data: rowsWithIds, error: null };
            },
          }),
        };
      }
      if (table === 'alcohol_logs') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => {
                calls.alcoholReads.push(val);
                const existing = alcoholExisting.get(val);
                return { data: existing ?? null, error: null };
              },
            }),
          }),
          insert: (payload: Row) => {
            calls.alcoholInserts.push(payload);
            return Promise.resolve({
              data: { id: `alc-${calls.alcoholInserts.length}`, ...payload },
              error: null,
            });
          },
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    return {
      from,
      calls,
      getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    };
  }

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

  it('Test C-A — copies an alcoholic source row and inserts an alcohol_logs row with NEW consumed_at', async () => {
    const sourceId = '11111111-1111-4111-8111-111111111111';
    const newClientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sourceRows: Row[] = [
      {
        id: sourceId,
        meal_category: 'drink',
        source: 'text',
        items: [
          {
            name: 'beer',
            portion: 1,
            unit: 'can',
            kcal: 153,
            is_alcoholic: true,
            volume_ml: 355,
            abv_percent: 5,
          },
        ],
        ai_reasoning: null,
        library_item_id: null,
      },
    ];
    const { from, getUser, calls } = buildMocks({ sourceRows });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const tBefore = Date.now();
    const res = await post({ ids: [sourceId], new_client_ids: [newClientId] });
    const tAfter = Date.now();

    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    const alcRow = calls.alcoholInserts[0]!;
    expect(alcRow).toMatchObject({
      user_id: userId,
      entry_id: 'new-entry-1', // synthesized by the insert mock
      volume_ml: 355,
      // 355 * 0.05 * 0.789 = 14.00475 → 14.005
      alcohol_grams: 14.005,
    });
    // consumed_at MUST be the NEW entry's consumed_at (today), not the
    // source row's logged_at (which is not even on sourceRows here).
    const consumedAtMs = Date.parse(String(alcRow.consumed_at));
    expect(consumedAtMs).toBeGreaterThanOrEqual(tBefore - 1000);
    expect(consumedAtMs).toBeLessThanOrEqual(tAfter + 1000);
  });

  it('Test C-B — copies a non-alcoholic source row and writes NO alcohol_logs row', async () => {
    const sourceId = '11111111-1111-4111-8111-111111111112';
    const newClientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
    const sourceRows: Row[] = [
      {
        id: sourceId,
        meal_category: 'snack',
        source: 'text',
        items: [{ name: 'banana', portion: 1, unit: 'unit', kcal: 105 }],
        ai_reasoning: null,
        library_item_id: null,
      },
    ];
    const { from, getUser, calls } = buildMocks({ sourceRows });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post({ ids: [sourceId], new_client_ids: [newClientId] });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(0);
  });

  it('Test C-C — replay (23505) does NOT duplicate alcohol_logs rows', async () => {
    // Source row is alcoholic. First insert hits 23505 (the new_client_ids
    // were already used in a prior copy run). The route's race-recovery
    // re-SELECTs the previously-committed entries; the alcohol logger must
    // see the existing alcohol_logs rows for those entry_ids and SKIP.
    const sourceId = '11111111-1111-4111-8111-111111111113';
    const newClientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
    const sourceRows: Row[] = [
      {
        id: sourceId,
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
        ai_reasoning: null,
        library_item_id: null,
      },
    ];
    const previouslyInsertedEntries: Row[] = [
      {
        id: 'replay-entry-1',
        user_id: userId,
        client_id: newClientId,
        logged_at: '2026-04-22T11:00:00.000Z',
        meal_category: 'drink',
        items: sourceRows[0]!.items,
      },
    ];
    // The previously-inserted entry already has an alcohol_logs row.
    const alcoholExisting = new Map<string, Row | null>([
      ['replay-entry-1', { id: 'alc-existing' }],
    ]);
    const { from, getUser, calls } = buildMocks({
      sourceRows,
      insertedRows: previouslyInsertedEntries,
      alcoholExistingByEntryId: alcoholExisting,
    });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post({ ids: [sourceId], new_client_ids: [newClientId] });
    expect(res.status).toBe(200);
    // No new alcohol_logs row — the prior copy's row stands.
    expect(calls.alcoholInserts).toHaveLength(0);
    // But the route DID inspect alcohol_logs to detect the existing row.
    expect(calls.alcoholReads).toContain('replay-entry-1');
  });

  it('Test C-D — mixed batch: only alcoholic copies write alcohol_logs', async () => {
    const sourceIds = [
      '22222222-2222-4222-8222-222222222221',
      '22222222-2222-4222-8222-222222222222',
    ];
    const newClientIds = [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    ];
    const sourceRows: Row[] = [
      {
        id: sourceIds[0],
        meal_category: 'drink',
        source: 'text',
        items: [
          {
            name: 'IPA',
            portion: 1,
            unit: 'bottle',
            kcal: 200,
            is_alcoholic: true,
            volume_ml: 473,
            abv_percent: 6.5,
          },
        ],
        ai_reasoning: null,
        library_item_id: null,
      },
      {
        id: sourceIds[1],
        meal_category: 'lunch',
        source: 'text',
        items: [{ name: 'sandwich', portion: 1, unit: 'unit', kcal: 400 }],
        ai_reasoning: null,
        library_item_id: null,
      },
    ];
    const { from, getUser, calls } = buildMocks({ sourceRows });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await post({ ids: sourceIds, new_client_ids: newClientIds });
    expect(res.status).toBe(200);
    expect(calls.alcoholInserts).toHaveLength(1);
    expect(calls.alcoholInserts[0]).toMatchObject({
      volume_ml: 473,
      // 473 * 0.065 * 0.789 = 24.258
      alcohol_grams: 24.258,
    });
  });
});
