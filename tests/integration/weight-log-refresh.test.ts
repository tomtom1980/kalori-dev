/**
 * @vitest-environment node
 *
 * Task 4.3b — F12 refresh interceptor reinforcement for /api/weight/log.
 *
 * Proves:
 *   1. First POST attempt → 401
 *   2. Interceptor shares a single refreshSession call
 *   3. Retry with IDENTICAL bytes (client_id preserved) → server insert succeeds
 *   4. Auto-recalc fires EXACTLY ONCE across original + retry (the retry
 *      happens after a successful refresh, so the server only sees one
 *      incoming request; but crucially the replay path does NOT re-fire
 *      recalc).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshSession = vi.fn(async () => ({ error: null }));
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: { refreshSession, signOut },
  }),
}));

function stubWindow() {
  (globalThis as unknown as { window: { location: { href: string } } }).window = {
    location: { href: '' },
  };
}
function unstubWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('F12 — /api/weight/log refresh reinforcement', () => {
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

  it('401 → refresh → retry preserves client_id → single insert + recalc fires once', async () => {
    const calls = {
      insertCount: 0,
      profileUpdateCount: 0,
      revalidatedTags: [] as string[],
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-refresh' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'weight_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
              insert: (payload: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => {
                    calls.insertCount += 1;
                    return {
                      data: { id: 'w-refresh', ...payload },
                      error: null,
                    };
                  },
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      target_mode: 'auto',
                      current_weight_kg: 70,
                      recalc_threshold_pct: 2.0,
                      bio_sex: 'other',
                      age: 30,
                      height_cm: 170,
                      activity_level: 'moderate',
                      goal_weight_kg: 65,
                      goal_pace: 'moderate',
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => {
                  calls.profileUpdateCount += 1;
                  return { error: null };
                },
              }),
            };
          }
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn((tag: string) => {
        calls.revalidatedTags.push(tag);
      }),
    }));

    const { POST } = await import('@/app/api/weight/log/route');
    const realFetch = globalThis.fetch;
    let callCount = 0;
    const fetchSpy = vi.fn(async (input: unknown, init: unknown) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
        });
      }
      const url =
        typeof input === 'string' && input.startsWith('/')
          ? `http://kalori.test${input}`
          : (input as string);
      return POST(new Request(url, init as RequestInit));
    });
    globalThis.fetch = fetchSpy as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      const body = {
        client_id: '44444444-4444-4444-8444-444444444444',
        date: new Date().toISOString().slice(0, 10),
        weight_kg: 72.5,
      };
      const result = await authPost<{ row: { id: string }; recalc?: { newTarget: number } }>(
        '/api/weight/log',
        body,
      );
      expect(result.row.id).toBe('w-refresh');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(refreshSession).toHaveBeenCalledTimes(1);

      // Server saw exactly one successful insert (retry hit the real handler).
      expect(calls.insertCount).toBe(1);
      // Recalc path fired exactly once (not doubled).
      expect(calls.profileUpdateCount).toBe(1);

      // Byte-identical retry: client_id + payload preserved across both calls.
      const [, initCall1] = fetchSpy.mock.calls[0] ?? [];
      const [, initCall2] = fetchSpy.mock.calls[1] ?? [];
      const body1 = (initCall1 as RequestInit | undefined)?.body;
      const body2 = (initCall2 as RequestInit | undefined)?.body;
      expect(body2).toBe(body1);
      const parsed = JSON.parse(String(body1)) as Record<string, unknown>;
      expect(parsed.client_id).toBe(body.client_id);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
