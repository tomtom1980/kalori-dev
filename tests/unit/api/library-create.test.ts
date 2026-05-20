/**
 * @vitest-environment node
 *
 * Bug 6 (library overhaul 2026-05-16) — POST /api/library/create route
 * unit tests with mocked Supabase + Next cache + waitUntil.
 *
 * Asserts:
 *   1. Valid payload → 201 + row with created_from='manual', user_edited_flag=true
 *   2. Same client_id replayed → 200 + same row + replayed:true (I11)
 *   3. Normalized-name collision → 409 + existing item
 *   4. Invalid Zod body → 400
 *   5. Sketch generation enqueued via `waitUntil` on success
 *   6. Cache tag invalidated on success
 *   7. Error-path coverage: Supabase insert error → 500, NO cache revalidation
 *
 * Pattern reference: tests/integration/library-create.test.ts mock harness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const UID = 'u-aaaaaaaa';
const VALID_CLIENT_ID = 'aaaaaaaa-2222-4222-8222-222222222222';

interface MockHarnessOpts {
  libraryStore?: Map<string, Row>;
  insertError?: { code?: string; message?: string } | null;
  fenceResult?: Response | null;
  uid?: string;
}

function setupMocks(opts: MockHarnessOpts = {}) {
  const libraryStore = opts.libraryStore ?? new Map<string, Row>();
  const insertError = opts.insertError ?? null;
  const uid = opts.uid ?? UID;
  const revalidateTagFn = vi.fn();
  const afterFn = vi.fn();

  vi.doMock('server-only', () => ({}));
  vi.doMock('next/cache', () => ({
    revalidateTag: revalidateTagFn,
    revalidatePath: vi.fn(),
  }));
  // The sketch trigger uses `after()` from next/server. Stub it so the
  // test can assert the enqueue without actually invoking the sketch
  // pipeline (which would hit the live Gemini API). We mock the
  // higher-level enqueue helper too — sketch-enqueue.ts imports `after`
  // from next/server transitively, but we also intercept at the helper
  // boundary because that gives us a precise call-count assertion.
  vi.doMock('next/server', async () => {
    const actual = await vi.importActual<typeof import('next/server')>('next/server');
    return { ...actual, after: afterFn };
  });
  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: async () =>
      opts.fenceResult ?? { user: { id: uid }, profile: { id: uid } },
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: async () => null,
  }));
  vi.doMock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
  }));
  // Stub the sketch enqueue function so it can be observed without
  // running the live pipeline.
  vi.doMock('@/lib/library/sketch-enqueue', () => ({
    enqueueSketchGeneration: vi.fn(),
  }));

  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: uid } }, error: null }),
      },
      from: (table: string) => {
        if (table === 'food_library_items') {
          let qNormalized: string | null = null;
          let qClientId: string | null = null;
          let qUserId: string | null = null;
          return {
            select: (_cols?: string, options?: { count?: string; head?: boolean }) => ({
              eq: (k: string, v: unknown) => {
                if (options?.head && options.count === 'exact') {
                  if (k === 'user_id') qUserId = String(v);
                  const countQuery = {
                    gte: (_field: string, start: string) => ({
                      lt: async (_field2: string, end: string) => {
                        const count = Array.from(libraryStore.values()).filter((row) => {
                          const createdAt =
                            typeof row.created_at === 'string' ? row.created_at : null;
                          return (
                            row.user_id === (qUserId ?? uid) &&
                            createdAt !== null &&
                            createdAt >= start &&
                            createdAt < end
                          );
                        }).length;
                        return { count, error: null };
                      },
                    }),
                  };
                  return countQuery;
                }
                // chained .eq calls: first user_id, then either client_id
                // or normalized_name. We capture whichever discriminator
                // arrives so the maybeSingle returns the right preview.
                const inner = {
                  eq: (k2: string, v2: unknown) => {
                    if (k2 === 'client_id') qClientId = String(v2);
                    if (k2 === 'normalized_name') qNormalized = String(v2);
                    return {
                      is: () => ({
                        maybeSingle: async () => {
                          if (qClientId) {
                            const row = Array.from(libraryStore.values()).find(
                              (r) => r.user_id === uid && r.client_id === qClientId,
                            );
                            return { data: row ?? null, error: null };
                          }
                          if (qNormalized) {
                            const row = Array.from(libraryStore.values()).find(
                              (r) =>
                                r.user_id === uid &&
                                r.normalized_name === qNormalized &&
                                r.deleted_at === null,
                            );
                            return { data: row ?? null, error: null };
                          }
                          return { data: null, error: null };
                        },
                      }),
                    };
                  },
                };
                if (k === 'user_id') return inner;
                return inner;
              },
            }),
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  if (insertError) {
                    return { data: null, error: insertError };
                  }
                  const id = `lib-${libraryStore.size + 1}`;
                  const row: Row = {
                    id,
                    created_at: new Date().toISOString(),
                    deleted_at: null,
                    thumbnail_url: null,
                    thumbnail_kind: null,
                    log_count: 0,
                    last_used_at: null,
                    user_edited_flag: true,
                    default_portion: null,
                    default_unit: null,
                    sketch_generated_at: null,
                    sketch_attempt_count: 0,
                    sketch_last_error: null,
                    ...payload,
                  };
                  libraryStore.set(id, row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`unknown table in test: ${table}`);
      },
    }),
  }));

  return { libraryStore, revalidateTagFn, afterFn };
}

async function callRoute(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/library/create/route');
  return POST(
    new Request('http://kalori.test/api/library/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    client_id: VALID_CLIENT_ID,
    display_name: 'Avocado Toast',
    default_portion: 1,
    default_unit: 'slice',
    nutrition: {
      kcal: 250,
      macros: { protein_g: 8, carbs_g: 30, fat_g: 12, fiber_g: 5 },
    },
    ...overrides,
  };
}

describe('POST /api/library/create — Bug 6', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
    vi.doUnmock('next/server');
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/account/deleting-fence');
    vi.doUnmock('@/lib/library/sketch-enqueue');
    vi.doUnmock('@sentry/nextjs');
  });

  it('valid payload returns 201 + row with created_from=manual + user_edited_flag=true', async () => {
    const { libraryStore } = setupMocks();
    const res = await callRoute(validBody());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Record<string, unknown> };
    expect(body.item.created_from).toBe('manual');
    expect(body.item.user_edited_flag).toBe(true);
    expect(body.item.display_name).toBe('Avocado Toast');
    // Normalized via lib/text/normalize.ts: lowercase + token-sort.
    // 'Avocado Toast' → tokens ['avocado','toast'] → sort → 'avocado toast'.
    expect(body.item.normalized_name).toBe('avocado toast');
    expect(libraryStore.size).toBe(1);
  });

  it('persists optional recipe eligibility fields from manual create without calling AI', async () => {
    setupMocks();
    const res = await callRoute(
      validBody({
        recipe_eligibility: 'eligible',
        recipe_eligibility_reason: 'mixed_dish',
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Row };
    expect(body.item.recipe_eligibility).toBe('eligible');
    expect(body.item.recipe_eligibility_reason).toBe('mixed_dish');
    expect(body.item.recipe_eligibility_checked_at).toEqual(expect.any(String));
  });

  it('duplicate client_id returns 200 + replayed:true with existing row (I11)', async () => {
    const { libraryStore } = setupMocks();
    // First insert.
    const res1 = await callRoute(validBody());
    expect(res1.status).toBe(201);
    expect(libraryStore.size).toBe(1);

    // Re-import to reset route state but keep store reference.
    vi.resetModules();
    const ww = setupMocks({ libraryStore });
    // Re-do mocks point at same store.
    const res2 = await callRoute(validBody());
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { item: Row; replayed?: boolean };
    expect(body2.replayed).toBe(true);
    expect(body2.item.client_id).toBe(VALID_CLIENT_ID);
    // No new row inserted on replay.
    expect(ww.libraryStore.size).toBe(1);
  });

  it('normalized-name collision returns 409 + existing item id', async () => {
    const { libraryStore } = setupMocks();
    // Seed the store with an existing 'avocado toast' row.
    libraryStore.set('lib-existing', {
      id: 'lib-existing',
      user_id: UID,
      client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      display_name: 'Avocado Toast',
      normalized_name: 'avocado toast',
      deleted_at: null,
      created_from: 'manual',
    });

    // Send the SAME display_name with a DIFFERENT client_id — dedup must
    // win and return 409.
    const body = validBody({ client_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' });
    const res = await callRoute(body);
    expect(res.status).toBe(409);
    const respBody = (await res.json()) as { existing?: { id: string }; error?: string };
    expect(respBody.error).toBe('duplicate_name');
    expect(respBody.existing?.id).toBe('lib-existing');
  });

  it('rejects invalid Zod body with 400', async () => {
    setupMocks();
    const res = await callRoute({ display_name: '', client_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('enqueues sketch generation via waitUntil on success', async () => {
    setupMocks();
    // Import the enqueue stub so we can assert it was called.
    const enqueueModule = await import('@/lib/library/sketch-enqueue');
    const res = await callRoute(validBody());
    expect(res.status).toBe(201);
    // The route MUST call enqueueSketchGeneration with the new row's id.
    expect(
      (enqueueModule.enqueueSketchGeneration as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it('revalidates library cache tag on success', async () => {
    const { revalidateTagFn } = setupMocks();
    const res = await callRoute(validBody());
    expect(res.status).toBe(201);
    expect(revalidateTagFn).toHaveBeenCalled();
  });

  it('on Supabase insert error returns 500 and does NOT revalidate cache (error-path discipline)', async () => {
    const { revalidateTagFn } = setupMocks({
      insertError: { code: 'PGRST500', message: 'simulated' },
    });
    const res = await callRoute(validBody());
    expect(res.status).toBe(500);
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  it('rejects fresh creates with 429 when the daily library-add limit is reached', async () => {
    const libraryStore = new Map<string, Row>();
    const now = new Date().toISOString();
    for (let i = 0; i < 20; i++) {
      libraryStore.set(`daily-${i}`, {
        id: `daily-${i}`,
        user_id: UID,
        client_id: `dddddddd-2222-4222-8222-${String(i).padStart(12, '0')}`,
        display_name: `Daily ${i}`,
        normalized_name: `daily ${i}`,
        deleted_at: null,
        created_at: now,
      });
    }
    setupMocks({ libraryStore });

    const res = await callRoute(validBody({ display_name: 'New Limited Food' }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string; quota?: { dailyCount?: number } };
    expect(body.error).toBe('library_create_quota_exceeded');
    expect(body.quota?.dailyCount).toBe(20);
    expect(libraryStore.size).toBe(20);
  });

  it('rejects when fence returns Response (401 unauthenticated)', async () => {
    const fenceResp = new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 });
    setupMocks({ fenceResult: fenceResp });
    const res = await callRoute(validBody());
    expect(res.status).toBe(401);
  });
});
