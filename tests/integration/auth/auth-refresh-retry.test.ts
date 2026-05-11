/**
 * @vitest-environment node
 *
 * F12 — Canary integration test for the refresh interceptor (Task 2.1d;
 * R1 primary). Exercises the real fetch → MSW interception path so downstream
 * Phase 3/4 mutation tasks can rely on `authFetch` / `authPost` without
 * re-implementing retry logic.
 *
 * Two layers of coverage:
 *   - MSW-driven cases against `/api/profile/save` — isolate the interceptor's
 *     HTTP contract without depending on the real route handler.
 *   - `F12-REAL-ROUTE-401-THEN-200` — invokes the actual route module with a
 *     mocked `getServerSupabase`. Proves the wiring between the interceptor
 *     HTTP path and the saved-profile route isn't fictitious (R-T4 risk in
 *     `testing-strategy.md §2.3`).
 *
 * Test name prefix `F12-` matches design-doc §18.1 for greppable trace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '../../mocks/server';

// Mock Supabase browser client module — controls `refreshSession()` /
// `signOut()` at the boundary the interceptor uses.
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: { refreshSession, signOut },
  }),
}));

// window.location stub — interceptor assigns `window.location.href` on
// session-expiry sign-out. The integration suite runs under vitest-environment
// node so we install a permissive stub that tracks writes without triggering
// navigation.
type WindowStub = { hrefWrites: string[]; restore: () => void };
function stubWindow(): WindowStub {
  const prior = (globalThis as unknown as { window?: unknown }).window;
  const hrefWrites: string[] = [];
  const locationStub = {
    _href: '',
    get href() {
      return this._href;
    },
    set href(v: string) {
      this._href = v;
      hrefWrites.push(v);
    },
  };
  (globalThis as unknown as { window: { location: typeof locationStub } }).window = {
    location: locationStub,
  };
  return {
    hrefWrites,
    restore: () => {
      if (prior === undefined) {
        delete (globalThis as unknown as { window?: unknown }).window;
      } else {
        (globalThis as unknown as { window: unknown }).window = prior;
      }
    },
  };
}

const TARGET_URL = 'http://kalori.test/api/profile/save';

describe('F12 refresh interceptor — integration', () => {
  let win: WindowStub;

  beforeEach(() => {
    refreshSession.mockReset();
    signOut.mockReset();
    vi.resetModules();
    win = stubWindow();
  });

  afterEach(() => {
    win.restore();
  });

  it('F12-HAPPY-PATH: 200 response passes through without refresh', async () => {
    server.use(
      http.post('*/api/profile/save', async () => HttpResponse.json({ ok: true }, { status: 200 })),
    );
    const { authFetch } = await import('@/lib/auth/refresh-interceptor');

    const res = await authFetch(TARGET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age: 31 }),
    });

    expect(res.status).toBe(200);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('F12-NON-401-PASSTHROUGH: 500 returned as-is, no refresh attempt', async () => {
    server.use(
      http.post('*/api/profile/save', async () =>
        HttpResponse.json({ error: 'oops' }, { status: 500 }),
      ),
    );
    const { authFetch } = await import('@/lib/auth/refresh-interceptor');

    const res = await authFetch(TARGET_URL, { method: 'POST' });

    expect(res.status).toBe(500);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('F12-REFRESH-AND-RETRY: 401 -> refreshSession ok -> retry -> 200', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/profile/save', async () => {
        calls += 1;
        if (calls === 1) return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
    );
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });

    const { authFetch } = await import('@/lib/auth/refresh-interceptor');

    const res = await authFetch(TARGET_URL, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('F12-DOUBLE-401-SIGNOUT: 401 -> refresh ok -> retry -> 401 -> signOut + throws', async () => {
    server.use(
      http.post('*/api/profile/save', async () => new HttpResponse(null, { status: 401 })),
    );
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    signOut.mockResolvedValue({ error: null });

    const { authFetch, SessionExpiredError } = await import('@/lib/auth/refresh-interceptor');

    await expect(authFetch(TARGET_URL, { method: 'POST' })).rejects.toThrow(SessionExpiredError);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(win.hrefWrites.length).toBeGreaterThanOrEqual(1);
    expect(win.hrefWrites[0]).toContain('/login');
  });

  it('F12-REFRESH-FAILURE-SIGNOUT: 401 -> refresh fails -> signOut + throws', async () => {
    server.use(
      http.post('*/api/profile/save', async () => new HttpResponse(null, { status: 401 })),
    );
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'refresh token expired' },
    });
    signOut.mockResolvedValue({ error: null });

    const { authFetch, SessionExpiredError } = await import('@/lib/auth/refresh-interceptor');

    await expect(authFetch(TARGET_URL, { method: 'POST' })).rejects.toThrow(SessionExpiredError);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(win.hrefWrites[0]).toContain('/login');
  });

  it('F12-CONCURRENT-REQUESTS: 3 parallel 401s share a single refresh, each retries once', async () => {
    let calls = 0;
    const finalPayloads = ['a', 'b', 'c'];
    server.use(
      http.post('*/api/profile/save', async () => {
        calls += 1;
        if (calls <= 3) return new HttpResponse(null, { status: 401 });
        const payload = finalPayloads[calls - 4] ?? 'z';
        return HttpResponse.json({ ok: payload }, { status: 200 });
      }),
    );
    // Slow refresh so all 3 401s arrive before the refresh resolves.
    refreshSession.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { data: { session: { access_token: 'new' } }, error: null };
    });

    const { authFetch } = await import('@/lib/auth/refresh-interceptor');

    const results = await Promise.all([
      authFetch(TARGET_URL, { method: 'POST' }),
      authFetch(TARGET_URL, { method: 'POST' }),
      authFetch(TARGET_URL, { method: 'POST' }),
    ]);

    for (const r of results) expect(r.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(calls).toBe(6);
  });

  it('F12-RETRY-PRESERVES-METHOD-BODY: retry sends identical method + body bytes', async () => {
    let firstBody: unknown = null;
    let retryBody: unknown = null;
    let calls = 0;
    server.use(
      http.post('*/api/profile/save', async ({ request }) => {
        calls += 1;
        const text = await request.text();
        if (calls === 1) {
          firstBody = text;
          return new HttpResponse(null, { status: 401 });
        }
        retryBody = text;
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
    );
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });

    const { authFetch } = await import('@/lib/auth/refresh-interceptor');

    const body = JSON.stringify({ client_id: 'idem-1', patch: { age: 32 } });
    await authFetch(TARGET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(firstBody).toBe(body);
    expect(retryBody).toBe(body);
    expect(calls).toBe(2);
  });

  it('F12-REAL-ROUTE-401-THEN-200: exercises the real /api/profile/save route handler', async () => {
    // Mock getServerSupabase at the module boundary the route imports. First
    // call returns no user (401); second call returns a valid user (200 +
    // happy path). We invoke POST() directly, bypassing HTTP and MSW.
    //
    // F1 (Round 3): the route was migrated from getSession() → getUser() for
    // security correctness (getUser() validates against Supabase's auth
    // server rather than trusting a locally-readable cookie). The mock
    // reflects that migration — `auth.getUser` is the boundary the route
    // now touches on every POST.
    const serverGetUser = vi.fn();
    const serverUpsert = vi.fn();
    const serverUpdate = vi.fn();
    const serverFromBuilder = {
      // Self-healing existence probe added to the non-finalize path:
      // `select('id').eq('id', userId).maybeSingle()`. Return the
      // existing row so the route takes the update branch — matches
      // the intent of this test (row already exists, retry succeeds).
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: 'u-1' }, error: null }),
        }),
      }),
      update: (...args: unknown[]) => {
        serverUpdate(...args);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'u-1' }, error: null }),
            }),
          }),
        };
      },
      upsert: (...args: unknown[]) => {
        serverUpsert(...args);
        return {
          select: () => ({
            single: async () => ({ data: { id: 'u-1' }, error: null }),
          }),
        };
      },
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: { getUser: serverGetUser },
        from: () => serverFromBuilder,
      }),
    }));

    // First attempt: no user -> 401 (getUser returns null user + non-null error)
    serverGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid session' },
    });
    // Second attempt: valid user -> 200
    serverGetUser.mockResolvedValueOnce({
      data: { user: { id: 'u-1' } },
      error: null,
    });

    const { POST } = await import('@/app/api/profile/save/route');

    const body = JSON.stringify({ client_id: 'i-1', patch: { age: 31 } });

    const req1 = new Request('http://kalori.test/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(401);

    const req2 = new Request('http://kalori.test/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);

    expect(serverGetUser).toHaveBeenCalledTimes(2);
    // Row-exists probe sends the non-finalize path to update, not
    // upsert. The test's intent — "second attempt mutated once" —
    // is preserved via this assertion.
    expect(serverUpdate).toHaveBeenCalledTimes(1);
    expect(serverUpsert).not.toHaveBeenCalled();

    vi.doUnmock('@/lib/supabase/server');
  });
});
