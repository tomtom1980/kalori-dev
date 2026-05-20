/**
 * @vitest-environment node
 *
 * Bug 5 (library overhaul 2026-05-16) — `/api/entries/save` library
 * insert path triggers a sketch generation via `enqueueSketchGeneration`
 * for `source='text'` saves and SKIPS for `source='photo'` saves.
 *
 * Reuses the entries-save mock-store harness pattern but focuses on
 * the post-insert sketch enqueue contract introduced by Wave 5.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const UID = 'u-savetext';

function setupMocks() {
  const enqueueFn = vi.fn();

  vi.doMock('@/lib/library/sketch-enqueue', () => ({
    enqueueSketchGeneration: enqueueFn,
  }));
  vi.doMock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
  vi.doMock('next/cache', () => ({
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
  }));
  vi.doMock('@/lib/cache/revalidate-progress', () => ({
    revalidateAllProgressRanges: vi.fn(),
  }));
  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: async () => ({ user: { id: UID }, profile: { id: UID } }),
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: async () => null,
  }));

  const entriesStore = new Map<string, Row>();
  const libraryStore = new Map<string, Row>();

  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: UID } }, error: null }),
      },
      from: (table: string) => {
        if (table === 'profiles') {
          return {
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
        }
        if (table === 'food_entries') {
          let lookupCid = '';
          return {
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
                  eq: (k: string, v: string) => {
                    if (k === 'client_id') lookupCid = v;
                    return {
                      maybeSingle: async () => {
                        const key = `food_entries:${UID}:${lookupCid}`;
                        return { data: entriesStore.get(key) ?? null, error: null };
                      },
                    };
                  },
                }),
              };
            },
            update: (payload: Row) => ({
              eq: () => ({
                eq: async () => {
                  for (const [key, row] of entriesStore.entries()) {
                    entriesStore.set(key, { ...row, ...payload });
                  }
                  return { error: null, count: 1 };
                },
              }),
            }),
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  const cid = String(payload.client_id);
                  const row: Row = { id: `entry-${entriesStore.size + 1}`, ...payload };
                  entriesStore.set(`food_entries:${UID}:${cid}`, row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'food_library_items') {
          return {
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  const id = `lib-${libraryStore.size + 1}`;
                  const row: Row = { id, display_name: payload.display_name, ...payload };
                  libraryStore.set(id, row);
                  return { data: row, error: null };
                },
              }),
            }),
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
            update: (payload: Row) => ({
              eq: (key: string, value: string) => ({
                eq: () => ({
                  is: async () => {
                    if (key === 'id') {
                      const row = libraryStore.get(value);
                      if (row) libraryStore.set(value, { ...row, ...payload });
                    }
                    return { error: null };
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`unknown table: ${table}`);
      },
    }),
  }));

  return { enqueueFn, libraryStore };
}

async function postSave(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('@/app/api/entries/save/route');
  return POST(
    new Request('http://kalori.test/api/entries/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

const baseBody = (overrides: Record<string, unknown> = {}) => ({
  client_id: 'aaaaaaaa-eeee-4eee-8eee-eeeeeeeeeeee',
  logged_at: '2026-05-15T12:00:00.000Z',
  meal_category: 'lunch',
  source: 'text',
  save_to_library: true,
  items: [
    {
      name: 'green apple',
      portion: 1,
      unit: 'piece',
      kcal: 95,
      macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
    },
  ],
  ...overrides,
});

describe('POST /api/entries/save sketch enqueue — Bug 5', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/library/sketch-enqueue');
    vi.doUnmock('@sentry/nextjs');
    vi.doUnmock('next/cache');
    vi.doUnmock('@/lib/cache/revalidate-progress');
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/account/deleting-fence');
    vi.doUnmock('@/lib/supabase/server');
  });

  it('text source with save_to_library=true fires enqueueSketchGeneration', async () => {
    const { enqueueFn, libraryStore } = setupMocks();
    const res = await postSave(baseBody({ source: 'text' }));
    expect(res.status).toBe(200);
    expect(libraryStore.size).toBe(1);
    expect(enqueueFn).toHaveBeenCalledOnce();
    const call = enqueueFn.mock.calls[0]![0] as {
      libraryItemId: string;
      userId: string;
      displayName: string;
    };
    expect(call.userId).toBe(UID);
    expect(call.displayName).toBe('green apple');
    expect(call.libraryItemId).toBe('lib-1');
  });

  it('photo source with save_to_library=true: leaves thumbnail_kind null when no photo URL is persisted, allows sketch fallback (Codex Critical #3)', async () => {
    const { enqueueFn, libraryStore } = setupMocks();
    const res = await postSave(baseBody({ source: 'photo' }));
    expect(res.status).toBe(200);
    expect(libraryStore.size).toBe(1);
    const row = Array.from(libraryStore.values())[0]!;
    // Codex Round 1 Critical #3 — DO NOT mark `thumbnail_kind='photo'`
    // when no thumbnail URL is actually persisted. The previous
    // behavior was a trap: the row got `thumbnail_kind='photo'` with
    // no `thumbnail_url`, the sketch pipeline's photo-wins guard
    // skipped it, and the renderer fell back to the letter-mark
    // forever. Leaving `thumbnail_kind` null restores sketch-fallback
    // eligibility.
    expect(row.thumbnail_kind).toBeNull();
    expect(row.thumbnail_url ?? null).toBeNull();
    // Sketch enqueue MUST fire now — photo-source rows without a real
    // thumbnail URL are sketch-eligible (Codex recommendation: "allow
    // sketch fallback when thumbnail_kind='photo' has a null
    // thumbnail_url" — our chosen variant is "don't mark photo at all
    // when there's no URL," which is the simpler half of the same fix).
    expect(enqueueFn).toHaveBeenCalledOnce();
    const call = enqueueFn.mock.calls[0]![0] as {
      libraryItemId: string;
      userId: string;
      displayName: string;
    };
    expect(call.userId).toBe(UID);
    expect(call.displayName).toBe('green apple');
  });

  it('save_to_library=false does NOT fire sketch (no library row inserted)', async () => {
    const { enqueueFn, libraryStore } = setupMocks();
    const res = await postSave(baseBody({ save_to_library: false }));
    expect(res.status).toBe(200);
    expect(libraryStore.size).toBe(0);
    expect(enqueueFn).not.toHaveBeenCalled();
  });
});
