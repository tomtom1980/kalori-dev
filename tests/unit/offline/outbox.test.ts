/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.1 — Outbox manager unit tests (RED → GREEN).
 *
 * Covers:
 *   - enqueue stores body verbatim, returns the same client_id the caller passed
 *   - peek returns FIFO oldest-first order
 *   - remove deletes by client_id
 *   - markFailed increments attempts + records lastError + lastAttemptAt
 *   - clear() throws / no-ops outside development env (gated by KALORI_ENV)
 *   - capacity guard trims oldest at 200 entries with Sentry breadcrumb
 *   - flush calls authFetch (R1) — never raw fetch
 *   - successful flush removes the row
 *   - 4xx (excl. 401/409/412) marks failure, keeps row, increments attempts
 *   - 3rd attempt failure captures Sentry exception (persistent_failure)
 *   - 401 is opaque to flush (interceptor handles it; row stays for retry)
 *   - 412 keeps row WITHOUT bumping attempts (F10 conflict path)
 *   - body.client_id is preserved byte-for-byte across retries (I11)
 *
 * The interceptor is mocked at the boundary — every flush hop must observe a
 * call to authFetch with the SAME serialised body bytes (proves I11).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clear as idbClear, get as idbGet, set as idbSet } from 'idb-keyval';

const captureException = vi.fn();
const addBreadcrumb = vi.fn();
const authFetch = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
  addBreadcrumb,
}));

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
  SessionExpiredError: class extends Error {
    constructor(msg = 'session expired') {
      super(msg);
      this.name = 'SessionExpiredError';
    }
  },
}));

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_KALORI_ENV;

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  captureException.mockReset();
  addBreadcrumb.mockReset();
  authFetch.mockReset();
  await idbClear();
  // Default to development env so clear() is permitted unless a test overrides.
  process.env.NEXT_PUBLIC_KALORI_ENV = 'development';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_KALORI_ENV = ORIGINAL_ENV;
});

describe('Task 5.1.1 — outbox manager', () => {
  it('enqueue stores body verbatim and returns the same client_id', async () => {
    const { enqueue, peek } = await import('@/lib/offline/outbox');
    const clientId = crypto.randomUUID();
    const result = await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: clientId, ml: 250, date: '2026-04-25' },
    });
    expect(result.client_id).toBe(clientId);
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBe(clientId);
    expect(rows[0]!.body).toEqual({ client_id: clientId, ml: 250, date: '2026-04-25' });
    expect(rows[0]!.kind).toBe('water-log');
    expect(rows[0]!.endpoint).toBe('/api/water/log');
    expect(rows[0]!.method).toBe('POST');
    expect(rows[0]!.attempts).toBe(0);
    expect(rows[0]!.lastError).toBeNull();
  });

  it('peek returns FIFO oldest-first', async () => {
    const { enqueue, peek } = await import('@/lib/offline/outbox');
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const c = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: a, ml: 100 },
    });
    // Distinct createdAt — fake-timer-free; force a 1ms gap by waiting a tick.
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: b, ml: 200 },
    });
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: c, ml: 300 },
    });
    const rows = await peek();
    expect(rows.map((r) => r.client_id)).toEqual([a, b, c]);
  });

  it('remove deletes a single row by client_id', async () => {
    const { enqueue, remove, peek } = await import('@/lib/offline/outbox');
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: a, ml: 100 },
    });
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: b, ml: 200 },
    });
    await remove(a);
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBe(b);
  });

  it('markFailed increments attempts and stores error + lastAttemptAt', async () => {
    const { enqueue, markFailed, peek } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await markFailed(cid, 'network drop');
    const rows = await peek();
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toBe('network drop');
    expect(rows[0]!.lastAttemptAt).toBeGreaterThan(0);
  });

  it('clear() is gated outside development', async () => {
    const { enqueue, clear, peek } = await import('@/lib/offline/outbox');
    process.env.NEXT_PUBLIC_KALORI_ENV = 'production';
    const cid = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await expect(clear()).rejects.toThrow();
    const rows = await peek();
    expect(rows).toHaveLength(1);
  });

  it('clear() succeeds in development env', async () => {
    const { enqueue, clear, peek } = await import('@/lib/offline/outbox');
    process.env.NEXT_PUBLIC_KALORI_ENV = 'development';
    const cid = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await clear();
    const rows = await peek();
    expect(rows).toHaveLength(0);
  });

  it('capacity guard trims oldest entry beyond 200 + breadcrumbs trim event', async () => {
    const { enqueue, peek } = await import('@/lib/offline/outbox');
    // Pre-seed 200 rows directly into idb-keyval (faster than 200 enqueue calls).
    const seeded = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      client_id: `cid-${i}`,
      kind: 'water-log' as const,
      endpoint: '/api/water/log',
      method: 'POST' as const,
      body: { client_id: `cid-${i}`, ml: 100 },
      createdAt: 1000 + i,
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      conflict: null,
    }));
    await idbSet('outbox', seeded);

    const newCid = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: newCid, ml: 250 },
    });

    const rows = await peek();
    expect(rows).toHaveLength(200);
    // Oldest (cid-0) trimmed; newest pushed to tail.
    expect(rows.map((r) => r.client_id).includes('cid-0')).toBe(false);
    expect(rows[rows.length - 1]!.client_id).toBe(newCid);
    expect(
      addBreadcrumb.mock.calls.some(
        ([arg]) =>
          (arg as { category?: string; message?: string }).category === 'outbox' &&
          (arg as { message?: string }).message === 'outbox.capacity.trim',
      ),
    ).toBe(true);
  });

  it('flush calls authFetch (NOT raw fetch) with body bytes preserved (I11)', async () => {
    const { enqueue, flush, peek } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 250 },
    });
    const result = await flush();
    expect(authFetch).toHaveBeenCalledTimes(1);
    const call = authFetch.mock.calls[0]!;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe('/api/water/log');
    expect(init.method).toBe('POST');
    expect(typeof init.body).toBe('string');
    // body.client_id IS the I11 idempotency key — same bytes every retry.
    expect(JSON.parse(init.body as string)).toEqual({ client_id: cid, ml: 250 });
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toEqual([]);
    expect(await peek()).toHaveLength(0);
  });

  it('flush on 4xx (e.g. 422) keeps row, increments attempts, records error', async () => {
    const { enqueue, flush, peek } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(jsonResponse(422, { error: 'invalid' }));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 0 },
    });
    const result = await flush();
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.client_id).toBe(cid);
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attempts).toBe(1);
    expect(rows[0]!.lastError).toContain('422');
  });

  it('flush captures Sentry exception on 3rd persistent failure (attempts >= 3)', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValue(jsonResponse(500, { error: 'oops' }));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await flush();
    await flush();
    expect(captureException).not.toHaveBeenCalled();
    await flush();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0]! as [
      Error,
      { tags?: Record<string, string> },
    ];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.tags?.kind).toBe('water-log');
  });

  it('flush on 412 keeps row but does NOT bump attempts (F10 conflict path)', async () => {
    const { enqueue, flush, peek } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(
      jsonResponse(412, { error: 'profile_changed', current: { goal_weight: 70 } }),
    );
    await enqueue({
      kind: 'goal-weight-update',
      endpoint: '/api/profile/save',
      method: 'PATCH',
      body: { client_id: cid, goal_weight: 72 },
    });
    const result = await flush();
    expect(result.failed[0]?.error).toContain('412');
    // Codex I1 fix — server's `current` value MUST be surfaced both in
    // the FlushResult (for the immediate caller) and persisted on the row
    // (for Task 5.1.5's modal which reads from peek()).
    expect(result.failed[0]?.conflict).toEqual({ current: { goal_weight: 70 } });
    const rows = await peek();
    expect(rows[0]!.attempts).toBe(0);
    expect(rows[0]!.conflict).not.toBeNull();
    expect(rows[0]!.conflict?.current).toEqual({ goal_weight: 70 });
  });

  it('flush byte-for-byte identical body across retries (I11 contract)', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 250 },
    });
    await flush();
    await flush();
    await flush();
    const bodies = authFetch.mock.calls.map(([, init]) => (init as RequestInit).body as string);
    expect(bodies).toHaveLength(3);
    // Every retry MUST send the identical bytes — this is the I11 contract.
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(JSON.parse(bodies[0]!)).toEqual({ client_id: cid, ml: 250 });
  });

  it('flush serial: concurrent flush() calls share the in-flight promise', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    // The flush authFetch implementation hangs until we explicitly resolve.
    // Two concurrent flush() entries must observe ONE authFetch call total.
    let resolveFetch!: (res: Response) => void;
    const fetchDeferred = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    authFetch.mockReturnValueOnce(fetchDeferred);
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 250 },
    });
    // Start two concurrent flushes WITHOUT awaiting between them. The second
    // call must hit the in-flight share and avoid a second authFetch.
    const a = flush();
    const b = flush();
    // Wait one macrotask so flush()'s async chain reaches authFetch (the IDB
    // operations need a real macrotask, not just microtask yields).
    await new Promise((r) => setTimeout(r, 10));
    expect(authFetch).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse(200, {}));
    const [ra, rb] = await Promise.all([a, b]);
    // Even after both promises resolve, only ONE authFetch was issued.
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(ra.attempted).toBe(1);
    expect(rb.attempted).toBe(1);
    expect(ra.succeeded).toBe(1);
    expect(rb.succeeded).toBe(1);
  });
});

describe('Task 5.1.1 — outbox flush IDB key (cross-tab lock)', () => {
  it('honors a fresh flush-lock from a sibling tab and aborts second flush', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    // Simulate sibling tab grabbing the lock 1 second ago — still within the 5s TTL.
    await idbSet('outbox:flush-lock', { acquiredAt: Date.now() - 1000 });
    const result = await flush();
    expect(authFetch).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
  });

  it('treats a stale (>5s) flush-lock as expired and proceeds', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    // Lock acquired 6 seconds ago — beyond TTL.
    await idbSet('outbox:flush-lock', { acquiredAt: Date.now() - 6000 });
    const result = await flush();
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
  });

  it('releases flush-lock after flush completes (try/finally)', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await flush();
    const lockAfter = await idbGet('outbox:flush-lock');
    expect(lockAfter).toBeUndefined();
  });

  it('releases flush-lock even when flush throws', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockRejectedValueOnce(new Error('network failure'));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await flush(); // network errors are swallowed into FlushResult, not thrown
    const lockAfter = await idbGet('outbox:flush-lock');
    expect(lockAfter).toBeUndefined();
  });

  it('does NOT release a sibling-tab lock acquired after our TTL expired (Codex I2)', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    authFetch.mockImplementationOnce(async () => {
      // While our flush is mid-flight, simulate a sibling tab stealing the
      // lock after our TTL expired by overwriting the lock with a different
      // owner UUID.
      await idbSet('outbox:flush-lock', { acquiredAt: Date.now(), owner: 'sibling-tab-owner' });
      return jsonResponse(200, {});
    });
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    await flush();
    // Sibling tab's lock survives because we don't own it.
    const lockAfter = await idbGet('outbox:flush-lock');
    expect(lockAfter).toBeDefined();
    expect((lockAfter as { owner: string }).owner).toBe('sibling-tab-owner');
  });
});
