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

  // ───────────────────────────────────────────────────────────────────────
  // Task D.2 (US-STAB-D2) — AC3 — refresh interceptor handles the new
  // canonical 401 envelope without any interceptor-code change.
  //
  // Detection in this module is status-code-only (`firstResponse.status !==
  // 401`), so the new shape (status 401 + Content-Type: application/json +
  // body `{error:'unauthenticated'}` + `WWW-Authenticate: Bearer
  // realm="kalori"`) still trips the refresh path. This test pins the
  // behaviour so the R1 invariant cannot regress as the 401 body shape
  // evolves elsewhere.
  // ───────────────────────────────────────────────────────────────────────
  it('F12-handles-new-401-shape: status 401 + JSON {error:unauthenticated} still triggers refresh + retry', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    // First response: the new canonical JSON 401. Second response: 200.
    const newShapeUnauth = new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="kalori"',
      },
    });
    const fetchSpy = mockFetchSequence([newShapeUnauth, mkResponse(200, { ok: true })]);
    const { authFetch } = await import('./refresh-interceptor');

    const res = await authFetch('http://host.test/api/water/log', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    expect(res.status).toBe(200);
    // R1 invariant: detection by status only — body/headers MUST NOT be
    // pattern-matched. Confirms the refresh path STILL fires for the new
    // shape (AC3) without modifying interceptor production code.
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('F12-handles-new-401-shape-double-401: second new-shape 401 → signOut + throws', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    signOut.mockResolvedValue({ error: null });
    const headers = {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="kalori"',
    };
    const firstResponse = new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers,
    });
    const retryResponse = new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers,
    });
    const fetchSpy = mockFetchSequence([firstResponse, retryResponse]);
    const { hrefWrites } = stubWindow();
    const { authFetch, SessionExpiredError } = await import('./refresh-interceptor');

    await expect(authFetch('http://host.test/api/water/log', { method: 'POST' })).rejects.toThrow(
      SessionExpiredError,
    );

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(hrefWrites[0]).toContain('/login');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task E.1.1 — F-CODEX-D-R2-03 / F-CODEX-D-R3-01 — `authPost` error-body
// propagation. Prior contract discarded the JSON response body on non-2xx
// (`throw new Error('authPost ${url} failed: ${status}')`), making the new
// `409 restore_name_conflict` payload from `app/api/library/bulk-delete/undo`
// invisible to UI callers. New contract: throw `AuthApiError` (subclass of
// Error) carrying `status: number` and `body: unknown`, with the SAME
// message string so existing regex consumers
// (`lib/log-flow/classify-error.ts`, FoodDetail Log-Now retry classifier)
// continue to work unchanged.
// ─────────────────────────────────────────────────────────────────────────────
describe('authPost error-body propagation (F-CODEX-D-R2-03)', () => {
  beforeEach(() => {
    refreshSession.mockReset();
    signOut.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    unstubWindow();
  });

  it('RED-1: AuthApiError preserves 409 restore_name_conflict body for bulk-delete undo callers', async () => {
    const conflictBody = {
      error: 'restore_name_conflict',
      conflicts: [{ client_id: 'abc', normalized_name: 'pho bo', existing_id: 'def' }],
    };
    mockFetchSequence([
      new Response(JSON.stringify(conflictBody), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);
    const { authPost, AuthApiError } = await import('./refresh-interceptor');

    let caught: unknown;
    try {
      await authPost('/api/library/bulk-delete/undo', { client_ids: ['abc'] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthApiError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as InstanceType<typeof AuthApiError>;
    expect(err.status).toBe(409);
    expect(err.body).toEqual(conflictBody);
    // Back-compat: the message string format must remain the same so
    // `lib/log-flow/classify-error.ts` and FoodDetail Log-Now's
    // /failed:\s*(\d+)/ regex still match.
    expect(err.message).toMatch(/failed:\s*409/);
  });

  it('RED-2: AuthApiError preserves non-JSON body as raw text (no-body / opaque-body case)', async () => {
    mockFetchSequence([
      new Response('plain text 503 from gateway', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    ]);
    const { authPost, AuthApiError } = await import('./refresh-interceptor');

    let caught: unknown;
    try {
      await authPost('/api/library/bulk-delete/undo', { client_ids: ['abc'] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthApiError);
    const err = caught as InstanceType<typeof AuthApiError>;
    expect(err.status).toBe(503);
    // Non-JSON: body should be the raw text string (best-effort) or null.
    // The important invariant is the caller can still inspect `.status` to
    // distinguish retryable 5xx from 4xx without parsing err.message.
    expect(err.body === null || typeof err.body === 'string').toBe(true);
    expect(err.message).toMatch(/failed:\s*503/);
  });

  it('RED-3: AuthApiError preserves 2xx happy path response body verbatim', async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ restored_count: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);
    const { authPost } = await import('./refresh-interceptor');

    const result = await authPost<{ restored_count: number }>('/api/library/bulk-delete/undo', {
      client_ids: ['abc'],
    });

    expect(result).toEqual({ restored_count: 1 });
  });

  it('RED-4: AuthApiError instances have stable name/prototype chain for instanceof checks', async () => {
    const { AuthApiError } = await import('./refresh-interceptor');
    const err = new AuthApiError('test message', 409, { error: 'foo' });

    expect(err).toBeInstanceOf(AuthApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthApiError');
    expect(err.status).toBe(409);
    expect(err.body).toEqual({ error: 'foo' });
    expect(err.message).toBe('test message');
  });
});
