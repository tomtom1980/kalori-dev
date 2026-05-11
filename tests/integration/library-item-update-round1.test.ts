/**
 * @vitest-environment node
 *
 * Task 4.2 round 1 — C2 + I1 fixes for /api/library/[id]/update.
 *
 * C2: Partial nutrition edits must preserve untouched macros/micros. Fix
 *     chosen path: CLIENT-SIDE MERGE — the client POSTs the full
 *     post-edit nutrition object (merged locally from initial + diff). The
 *     server's Zod schema requires the full macros shape when `nutrition`
 *     is present, so half-baked bodies 400 rather than silently nulling
 *     sibling columns.
 *
 * I1: Zod `.strict()` on the body / fields / nutrition / macros schemas
 *     must reject unknown keys. Covered here with three probes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/library/[id]/update — round 1 fixes', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  // --------------------------------------------------------------
  // I1 — Zod .strict() rejects unknown keys (coverage-gap fix)
  // --------------------------------------------------------------

  it('I1: 400 on unknown key at the body level', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const updateChain = vi.fn();
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
                update: updateChain,
              },
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga' },
          evilField: 'payload',
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain).not.toHaveBeenCalled();
  });

  it('I1: 400 on unknown key inside fields', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const updateChain = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({ update: updateChain }),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { display_name: 'Pho Ga', __proto__tamper: true },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain).not.toHaveBeenCalled();
  });

  it('I1: 400 on unknown key inside nutrition.macros', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const updateChain = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({ update: updateChain }),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: {
            nutrition: {
              kcal: 300,
              macros: {
                protein_g: 20,
                carbs_g: 30,
                fat_g: 10,
                fiber_g: 2,
                sugar_g: 1,
                trickyFieldName: 'payload',
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------
  // C2 — nutrition round-trip: client sends full merged object,
  // server writes that object, prior macros/micros preserved.
  // --------------------------------------------------------------

  it('C2: accepts a full merged nutrition payload and returns it unchanged', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    // Capture the patch actually sent to .update() so we can assert the
    // full nutrition object is preserved end-to-end.
    const updateArgs: Record<string, unknown>[] = [];
    const mergedNutrition = {
      kcal: 250,
      macros: {
        protein_g: 42, // the edited value
        carbs_g: 25,
        fat_g: 10,
        fiber_g: 3,
        sugar_g: 5,
      },
      micros: {
        sodium_mg: 100,
        iron_mg: 2,
      },
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: (table: string) => {
          if (table === 'profiles') {
            // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          return {
            update: (patch: Record<string, unknown>) => {
              updateArgs.push(patch);
              return {
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      select: () => ({
                        maybeSingle: async () => ({
                          data: {
                            id: '11111111-1111-4111-8111-111111111111',
                            client_id: '22222222-2222-4222-8222-222222222222',
                            display_name: 'Pho Bo',
                            normalized_name: 'pho bo',
                            default_portion: 400,
                            default_unit: 'g',
                            nutrition: mergedNutrition,
                            thumbnail_url: null,
                            log_count: 0,
                            last_used_at: null,
                            user_edited_flag: true,
                            created_from: 'text',
                            created_at: '2026-04-14T22:03:00Z',
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: { nutrition: mergedNutrition },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(200);

    // The patch actually written to Supabase must carry the FULL nutrition,
    // including sibling macros that the user didn't touch.
    expect(updateArgs).toHaveLength(1);
    const patch = updateArgs[0]!;
    expect(patch.nutrition).toEqual(mergedNutrition);

    // And the response round-trips it.
    const body = (await res.json()) as { item: { nutrition: typeof mergedNutrition } };
    expect(body.item.nutrition).toEqual(mergedNutrition);
  });

  it('C2: 400 when nutrition is present but macros object is missing required keys', async () => {
    // Protects against future client regressions that forget to rehydrate
    // siblings. With the round-1 contract, `nutrition.macros` must carry
    // all five keys (protein_g, carbs_g, fat_g, fiber_g, sugar_g) when
    // `nutrition.macros` is present at all. A body carrying only
    // `protein_g` gets 400.
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    const updateChain = vi.fn();
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
        from: () => ({ update: updateChain }),
      }),
    }));
    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '33333333-3333-4333-8333-333333333333',
          fields: {
            nutrition: {
              kcal: 300,
              macros: { protein_g: 42 },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain).not.toHaveBeenCalled();
  });
});
