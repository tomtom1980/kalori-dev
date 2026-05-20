/**
 * @vitest-environment node
 *
 * Task 4.2 — F12 refresh reinforcement for `/api/library/[id]/update`.
 *
 * Proves the R1 contract: client `authPost`'s update, first fetch returns
 * 401, interceptor calls refreshSession() once, retries with identical
 * bytes, retry succeeds. Asserts:
 *   - exactly one refreshSession() call (shared in-flight singleton)
 *   - 2 fetches: original 401 + single retry
 *   - the UPDATE fired exactly once on the retry only (row count = 1 —
 *     I11 preservation; no duplicate row)
 *   - retry body bytes === original body bytes (byte-for-byte replay)
 *   - `client_id` identical across both POSTs
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug 3 (library overhaul 2026-05-16) — route now imports
// `@/lib/storage/sign-thumbnail` which itself imports the `server-only`
// guard module. Stub it for the node test environment.
vi.mock('server-only', () => ({}));

const refreshSession = vi.fn(async () => ({ error: null }));
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({ auth: { refreshSession, signOut } }),
}));

function stubWindow() {
  (globalThis as unknown as { window: { location: { href: string } } }).window = {
    location: { href: '' },
  };
}
function unstubWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('F12 — /api/library/[id]/update refresh reinforcement', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ error: null });
    signOut.mockReset();
    vi.resetModules();
    stubWindow();
  });
  afterEach(() => {
    unstubWindow();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('401 → refresh → retry → exactly-once UPDATE, client_id preserved', async () => {
    const calls = { updateCount: 0, revalidatedCount: 0 };

    const updatedRow = {
      id: '11111111-1111-4111-8111-111111111111',
      client_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Pho Ga',
      normalized_name: 'pho ga',
      default_portion: 400,
      default_unit: 'g',
      nutrition: { kcal: 520, macros: { protein_g: 28, carbs_g: 50, fat_g: 18 } },
      thumbnail_url: null,
      log_count: 0,
      last_used_at: null,
      user_edited_flag: true,
      created_from: 'text',
      created_at: '2026-04-14T22:03:00Z',
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
                // E.CODEX B-H1 — pre-write read for cholesterol preserve-merge.
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
                          maybeSingle: async () => {
                            calls.updateCount += 1;
                            return { data: updatedRow, error: null };
                          },
                        }),
                      }),
                    }),
                  }),
                }),
              },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn(() => {
        calls.revalidatedCount += 1;
      }),
    }));

    const { POST } = await import('@/app/api/library/[id]/update/route');

    const realFetch = globalThis.fetch;
    let callCount = 0;
    const fetchSpy = vi.fn(async (input: unknown, init: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      const url =
        typeof input === 'string' && input.startsWith('/')
          ? `http://kalori.test${input}`
          : (input as string);
      const request = new Request(url, init as RequestInit);
      return POST(request, {
        params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
      });
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      // Task 4.2 round 1 C2 fix — nutrition must be fully merged (client
      // always sends the full post-edit shape, server writes it verbatim).
      const body = {
        client_id: '33333333-3333-4333-8333-333333333333',
        fields: {
          display_name: 'Pho Ga',
          nutrition: {
            kcal: 520,
            macros: { protein_g: 28, carbs_g: 50, fat_g: 18, fiber_g: 2, sugar_g: 1 },
          },
        },
      };
      const result = await authPost<{ item: typeof updatedRow }>(
        '/api/library/11111111-1111-4111-8111-111111111111/update',
        body,
      );
      expect(result.item.display_name).toBe('Pho Ga');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      // UPDATE handler ran exactly once — only the retry hit the DB.
      expect(calls.updateCount).toBe(1);
      expect(calls.revalidatedCount).toBe(1);

      // Retry body bytes === original body bytes (I11 byte-for-byte).
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(typeof body1).toBe('string');
      expect(body2).toBe(body1);
      // And client_id preserved across replay.
      const parsed1 = JSON.parse(String(body1)) as { client_id: string };
      const parsed2 = JSON.parse(String(body2)) as { client_id: string };
      expect(parsed1.client_id).toBe('33333333-3333-4333-8333-333333333333');
      expect(parsed2.client_id).toBe('33333333-3333-4333-8333-333333333333');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
