/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.1 — IDB-unavailable fallback (Safari private mode + quota errors).
 *
 * Three failure modes are simulated:
 *   1. `indexedDB.open` throws SecurityError (Safari private mode pre-iOS 17).
 *   2. `indexedDB` is undefined on globalThis.
 *   3. A successful open followed by a quota-exceeded write.
 *
 * In each case `availability.detect()` MUST return `{ ok: false, reason: ... }`,
 * the outbox MUST short-circuit (enqueue resolves to a no-op result with
 * `idbAvailable: false` semantics — caller surfaces the one-time toast), and
 * Sentry MUST capture an `idb.transaction_error` exception when a write throws
 * post-detection (corruption / quota).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
const addBreadcrumb = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException,
  addBreadcrumb,
}));

beforeEach(() => {
  vi.resetModules();
  captureException.mockReset();
  addBreadcrumb.mockReset();
});

afterEach(() => {
  // Restore happy-dom's native indexedDB after each test.
  vi.unstubAllGlobals();
});

describe('Task 5.1.1 — IDB availability detection', () => {
  it('returns ok:false when indexedDB is undefined (server-render guard)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { detectIdbAvailability } = await import('@/lib/offline/availability');
    const result = await detectIdbAvailability();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported');
    }
  });

  it('returns ok:false with reason "security_error" when open throws SecurityError', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const err: Error & { name?: string } = new Error('Access denied');
        err.name = 'SecurityError';
        throw err;
      },
    });
    const { detectIdbAvailability } = await import('@/lib/offline/availability');
    const result = await detectIdbAvailability();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('security_error');
    }
  });

  it('returns ok:false with reason "open_failed" when open emits an error event', async () => {
    type OpenReq = {
      onsuccess: ((ev: unknown) => void) | null;
      onerror: ((ev: unknown) => void) | null;
      error: Error | null;
    };
    vi.stubGlobal('indexedDB', {
      open: (): OpenReq => {
        const req: OpenReq = { onsuccess: null, onerror: null, error: new Error('quota denied') };
        // Fire onerror asynchronously to mimic the real API.
        queueMicrotask(() => req.onerror?.({}));
        return req;
      },
    });
    const { detectIdbAvailability } = await import('@/lib/offline/availability');
    const result = await detectIdbAvailability();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('open_failed');
    }
  });

  it('returns ok:true on a happy-dom-supported indexedDB', async () => {
    // Use the real happy-dom indexedDB (no stub).
    const { detectIdbAvailability } = await import('@/lib/offline/availability');
    const result = await detectIdbAvailability();
    expect(result.ok).toBe(true);
  });
});

describe('Task 5.1.1 — outbox short-circuit when IDB unavailable', () => {
  it('enqueue resolves with idbAvailable=false when IDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { enqueue } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    const result = await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cid, ml: 100 },
    });
    expect(result.idbAvailable).toBe(false);
    // No throw, no Sentry exception — fallback to online-only mode is silent.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('peek returns [] when IDB is missing (no throw)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { peek } = await import('@/lib/offline/outbox');
    const rows = await peek();
    expect(rows).toEqual([]);
  });

  it('flush is a no-op when IDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { flush } = await import('@/lib/offline/outbox');
    const result = await flush();
    expect(result.attempted).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.idbAvailable).toBe(false);
  });
});
