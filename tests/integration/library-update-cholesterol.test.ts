/**
 * @vitest-environment node
 *
 * Phase 2C — POST /api/library/[id]/update accepts cholesterol_mg as the
 * 5th macro inside `fields.nutrition.macros`. The route persists the
 * full nutrition object verbatim (shallow JSONB replacement); cholesterol
 * must round-trip into the row.
 *
 * Pattern matches `tests/integration/library-item-update.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';

describe('POST /api/library/[id]/update — Phase 2C cholesterol_mg', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('200: nutrition payload including cholesterol_mg → row updated with cholesterol_mg preserved', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    let updatePayload: Record<string, unknown> | null = null;
    const updatedRow = {
      id: ITEM_ID,
      client_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Beef Liver',
      normalized_name: 'beef liver',
      default_portion: 100,
      default_unit: 'g',
      nutrition: {
        kcal: 135,
        macros: {
          protein_g: 20.4,
          carbs_g: 3.9,
          fat_g: 3.6,
          fiber_g: 0,
          sugar_g: 0,
          cholesterol_mg: 396,
        },
      },
      thumbnail_url: null,
      log_count: 0,
      last_used_at: null,
      user_edited_flag: true,
      created_from: 'manual',
      created_at: '2026-05-16T00:00:00.000Z',
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                update: (payload: Record<string, unknown>) => {
                  updatePayload = payload;
                  return {
                    eq: () => ({
                      eq: () => ({
                        is: () => ({
                          select: () => ({
                            maybeSingle: async () => ({ data: updatedRow, error: null }),
                          }),
                        }),
                      }),
                    }),
                  };
                },
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            nutrition: {
              kcal: 135,
              macros: {
                protein_g: 20.4,
                carbs_g: 3.9,
                fat_g: 3.6,
                fiber_g: 0,
                sugar_g: 0,
                cholesterol_mg: 396,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).not.toBeNull();
    const nutrition = (
      updatePayload as unknown as {
        nutrition: { macros: { cholesterol_mg: number } };
      }
    ).nutrition;
    expect(nutrition.macros.cholesterol_mg).toBe(396);
    const body = (await res.json()) as { item: typeof updatedRow };
    expect(body.item.nutrition.macros.cholesterol_mg).toBe(396);
  });

  it('200: nutrition payload omitting cholesterol_mg still passes Zod (back-compat)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) =>
          table === 'profiles'
            ? {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                  }),
                }),
              }
            : {
                // E.CODEX B-H1 — pre-write read for cholesterol preserve-merge.
                // The route now SELECTs `nutrition` before UPDATE when the
                // incoming nutrition lacks `cholesterol_mg`. This row has
                // no cholesterol_mg in macros so absence is preserved.
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        maybeSingle: async () => ({
                          data: { nutrition: { macros: {} } },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
                update: () => ({
                  eq: () => ({
                    eq: () => ({
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({
                            data: {
                              id: ITEM_ID,
                              client_id: '22222222-2222-4222-8222-222222222222',
                              display_name: 'Apple',
                              normalized_name: 'apple',
                              default_portion: 1,
                              default_unit: 'piece',
                              nutrition: {
                                kcal: 95,
                                macros: {
                                  protein_g: 0.5,
                                  carbs_g: 25,
                                  fat_g: 0.3,
                                  fiber_g: 4.4,
                                  sugar_g: 19,
                                },
                              },
                              thumbnail_url: null,
                              log_count: 0,
                              last_used_at: null,
                              user_edited_flag: true,
                              created_from: 'manual',
                              created_at: '2026-05-16T00:00:00.000Z',
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            nutrition: {
              kcal: 95,
              macros: {
                protein_g: 0.5,
                carbs_g: 25,
                fat_g: 0.3,
                fiber_g: 4.4,
                sugar_g: 19,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('400: negative cholesterol_mg → ValidationError', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
            }),
          }),
        }),
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            nutrition: {
              kcal: 100,
              macros: {
                protein_g: 5,
                carbs_g: 10,
                fat_g: 2,
                fiber_g: 1,
                sugar_g: 0,
                cholesterol_mg: -5,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );
    expect(res.status).toBe(400);
  });
});
