/**
 * @vitest-environment happy-dom
 *
 * F-OFFLINE-5.1.1-FATAL-DRIFT-ROW-SHAPE — Zod row validator on
 * `readOutbox()` with de-duplicated `outbox.fatal_drift` Sentry capture.
 *
 * Read-path validator: drifted rows (missing `client_id`, wrong `kind` enum,
 * wrong `body` type, etc.) are silently filtered out so the rest of the
 * outbox keeps flushing, while ONE Sentry exception per unique drift
 * signature is captured per `readOutbox()` invocation. The write path
 * (`enqueue`, `flush`) is untouched.
 *
 * The test suite reaches into IDB directly via `idb-keyval` so it can plant
 * malformed rows that the public outbox API would reject — this is the only
 * way to simulate post-deploy schema drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clear as idbClear, get as idbKvGet, set as idbKvSet } from 'idb-keyval';

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

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-1',
    client_id: 'cid-1',
    kind: 'water-log',
    endpoint: '/api/water/log',
    method: 'POST',
    body: { client_id: 'cid-1', ml: 250, date: '2026-04-25' },
    createdAt: 1_700_000_000_000,
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    conflict: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  captureException.mockReset();
  addBreadcrumb.mockReset();
  authFetch.mockReset();
  await idbClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('F-OFFLINE-5.1.1 — readOutbox Zod row validator', () => {
  it('returns rows that pass the schema', async () => {
    // AC: readOutbox returns rows that pass the schema
    await idbKvSet('outbox', [validRow({ id: 'a', client_id: 'cid-a' })]);
    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.client_id).toBe('cid-a');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('filters out rows missing client_id', async () => {
    // AC: readOutbox filters out rows missing client_id
    const good = validRow({ id: 'good', client_id: 'cid-good' });
    const bad = validRow({ id: 'bad' });
    delete (bad as Record<string, unknown>).client_id;
    await idbKvSet('outbox', [good, bad]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('good');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('filters out rows with wrong kind enum value', async () => {
    // AC: readOutbox filters out rows with wrong kind enum
    const good = validRow({ id: 'good', client_id: 'cid-good' });
    const bad = validRow({ id: 'bad', client_id: 'cid-bad', kind: 'not-a-real-kind' });
    await idbKvSet('outbox', [good, bad]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('good');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('filters out rows where body is not an object', async () => {
    // AC: readOutbox filters out rows with wrong body type
    const good = validRow({ id: 'good', client_id: 'cid-good' });
    const bad = validRow({ id: 'bad', client_id: 'cid-bad', body: 'not-an-object' });
    await idbKvSet('outbox', [good, bad]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('good');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('filters out rows where body is missing client_id', async () => {
    // AC: readOutbox filters out rows whose body lacks I11 idempotency key
    const good = validRow({ id: 'good', client_id: 'cid-good' });
    const bad = validRow({ id: 'bad', client_id: 'cid-bad', body: { ml: 250 } });
    await idbKvSet('outbox', [good, bad]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('good');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('captures Sentry exception ONCE per drift signature, not per row', async () => {
    // AC: readOutbox calls Sentry capture once per drift signature, not per row
    const good = validRow({ id: 'g1', client_id: 'cg1' });
    // Three drifted rows that all share the SAME failure (missing client_id) —
    // so they share one signature → ONE Sentry capture, not three.
    const bad1 = validRow({ id: 'b1' });
    delete (bad1 as Record<string, unknown>).client_id;
    const bad2 = validRow({ id: 'b2' });
    delete (bad2 as Record<string, unknown>).client_id;
    const bad3 = validRow({ id: 'b3' });
    delete (bad3 as Record<string, unknown>).client_id;
    await idbKvSet('outbox', [good, bad1, bad2, bad3]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    // Sentry context must include the drift count so observability is preserved
    // even though only one capture fires.
    const call = captureException.mock.calls[0];
    expect(call).toBeDefined();
    const context = call?.[1];
    expect(context).toBeDefined();
    expect(context?.extra?.count).toBe(3);
    expect(typeof context?.extra?.signature).toBe('string');
  });

  it('captures distinct Sentry exceptions per unique drift signature', async () => {
    // AC: complementary case — different signatures get separate captures
    const good = validRow({ id: 'good', client_id: 'cid-good' });
    const missingClientId = validRow({ id: 'b1' });
    delete (missingClientId as Record<string, unknown>).client_id;
    const wrongKind = validRow({ id: 'b2', client_id: 'cid-b2', kind: 'no-such-kind' });
    await idbKvSet('outbox', [good, missingClientId, wrongKind]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when raw is not an array (existing behavior preserved)', async () => {
    // AC: readOutbox returns empty array when raw is not an array
    await idbKvSet('outbox', { not: 'an array' } as unknown as never);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toEqual([]);
    // The pre-existing top-level non-array branch fires its own capture.
    expect(captureException).toHaveBeenCalledTimes(1);
    // The non-array path also resets the stored value to []; verify.
    const after = await idbKvGet('outbox');
    expect(after).toEqual([]);
  });

  it('returns empty array when key is missing (existing behavior preserved)', async () => {
    // AC: readOutbox handles a missing key as an empty array, no capture
    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toEqual([]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not fire Sentry capture on a fully-valid outbox', async () => {
    // AC: silent on success — no console logs, no Sentry exceptions on happy path
    await idbKvSet('outbox', [
      validRow({ id: 'a', client_id: 'cid-a' }),
      validRow({ id: 'b', client_id: 'cid-b', kind: 'entry-create' }),
      validRow({ id: 'c', client_id: 'cid-c', kind: 'goal-weight-update', method: 'PATCH' }),
    ]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(3);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('treats legacy rows missing the optional conflict field as valid', async () => {
    // AC: pre-fix rows that predate the 5.1.1 `conflict` field must keep flushing.
    // The deferred-followup itself called this out as the primary risk path.
    const legacy = validRow({ id: 'legacy', client_id: 'cid-legacy' });
    delete (legacy as Record<string, unknown>).conflict;
    await idbKvSet('outbox', [legacy]);

    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('legacy');
    expect(captureException).not.toHaveBeenCalled();
  });
});
