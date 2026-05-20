/**
 * @vitest-environment node
 *
 * E.CODEX Round 2 — B-H1: TOCTOU cholesterol erase on legacy-client edit.
 *
 * Scenario the fix prevents: Device A writes cholesterol_mg=25 into a row.
 * Device B fetches the row via a legacy form that does not render the
 * cholesterol input, then submits an unrelated edit. Device B's full-JSON
 * nutrition replacement LACKS the `cholesterol_mg` key — without the
 * server-side preserve-merge, the row is silently rewritten with the key
 * absent, erasing Device A's data.
 *
 * Fix contract (Option 1 — server-side preserve-cholesterol read-merge-write):
 *   - BEFORE the UPDATE, SELECT the current `nutrition.cholesterol_mg` from
 *     the row.
 *   - If the incoming `fields.nutrition.macros` lacks the `cholesterol_mg`
 *     KEY (truly absent, not `null`), inject the current DB value before
 *     writing.
 *   - If the client explicitly sets `cholesterol_mg: null` (clear) or
 *     `cholesterol_mg: <number>` (new value), the client wins.
 *   - Clients that do not edit nutrition at all are unaffected (the route
 *     never reads cholesterol when `fields.nutrition` is absent).
 *
 * Test plan:
 *   1. Absent key → preserved from DB (legacy-client safety).
 *   2. Explicit null → cleared (intentional clear).
 *   3. Explicit value → honored (intentional new value).
 *
 * Mocks mirror `tests/integration/library-update-cholesterol.test.ts` so
 * the new fetch-current-row read can be observed without coupling to the
 * real Supabase client. Note: the Zod schema parses `nutrition.macros` as
 * `.strict()` — meaning truly unknown keys are rejected — but `cholesterol_mg`
 * is `.optional()` on the schema, so its absence is valid input and
 * survives parse without being injected. The preserve-merge therefore
 * runs on `parsed.data.fields.nutrition.macros`, which has either the
 * key present (any value) or the key absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const ROW_CLIENT_ID = '22222222-2222-4222-8222-222222222222';

// Reusable updatedRow factory so each test can assert on the exact
// payload the route handed to .update(...).
function makeRowSnapshot(cholesterolFinal: number | null | undefined) {
  return {
    id: ITEM_ID,
    client_id: ROW_CLIENT_ID,
    display_name: 'Pho Ga',
    normalized_name: 'pho ga',
    default_portion: 400,
    default_unit: 'g',
    nutrition: {
      kcal: 520,
      macros: {
        protein_g: 30,
        carbs_g: 50,
        fat_g: 15,
        fiber_g: 2,
        sugar_g: 1,
        ...(cholesterolFinal === undefined ? {} : { cholesterol_mg: cholesterolFinal }),
      },
    },
    thumbnail_url: null,
    thumbnail_kind: null,
    log_count: 0,
    last_used_at: null,
    user_edited_flag: true,
    created_from: 'manual',
    created_at: '2026-05-16T00:00:00.000Z',
  };
}

interface SupabaseMockSpec {
  // What the pre-write SELECT should return for the row's current nutrition.
  currentRowNutrition: { cholesterol_mg?: number | null } | null;
  // What the UPDATE-then-SELECT chain returns to the route.
  updatedRow: ReturnType<typeof makeRowSnapshot>;
  // Capture the patch passed to .update(...) so the test can inspect it.
  updatePayloadHolder: { payload: Record<string, unknown> | null };
}

function buildSupabaseMock(spec: SupabaseMockSpec): { getServerSupabase: () => Promise<unknown> } {
  return {
    getServerSupabase: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
              }),
            }),
          };
        }
        // food_library_items — supports BOTH the pre-write SELECT and the
        // UPDATE-then-SELECT chain. The route SELECTs cholesterol_mg first,
        // then UPDATEs with the merged patch.
        return {
          select: (columns?: string) => {
            // Pre-write read: SELECT nutrition (or cholesterol projection).
            // The query chain is .select(...).eq(id).eq(user_id).is(deleted_at, null).maybeSingle().
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({
                      data:
                        spec.currentRowNutrition === null
                          ? null
                          : { nutrition: { macros: spec.currentRowNutrition } },
                      error: null,
                      // Stash the columns string on the resolved value so the
                      // test could assert on it if needed.
                      _columns: columns,
                    }),
                  }),
                }),
              }),
            };
          },
          update: (payload: Record<string, unknown>) => {
            spec.updatePayloadHolder.payload = payload;
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: spec.updatedRow, error: null }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      },
    }),
  };
}

describe('POST /api/library/[id]/update — cholesterol_mg TOCTOU preserve-merge (E.CODEX B-H1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('preserves cholesterol_mg when client blob omits the key but DB row has it (legacy form safety)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const updatePayloadHolder: { payload: Record<string, unknown> | null } = { payload: null };
    vi.doMock(
      '@/lib/supabase/server',
      () =>
        buildSupabaseMock({
          // DB currently has cholesterol_mg = 25.
          currentRowNutrition: { cholesterol_mg: 25 },
          updatedRow: makeRowSnapshot(25),
          updatePayloadHolder,
        }) as never,
    );

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            // Legacy client posts a full nutrition object WITHOUT the
            // cholesterol_mg key (key absent — not null). This must NOT
            // erase the DB value.
            nutrition: {
              kcal: 520,
              macros: {
                protein_g: 30,
                carbs_g: 50,
                fat_g: 15,
                fiber_g: 2,
                sugar_g: 1,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );

    expect(res.status).toBe(200);
    expect(updatePayloadHolder.payload).not.toBeNull();
    // Server must have injected cholesterol_mg = 25 into the UPDATE payload.
    const written = updatePayloadHolder.payload as {
      nutrition: { macros: { cholesterol_mg?: number } };
    };
    expect(written.nutrition.macros.cholesterol_mg).toBe(25);
  });

  it('honors explicit cholesterol_mg: <number> from client (intentional new value)', async () => {
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const updatePayloadHolder: { payload: Record<string, unknown> | null } = { payload: null };
    vi.doMock(
      '@/lib/supabase/server',
      () =>
        buildSupabaseMock({
          // DB currently has cholesterol_mg = 25 — but client is going to
          // overwrite it with 50.
          currentRowNutrition: { cholesterol_mg: 25 },
          updatedRow: makeRowSnapshot(50),
          updatePayloadHolder,
        }) as never,
    );

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            nutrition: {
              kcal: 520,
              macros: {
                protein_g: 30,
                carbs_g: 50,
                fat_g: 15,
                fiber_g: 2,
                sugar_g: 1,
                cholesterol_mg: 50,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );

    expect(res.status).toBe(200);
    const written = updatePayloadHolder.payload as {
      nutrition: { macros: { cholesterol_mg?: number } };
    };
    // Client value (50) must win over DB value (25).
    expect(written.nutrition.macros.cholesterol_mg).toBe(50);
  });

  it('keeps cholesterol absent on write when neither client nor DB has it (legacy → legacy)', async () => {
    // This covers the secondary preserve-absence path: when the DB row also
    // has no cholesterol_mg key, the server must NOT materialise a
    // phantom 0 (mirrors the client-side Codex R1 F2 absence semantics
    // from commit 037ffd4).
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));

    const updatePayloadHolder: { payload: Record<string, unknown> | null } = { payload: null };
    vi.doMock(
      '@/lib/supabase/server',
      () =>
        buildSupabaseMock({
          // DB has NO cholesterol_mg key.
          currentRowNutrition: {},
          updatedRow: makeRowSnapshot(undefined),
          updatePayloadHolder,
        }) as never,
    );

    const { POST } = await import('@/app/api/library/[id]/update/route');
    const res = await POST(
      new Request('http://kalori.test/api/library/x/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          fields: {
            nutrition: {
              kcal: 520,
              macros: {
                protein_g: 30,
                carbs_g: 50,
                fat_g: 15,
                fiber_g: 2,
                sugar_g: 1,
              },
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: ITEM_ID }) },
    );

    expect(res.status).toBe(200);
    const written = updatePayloadHolder.payload as {
      nutrition: { macros: Record<string, unknown> };
    };
    // Key must remain ABSENT (not null, not 0).
    expect('cholesterol_mg' in written.nutrition.macros).toBe(false);
  });
});
