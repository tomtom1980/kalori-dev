/**
 * @vitest-environment node
 *
 * Phase 2C — POST /api/library/create accepts the optional `cholesterol_mg`
 * macro and writes it through to `nutrition.macros.cholesterol_mg` in the
 * JSONB column. Legacy clients that omit the field still succeed; negative
 * values are rejected at the boundary.
 *
 * Pattern: shadows the harness in `tests/unit/api/library-create.test.ts`
 * (in-memory Supabase mock + fence stubs + sketch enqueue stub).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const UID = 'u-cholesterol';
const VALID_CLIENT_ID_1 = 'aaaaaaaa-c001-4001-8001-000000000001';
const VALID_CLIENT_ID_2 = 'aaaaaaaa-c002-4002-8002-000000000002';
const VALID_CLIENT_ID_3 = 'aaaaaaaa-c003-4003-8003-000000000003';

interface MockHarnessOpts {
  libraryStore?: Map<string, Row>;
  uid?: string;
}

function setupMocks(opts: MockHarnessOpts = {}) {
  const libraryStore = opts.libraryStore ?? new Map<string, Row>();
  const uid = opts.uid ?? UID;

  vi.doMock('server-only', () => ({}));
  vi.doMock('next/cache', () => ({
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
  }));
  vi.doMock('next/server', async () => {
    const actual = await vi.importActual<typeof import('next/server')>('next/server');
    return { ...actual, after: vi.fn() };
  });
  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: async () => ({ user: { id: uid }, profile: { id: uid } }),
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: async () => null,
  }));
  vi.doMock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
  }));
  vi.doMock('@/lib/library/sketch-enqueue', () => ({
    enqueueSketchGeneration: vi.fn(),
  }));

  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: uid } }, error: null }),
      },
      from: (table: string) => {
        if (table !== 'food_library_items') {
          throw new Error(`unknown table in test: ${table}`);
        }
        let qClientId: string | null = null;
        let qNormalized: string | null = null;
        return {
          select: (_cols?: string, options?: { count?: string; head?: boolean }) => ({
            eq: () => ({
              gte: () => ({
                lt: async () => ({ count: 0, error: null }),
              }),
              eq: (k2: string, v2: unknown) => {
                if (options?.head && options.count === 'exact') {
                  return {
                    gte: () => ({
                      lt: async () => ({ count: 0, error: null }),
                    }),
                  };
                }
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
            }),
          }),
          insert: (payload: Row) => ({
            select: () => ({
              single: async () => {
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
                  ...payload,
                };
                libraryStore.set(id, row);
                return { data: row, error: null };
              },
            }),
          }),
        };
      },
    }),
  }));

  return { libraryStore };
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

function bodyWithCholesterol(client_id: string, cholesterol_mg: number) {
  return {
    client_id,
    display_name: `Eggs ${client_id.slice(-4)}`,
    default_portion: 1,
    default_unit: 'piece',
    nutrition: {
      kcal: 78,
      macros: {
        protein_g: 6,
        carbs_g: 0.6,
        fat_g: 5,
        fiber_g: 0,
        cholesterol_mg,
      },
    },
  };
}

function bodyWithoutCholesterol(client_id: string) {
  return {
    client_id,
    display_name: `Legacy ${client_id.slice(-4)}`,
    nutrition: {
      kcal: 100,
      macros: { protein_g: 5, carbs_g: 10, fat_g: 2, fiber_g: 1 },
    },
  };
}

describe('POST /api/library/create — Phase 2C cholesterol_mg', () => {
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

  it('payload with cholesterol_mg → 201 + nutrition.macros.cholesterol_mg persisted', async () => {
    const { libraryStore } = setupMocks();
    const res = await callRoute(bodyWithCholesterol(VALID_CLIENT_ID_1, 186));
    expect(res.status).toBe(201);
    const writtenRows = Array.from(libraryStore.values());
    expect(writtenRows).toHaveLength(1);
    const row = writtenRows[0]!;
    const nutrition = row.nutrition as {
      macros: { cholesterol_mg: number };
    };
    expect(nutrition.macros.cholesterol_mg).toBe(186);
  });

  it('payload omitting cholesterol_mg → 201 + cholesterol_mg defaulted to 0 in JSONB', async () => {
    const { libraryStore } = setupMocks();
    const res = await callRoute(bodyWithoutCholesterol(VALID_CLIENT_ID_2));
    expect(res.status).toBe(201);
    const writtenRows = Array.from(libraryStore.values());
    expect(writtenRows).toHaveLength(1);
    const row = writtenRows[0]!;
    const nutrition = row.nutrition as {
      macros: { cholesterol_mg: number };
    };
    expect(nutrition.macros.cholesterol_mg).toBe(0);
  });

  it('payload with negative cholesterol_mg → 400 + no insert', async () => {
    const { libraryStore } = setupMocks();
    const res = await callRoute(bodyWithCholesterol(VALID_CLIENT_ID_3, -1));
    expect(res.status).toBe(400);
    expect(libraryStore.size).toBe(0);
  });
});
