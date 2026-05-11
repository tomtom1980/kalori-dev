/**
 * @vitest-environment node
 *
 * Task 3.3 R1 — log flow thumbnail POST forced-401 refresh reinforcement.
 * Targets `/api/storage/thumbnail` — the new Task 3.3 route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('R1 — log-flow thumbnail refresh reinforcement', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ error: null });
    signOut.mockReset();
    vi.resetModules();
    stubWindow();
  });

  afterEach(() => {
    unstubWindow();
  });

  it('forced-401 on thumbnail POST → refresh once → retry lands 200', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
            error: null,
          }),
        },
        // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
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
          throw new Error(`unknown table: ${table}`);
        },
        storage: {
          from: () => ({
            upload: async () => ({ data: { path: 'x' }, error: null }),
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://signed.test/abc' },
              error: null,
            }),
          }),
        },
      }),
    }));

    const { POST } = await import('@/app/api/storage/thumbnail/route');
    const realFetch = globalThis.fetch;
    const ROUTE_PATH = '/api/storage/thumbnail';
    let routeCallCount = 0;
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (!url.includes(ROUTE_PATH)) return realFetch(input as RequestInfo, init);
        routeCallCount += 1;
        if (routeCallCount === 1) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const req = new Request(String(input), init);
        return POST(req);
      },
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;

    try {
      const { authPost } = await import('@/lib/auth/refresh-interceptor');
      // C2: route now sniffs magic bytes — fixture must start with a
      // real JPEG signature (FF D8 FF) to pass the whitelist.
      const jpegMagic = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const smallB64 = Buffer.from(jpegMagic).toString('base64');
      const res = await authPost<{ path: string; signedUrl: string; expiresAt: string }>(
        'http://kalori.test/api/storage/thumbnail',
        {
          client_id: '11111111-1111-4111-8111-111111111111',
          imageBase64: smallB64,
          mimeType: 'image/jpeg',
        },
      );
      expect(refreshSession).toHaveBeenCalledTimes(1);
      const routeFetches = fetchSpy.mock.calls.filter((c) =>
        String((c as unknown as [unknown])[0]).includes(ROUTE_PATH),
      );
      expect(routeFetches.length).toBe(2);
      expect(res.signedUrl).toContain('signed.test');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
    }
  });
});
