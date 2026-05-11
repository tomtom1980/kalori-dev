/**
 * Task 5.1.1 — `idb-keyval` typed wrapper for the offline data layer.
 *
 * Per the Quick-Pick Decision Table (`Planning/.tmp/task-5.1-ui-architecture.md` §A),
 * the offline layer uses `idb-keyval` (~600 B gzipped) instead of the heavier
 * `idb` package because all keys are pure key/value with no range queries.
 *
 * Six canonical keys (4 from Pass-1 enrichment, 2 new for Task 5.1):
 *
 *   - `library`               — LibraryItem[] snapshot          (Pass 1)
 *   - `entries:${day}`        — FoodEntry[] per ISO day         (Pass 1)
 *   - `profile`               — Profile snapshot                (Pass 1)
 *   - `weekly-review:${week}` — WeeklyReview per ISO week       (Pass 1)
 *   - `outbox`                — OutboxRow[] FIFO (NEW 5.1.1)
 *   - `outbox:flush-lock`     — { acquiredAt: number } cross-tab race lock (NEW 5.1.1)
 *
 * The wrapper isolates `idb-keyval` import behind a typed surface so:
 *   1. Outbox internals never reach for the raw `get`/`set`/`del` exports.
 *   2. IDB-unavailable detection short-circuits ALL access through one path.
 *   3. Future migration to `idb` (if range queries ever become needed) is a
 *      one-file change.
 *
 * NO Sentry breadcrumbs at this layer — the outbox owns the breadcrumb policy
 * (this layer is too low-level to know whether a read/write is part of a
 * routine flush or a corruption signal).
 */
import { del, get, set, clear as kvClear } from 'idb-keyval';

import { detectIdbAvailability } from './availability';

import type { OutboxRow } from './types';

/** The full set of keys we manage. Adding a new key MUST update this union. */
export type IdbKey =
  | 'library'
  | `entries:${string}`
  | 'profile'
  | `weekly-review:${string}`
  | 'outbox'
  | 'outbox:flush-lock';

/**
 * Type map from key → value. Forced explicit so the wrapper's get/set are
 * not `unknown`-typed at the call site — the outbox manipulates strongly
 * typed arrays and the lock is a well-known shape.
 */
export interface IdbValueMap {
  library: unknown;
  profile: unknown;
  outbox: OutboxRow[];
  /**
   * Cross-tab flush lock. `owner` is a per-call UUID so a tab whose flush
   * exceeded the TTL doesn't accidentally release a newer lock acquired by
   * a sibling tab. See `lib/offline/outbox.ts` `acquireFlushLock` /
   * `releaseFlushLock` for the contract.
   */
  'outbox:flush-lock': { acquiredAt: number; owner: string };
  // Day / week-prefixed keys are not strongly typed at the wrapper level —
  // the cache layer that owns them carries its own type.
  [k: string]: unknown;
}

/**
 * Read a value from IDB. Returns `undefined` when the key is missing OR when
 * IDB is unavailable. Never throws — IDB transaction errors are swallowed
 * here; the caller decides whether to surface them via Sentry.
 */
export async function idbGet<K extends keyof IdbValueMap>(
  key: K,
): Promise<IdbValueMap[K] | undefined> {
  const availability = await detectIdbAvailability();
  if (!availability.ok) return undefined;
  try {
    return (await get(key)) as IdbValueMap[K] | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write a value to IDB. Returns true on success, false on availability /
 * transaction failure. Errors are NOT thrown — the outbox layer translates
 * a `false` return into a Sentry exception (`idb.transaction_error`) when
 * the failure breaks an invariant.
 */
export async function idbSet<K extends keyof IdbValueMap>(
  key: K,
  value: IdbValueMap[K],
): Promise<boolean> {
  const availability = await detectIdbAvailability();
  if (!availability.ok) return false;
  try {
    await set(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Delete a key. Same error semantics as idbSet. */
export async function idbDel<K extends keyof IdbValueMap>(key: K): Promise<boolean> {
  const availability = await detectIdbAvailability();
  if (!availability.ok) return false;
  try {
    await del(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear ALL keys. Production-gated by the outbox's clear() entry-point — this
 * function does NOT enforce the gate; callers must.
 */
export async function idbClearAll(): Promise<boolean> {
  const availability = await detectIdbAvailability();
  if (!availability.ok) return false;
  try {
    await kvClear();
    return true;
  } catch {
    return false;
  }
}
