/**
 * @vitest-environment node
 *
 * Unit tests for the F12 refresh interceptor (Task 2.1d; R1 primary).
 *
 * These tests isolate `authFetch` from the network by stubbing the global
 * `fetch` and the `@/lib/supabase/client` module directly. MSW is NOT used
 * here; these cases validate the control flow of the interceptor itself
 * (retry once, dedup concurrent refreshes, method/body preservation,
 * non-401 passthrough, double-401 sign-out). End-to-end HTTP-layer wiring
 * is exercised in `tests/integration/auth/auth-refresh-retry.test.ts`.
 *
 * Test naming prefix `F12-` so the suite greps cleanly against design-doc
 * §18.1 F12.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: {
      refreshSession,
      signOut,
    },
  }),
}));

type FetchMock = ReturnType<typeof vi.fn>;

/**
 * Assigns `global.fetch` to a fresh vi.fn returning the given queued responses
 * in order. Out-of-order / extra calls throw so we catch unexpected retries.
 */
function mockFetchSequence(responses: Array<Response | Error>): FetchMock {
  const queue = [...responses];
  const spy = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error('F12 test: unexpected extra fetch() call');
    }
    if (next instanceof Error) throw next;
    return next;
  });
  (globalThis as { fetch: typeof fetch }).fetch = spy as unknown as typeof fetch;
  return spy;
}

function mkResponse(status: number, body?: unknown): Response {
  const init: ResponseInit = { status };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Response(body === undefined ? null : JSON.stringify(body), init);
}

// window.location stub — the sign-out path assigns window.location.href when
// the refresh fails or a second 401 arrives. In the vitest-environment node
// block there is no window by default; we install a stub the interceptor can
// safely write into.
function stubWindow(): { hrefWrites: string[] } {
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
  return { hrefWrites };
}

function unstubWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe('authFetch (F12 refresh interceptor)', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    signOut.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    unstubWindow();
  });

  it('F12-HAPPY-PATH: 200 response passes through without refresh attempt', async () => {
    const fetchSpy = mockFetchSequence([mkResponse(200, { ok: true })]);
    const { authFetch } = await import('./refresh-interceptor');

    const res = await authFetch('http://host.test/api/profile/save', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('F12-NON-401-PASSTHROUGH: non-401 error (500) returned as-is, no refresh', async () => {
    const fetchSpy = mockFetchSequence([mkResponse(500, { error: 'oops' })]);
    const { authFetch } = await import('./refresh-interceptor');

    const res = await authFetch('http://host.test/api/profile/save');

    expect(res.status).toBe(500);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('F12-REFRESH-AND-RETRY: 401 -> refresh ok -> retry -> 200', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    const fetchSpy = mockFetchSequence([mkResponse(401), mkResponse(200, { ok: true })]);
    const { authFetch } = await import('./refresh-interceptor');

    const res = await authFetch('http://host.test/api/profile/save', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    expect(res.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('F12-DOUBLE-401-SIGNOUT: 401 -> refresh ok -> retry -> 401 -> signOut + throws', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    signOut.mockResolvedValue({ error: null });
    const fetchSpy = mockFetchSequence([
      mkResponse(401),
      mkResponse(401),
      // Post-signOut redirect path posts to /api/auth/sign-out; we surface a
      // 200 for that optional plumbing call. The interceptor's contract does
      // NOT require the sign-out HTTP call because supabase.auth.signOut()
      // already invalidates the server session; keeping the queue finite and
      // having authFetch NOT make an extra call is the expected shape.
    ]);
    const { hrefWrites } = stubWindow();
    const { authFetch, SessionExpiredError } = await import('./refresh-interceptor');

    await expect(
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
    ).rejects.toThrow(SessionExpiredError);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(hrefWrites.length).toBeGreaterThanOrEqual(1);
    expect(hrefWrites[0]).toContain('/login');
  });

  it('F12-REFRESH-FAILURE-SIGNOUT: 401 -> refresh throws -> signOut + throws', async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });
    signOut.mockResolvedValue({ error: null });
    const fetchSpy = mockFetchSequence([mkResponse(401)]);
    const { hrefWrites } = stubWindow();
    const { authFetch, SessionExpiredError } = await import('./refresh-interceptor');

    await expect(
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
    ).rejects.toThrow(SessionExpiredError);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    // Original request + NO retry (refresh failed)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(hrefWrites.length).toBeGreaterThanOrEqual(1);
    expect(hrefWrites[0]).toContain('/login');
  });

  it('F12-REFRESH-THROWS-SIGNOUT: 401 -> refresh throws outright -> signOut + throws', async () => {
    refreshSession.mockRejectedValue(new Error('network down'));
    signOut.mockResolvedValue({ error: null });
    mockFetchSequence([mkResponse(401)]);
    stubWindow();
    const { authFetch, SessionExpiredError } = await import('./refresh-interceptor');

    await expect(
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
    ).rejects.toThrow(SessionExpiredError);

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('F12-CONCURRENT-REQUESTS: 3 parallel 401s -> single refresh, 3 retries', async () => {
    refreshSession.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { data: { session: { access_token: 'new' } }, error: null };
    });
    const fetchSpy = mockFetchSequence([
      mkResponse(401),
      mkResponse(401),
      mkResponse(401),
      mkResponse(200, { ok: 'a' }),
      mkResponse(200, { ok: 'b' }),
      mkResponse(200, { ok: 'c' }),
    ]);
    const { authFetch } = await import('./refresh-interceptor');

    const results = await Promise.all([
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
      authFetch('http://host.test/api/profile/save', { method: 'POST' }),
    ]);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('F12-RETRY-PRESERVES-METHOD-BODY: POST+body retried as POST with same body', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    const fetchSpy = mockFetchSequence([mkResponse(401), mkResponse(200, { ok: true })]);
    const { authFetch } = await import('./refresh-interceptor');

    const body = JSON.stringify({ client_id: 'abc', patch: { age: 31 } });
    await authFetch('http://host.test/api/profile/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const [firstCall, retryCall] = fetchSpy.mock.calls;
    expect(firstCall?.[0]).toBe('http://host.test/api/profile/save');
    expect(firstCall?.[1]?.method).toBe('POST');
    expect(firstCall?.[1]?.body).toBe(body);
    expect(retryCall?.[0]).toBe('http://host.test/api/profile/save');
    expect(retryCall?.[1]?.method).toBe('POST');
    expect(retryCall?.[1]?.body).toBe(body);
  });

  it('F12-AUTHPOST: convenience wrapper JSON-serializes + returns parsed body', async () => {
    const fetchSpy = mockFetchSequence([mkResponse(200, { ok: true, id: 'x' })]);
    const { authPost } = await import('./refresh-interceptor');

    const result = await authPost<{ ok: boolean; id: string }>(
      'http://host.test/api/profile/save',
      {
        client_id: 'c1',
        age: 31,
      },
    );

    expect(result).toEqual({ ok: true, id: 'x' });
    const call = fetchSpy.mock.calls[0];
    expect(call?.[1]?.method).toBe('POST');
    expect(typeof call?.[1]?.body).toBe('string');
    const sent = JSON.parse(call?.[1]?.body as string) as Record<string, unknown>;
    expect(sent).toEqual({ client_id: 'c1', age: 31 });
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers?.['Content-Type']).toBe('application/json');
  });

  it('SessionExpiredError is a distinct error class with stable name/message', async () => {
    const { SessionExpiredError } = await import('./refresh-interceptor');
    const err = new SessionExpiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(err.name).toBe('SessionExpiredError');
    expect(err.message).toMatch(/session expired/i);
  });
});
