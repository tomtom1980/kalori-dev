/**
 * @vitest-environment node
 *
 * Bugfix 2026-05-17 R3 (library-micros-parse) — C2-R2-1.
 *
 * `POST /api/entries/save` with `save_to_library: true` writes `firstItem.micros`
 * directly into the `food_library_items.nutrition.micros` JSONB column. The
 * route's inline `ParsedItemSchema.micros` was `z.record(z.string(), z.number())`
 * with no `.max(MAX_MICRO_VALUE)` bound, so a direct authenticated POST could
 * persist values like `1.5e6` and bypass the C3 R1 integrity claim across
 * the row.
 *
 * Fix: apply `.finite().nonnegative().max(MAX_MICRO_VALUE)` to the inline
 * micros record value type. Imports `MAX_MICRO_VALUE` from the shared
 * `lib/library/micros-bounds.ts` module.
 *
 * Tests (RED → GREEN):
 *   - 400 on iron_mg = 1.5e6
 *   - 400 on multi-key overflow (iron_mg = 9.999e9 + sodium_mg = 2e6)
 *   - 200 boundary check at exactly iron_mg = 1e6 (inclusive max)
 *
 * Mocks mirror `tests/unit/api/entries-save.test.ts` — Supabase + revalidateTag
 * + the orphan-profile + deleting-fence chains, plus a library-table insert
 * mock so we can verify the library write was BLOCKED in the rejection cases
 * and FIRED in the boundary case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('POST /api/entries/save — save-to-library MAX_MICRO_VALUE bound (R3 C2-R2-1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildMockSupabase(libraryInsertCapture: { payload: Row | null }) {
    const profileRow = { id: 'u-1', timezone: 'Asia/Ho_Chi_Minh' };

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

    const entriesTable = {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: 'row-1',
              user_id: 'u-1',
              client_id: '11111111-1111-4111-8111-111111111111',
              logged_at: '2026-04-21T10:00:00.000Z',
              meal_category: 'breakfast',
              source: 'text',
              items: [],
              ai_reasoning: null,
            },
            error: null,
          }),
        }),
      }),
    };

    const libraryTable = {
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
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      },
      insert: (payload: Row) => {
        libraryInsertCapture.payload = payload;
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'lib-1', display_name: 'X' },
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

    return { from, getUser };
  }

  const baseValidBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    logged_at: '2026-04-21T10:00:00.000Z',
    meal_category: 'breakfast' as const,
    source: 'text' as const,
    save_to_library: true,
  };

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

  it('400 when items[0].micros has a value exceeding MAX_MICRO_VALUE (1e6)', async () => {
    const libraryInsertCapture: { payload: Row | null } = { payload: null };
    const { from, getUser } = buildMockSupabase(libraryInsertCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...baseValidBody,
      items: [
        {
          name: 'Pho Bo',
          portion: 1,
          unit: 'bowl',
          kcal: 450,
          macros: { protein_g: 28, carbs_g: 50, fat_g: 12, fiber_g: 3 },
          // 1.5e6 — pre-fix this was accepted because the inline
          // ParsedItemSchema.micros lacked .max(MAX_MICRO_VALUE).
          micros: { iron_mg: 1.5e6 },
        },
      ],
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('ValidationError');
    // No library write attempted — schema rejected before any DB side-effect.
    expect(libraryInsertCapture.payload).toBeNull();
  });

  it('400 when multiple micro keys exceed MAX_MICRO_VALUE', async () => {
    const libraryInsertCapture: { payload: Row | null } = { payload: null };
    const { from, getUser } = buildMockSupabase(libraryInsertCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...baseValidBody,
      items: [
        {
          name: 'Pho Bo',
          portion: 1,
          unit: 'bowl',
          kcal: 450,
          macros: { protein_g: 28, carbs_g: 50, fat_g: 12, fiber_g: 3 },
          micros: { iron_mg: 9.999e9, sodium_mg: 2e6 },
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(libraryInsertCapture.payload).toBeNull();
  });

  it('200 + library row written when a micro value sits exactly at MAX_MICRO_VALUE (1e6 boundary)', async () => {
    const libraryInsertCapture: { payload: Row | null } = { payload: null };
    const { from, getUser } = buildMockSupabase(libraryInsertCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...baseValidBody,
      items: [
        {
          name: 'Pho Bo',
          portion: 1,
          unit: 'bowl',
          kcal: 450,
          macros: { protein_g: 28, carbs_g: 50, fat_g: 12, fiber_g: 3 },
          // .max() is INCLUSIVE — 1e6 must pass. Protects against an
          // off-by-one tightening (`.lt(1e6)`) that would unexpectedly
          // break legitimate edits at the cap.
          micros: { iron_mg: 1_000_000 },
        },
      ],
    });

    expect(res.status).toBe(200);
    // Library row WAS written; micros round-tripped through the schema.
    expect(libraryInsertCapture.payload).not.toBeNull();
    const nutrition = libraryInsertCapture.payload?.nutrition as {
      micros?: Record<string, number>;
    };
    expect(nutrition?.micros?.iron_mg).toBe(1_000_000);
  });

  it('400 on negative micro values (defense-in-depth — bound check + .nonnegative())', async () => {
    const libraryInsertCapture: { payload: Row | null } = { payload: null };
    const { from, getUser } = buildMockSupabase(libraryInsertCapture);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody({
      ...baseValidBody,
      items: [
        {
          name: 'Pho Bo',
          portion: 1,
          unit: 'bowl',
          kcal: 450,
          macros: { protein_g: 28, carbs_g: 50, fat_g: 12, fiber_g: 3 },
          micros: { iron_mg: -5 },
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(libraryInsertCapture.payload).toBeNull();
  });
});
