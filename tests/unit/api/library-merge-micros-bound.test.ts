/**
 * @vitest-environment node
 *
 * Bugfix 2026-05-17 R3 (library-micros-parse) — C2-R2-2.
 *
 * `POST /api/library/merge` accepted `fields.nutrition.micros` as
 * `z.record(z.string(), z.number())` with no `.max`, no `.finite()`, no
 * `.nonnegative()`. The merge RPC `library_merge_atomic` then updates the
 * winner library item's `nutrition` JSONB column — making this a third
 * mutation surface that could persist oversized or negative micro values
 * despite the R1 C3 fix on `/api/library/[id]/update` and `/api/library/create`.
 *
 * Fix: tighten the inline `NutritionSchema.micros` to
 * `z.record(z.string(), z.number().finite().nonnegative().max(MAX_MICRO_VALUE))`.
 * Imports the shared `MAX_MICRO_VALUE` constant from `lib/library/micros-bounds.ts`.
 *
 * Tests (RED → GREEN):
 *   - 400 on iron_mg = 1.5e6
 *   - 400 on multi-key overflow (iron_mg = 9.999e9 + sodium_mg = 2e6)
 *   - 200 boundary at exactly iron_mg = 1e6 (inclusive max)
 *   - 400 on negative micro values
 *
 * Mocks: Supabase + revalidateTag + the orphan-profile + deleting-fence
 * chains. RPC is mocked to a happy-path winner-row return on the boundary
 * test so the rejection path is unambiguous.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/merge — MAX_MICRO_VALUE bound (R3 C2-R2-2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildMockSupabase(rpcCapture: {
    called: boolean;
    args: Record<string, unknown> | null;
  }) {
    const profileTable = {
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

    // Make entriesTable.select().eq().eq() awaitable as a query result.
    const entriesSelectEqEq = async () => ({ data: [], error: null });
    const entriesTableProper = {
      select: () => ({
        eq: () => ({
          eq: () =>
            Object.assign(entriesSelectEqEq(), {
              then: (onF: (v: unknown) => void) => entriesSelectEqEq().then(onF),
            }),
        }),
      }),
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') return profileTable;
      if (table === 'food_entries') return entriesTableProper;
      // `food_library_items` is only touched on the signed-URL re-resolve
      // path — none of our test bodies trigger it (no `http(s)://` in
      // `thumbnail_url`), so return a no-op stub that will throw if used.
      if (table === 'food_library_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: { default_unit: 'cup' },
                    error: null,
                  }),
                }),
              }),
              in: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unknown table in test: ${table}`);
    });

    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCapture.called = true;
      rpcCapture.args = args;
      // Happy path: return a winner row.
      return {
        data: {
          winner: {
            id: 'w-1',
            display_name: 'Winner',
            nutrition: args.p_fields,
            log_count: 1,
            last_used_at: '2026-04-01T00:00:00Z',
          },
          replayed: false,
        },
        error: null,
      };
    });

    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));

    return { from, getUser, rpc };
  }

  async function postMerge(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/library/merge/route');
    return POST(
      new Request('http://kalori.test/api/library/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  const baseValidBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    winnerId: '22222222-2222-4222-8222-222222222222',
    loserId: '33333333-3333-4333-8333-333333333333',
  };

  it('400 when fields.nutrition.micros has a value exceeding MAX_MICRO_VALUE (1e6)', async () => {
    const rpcCapture = { called: false, args: null as Record<string, unknown> | null };
    const { from, getUser, rpc } = buildMockSupabase(rpcCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));

    const res = await postMerge({
      ...baseValidBody,
      fields: {
        nutrition: {
          kcal: 250,
          macros: { protein_g: 20, carbs_g: 30, fat_g: 10 },
          // 1.5e6 — over the 1e6 cap.
          micros: { iron_mg: 1.5e6 },
        },
      },
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('ValidationError');
    // Critical: RPC was NEVER invoked — schema rejected before any DB write.
    expect(rpcCapture.called).toBe(false);
  });

  it('400 when multiple micro keys exceed MAX_MICRO_VALUE', async () => {
    const rpcCapture = { called: false, args: null as Record<string, unknown> | null };
    const { from, getUser, rpc } = buildMockSupabase(rpcCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));

    const res = await postMerge({
      ...baseValidBody,
      fields: {
        nutrition: {
          kcal: 250,
          macros: { protein_g: 20, carbs_g: 30, fat_g: 10 },
          micros: { iron_mg: 9.999e9, sodium_mg: 2e6 },
        },
      },
    });

    expect(res.status).toBe(400);
    expect(rpcCapture.called).toBe(false);
  });

  it('200 + RPC invoked when a micro value sits exactly at MAX_MICRO_VALUE (1e6 boundary)', async () => {
    const rpcCapture = { called: false, args: null as Record<string, unknown> | null };
    const { from, getUser, rpc } = buildMockSupabase(rpcCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));

    const res = await postMerge({
      ...baseValidBody,
      fields: {
        nutrition: {
          kcal: 250,
          macros: { protein_g: 20, carbs_g: 30, fat_g: 10 },
          micros: { iron_mg: 1_000_000 },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(rpcCapture.called).toBe(true);
    const fields = rpcCapture.args?.p_fields as {
      nutrition: { micros?: Record<string, number> };
    };
    expect(fields.nutrition.micros?.iron_mg).toBe(1_000_000);
  });

  it('400 on negative micro values', async () => {
    const rpcCapture = { called: false, args: null as Record<string, unknown> | null };
    const { from, getUser, rpc } = buildMockSupabase(rpcCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));

    const res = await postMerge({
      ...baseValidBody,
      fields: {
        nutrition: {
          kcal: 250,
          macros: { protein_g: 20, carbs_g: 30, fat_g: 10 },
          micros: { iron_mg: -5 },
        },
      },
    });

    expect(res.status).toBe(400);
    expect(rpcCapture.called).toBe(false);
  });

  it('400 when default_portion is fractional and existing winner unit is whole-style', async () => {
    const rpcCapture = { called: false, args: null as Record<string, unknown> | null };
    const { from, getUser, rpc } = buildMockSupabase(rpcCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from, rpc }),
    }));

    const res = await postMerge({
      ...baseValidBody,
      fields: {
        default_portion: 1.5,
        nutrition: {
          kcal: 250,
          macros: { protein_g: 20, carbs_g: 30, fat_g: 10 },
        },
      },
    });

    expect(res.status).toBe(400);
    expect(rpcCapture.called).toBe(false);
  });
});
