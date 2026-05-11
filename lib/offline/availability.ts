/**
 * Task 5.1.1 — IDB availability detection.
 *
 * Probes `indexedDB.open` and returns a structured result describing whether
 * the platform supports persistent storage. Three failure modes are handled:
 *
 *   - `unsupported`   — `indexedDB` is undefined (SSR / very old browsers).
 *   - `security_error`— Safari private mode pre-iOS 17, or origin restrictions
 *                       (`open` throws synchronously with `name === 'SecurityError'`).
 *   - `open_failed`   — open returns a request whose `onerror` fires
 *                       (quota denied, corruption, etc.).
 *
 * The detector is idempotent + side-effect-free: it opens a probe DB named
 * `__kalori_idb_probe__`, immediately closes it on success, and returns a
 * cached result for the rest of the page lifetime. The cache is keyed by the
 * `indexedDB` global identity so test stubs work correctly across vi.resetModules.
 *
 * Per `Planning/.tmp/task-5.1-briefing.md` §AC6 — when this returns ok:false,
 * the outbox short-circuits and the caller surfaces the IDB-unavailable toast
 * once per session.
 */

export type IdbAvailability =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'security_error' | 'open_failed' };

const PROBE_DB_NAME = '__kalori_idb_probe__';

let cachedResult: IdbAvailability | null = null;
let cachedFor: unknown = null;

/**
 * Returns the IDB availability result. The probe is performed once per page
 * lifetime; subsequent calls return the cached value. Cache keying on
 * `globalThis.indexedDB` identity ensures tests that stub the global produce
 * fresh detection per stub.
 */
export async function detectIdbAvailability(): Promise<IdbAvailability> {
  const idb = (globalThis as { indexedDB?: IDBFactory | undefined }).indexedDB;

  // Cache hit when same indexedDB identity (stable global) — fast path.
  if (cachedResult !== null && cachedFor === idb) {
    return cachedResult;
  }

  cachedFor = idb;

  if (idb === undefined || idb === null) {
    cachedResult = { ok: false, reason: 'unsupported' };
    return cachedResult;
  }

  let openRequest: IDBOpenDBRequest;
  try {
    openRequest = idb.open(PROBE_DB_NAME);
  } catch (err) {
    const name = (err as { name?: string }).name;
    cachedResult = {
      ok: false,
      reason: name === 'SecurityError' ? 'security_error' : 'open_failed',
    };
    return cachedResult;
  }

  cachedResult = await new Promise<IdbAvailability>((resolve) => {
    openRequest.onsuccess = () => {
      try {
        const db = openRequest.result;
        if (db && typeof db.close === 'function') {
          db.close();
        }
      } catch {
        // Closing a probe DB should never throw, but if it does we still want
        // to report ok:true — the read/write probe path is downstream.
      }
      resolve({ ok: true });
    };
    openRequest.onerror = () => {
      resolve({ ok: false, reason: 'open_failed' });
    };
    openRequest.onblocked = () => {
      resolve({ ok: false, reason: 'open_failed' });
    };
  });

  return cachedResult;
}

/**
 * Test-only hook to reset the cached result. NOT exported from the public
 * barrel — only outbox internals + tests should reach for this.
 */
export function __resetIdbAvailabilityCacheForTests(): void {
  cachedResult = null;
  cachedFor = null;
}
