/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.3 — Outbox `subscribe(listener)` emitter unit tests.
 *
 * The single allowed surgical edit to lib/offline/outbox.ts (per briefing §9
 * Option A): a new `subscribe(listener)` export plus internal `notify()` glue
 * called on enqueue / remove / markFailed / recordConflict / flush start / end.
 *
 * No existing semantics, types, or other exports are changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clear as idbClear } from 'idb-keyval';

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Task 5.1.3 — outbox.subscribe (5.1.1 surgical edit)', () => {
  it('subscribe returns an unsubscribe function', async () => {
    // AC2: passive subscription surface; no implicit semantics change
    const { subscribe } = await import('@/lib/offline/outbox');
    const unsub = subscribe(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('subscribed listener is called after enqueue', async () => {
    // AC2: enqueue → notify
    const { enqueue, subscribe } = await import('@/lib/offline/outbox');
    const listener = vi.fn();
    const unsub = subscribe(listener);
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c1', ml: 250, date: '2026-04-25' },
    });
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('subscribed listener is called after remove', async () => {
    // AC2: remove → notify
    const { enqueue, remove, subscribe } = await import('@/lib/offline/outbox');
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c2', ml: 250, date: '2026-04-25' },
    });
    const listener = vi.fn();
    const unsub = subscribe(listener);
    listener.mockReset();
    const removed = await remove('c2');
    expect(removed).toBe(true);
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('subscribed listener is called after markFailed', async () => {
    // AC2: markFailed → notify
    const { enqueue, markFailed, subscribe } = await import('@/lib/offline/outbox');
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c3', ml: 250, date: '2026-04-25' },
    });
    const listener = vi.fn();
    const unsub = subscribe(listener);
    listener.mockReset();
    await markFailed('c3', 'transient');
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it('subscribed listener is called on flush start AND end', async () => {
    // AC2: flush start + end both notify so providers can flip replayStatus
    const { enqueue, flush, subscribe } = await import('@/lib/offline/outbox');
    authFetch.mockResolvedValue(jsonResponse(200));
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c4', ml: 250, date: '2026-04-25' },
    });
    const listener = vi.fn();
    const unsub = subscribe(listener);
    listener.mockReset();
    await flush();
    // Expect at least 2 notifies (start + end). May be more (per-row remove).
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    unsub();
  });

  it('unsubscribe removes the listener', async () => {
    // AC2: unsub stops further notifies; idempotent across React strict-mode double-mount
    const { enqueue, subscribe } = await import('@/lib/offline/outbox');
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    listener.mockReset();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c5', ml: 250, date: '2026-04-25' },
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent (calling twice is a no-op)', async () => {
    // AC1: React 19 strict-mode dev double-mount registers + cleans up twice
    const { subscribe } = await import('@/lib/offline/outbox');
    const unsub = subscribe(() => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it('multiple subscribers each receive notifications', async () => {
    // AC2: multi-listener support
    const { enqueue, subscribe } = await import('@/lib/offline/outbox');
    const a = vi.fn();
    const b = vi.fn();
    const unA = subscribe(a);
    const unB = subscribe(b);
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: 'c6', ml: 250, date: '2026-04-25' },
    });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    unA();
    unB();
  });
});
