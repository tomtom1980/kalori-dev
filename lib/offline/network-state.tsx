'use client';

/**
 * Task 5.1.3 — Network state provider (`OfflineQueueProvider`) and the
 * primary `useOfflineQueue` consumer hook.
 *
 * What this module owns
 * ─────────────────────
 * 1. **A single source of truth** for {online, queueDepth, lastFlushAt,
 *    replayStatus, conflicts, idbAvailable, isReducedMotion} — sourced from
 *    `navigator.onLine` + the `window` `online`/`offline` events,
 *    `outbox.size()`, and the replay-state-machine reducer (briefing §11).
 * 2. **Hydration-safe SSR snapshot.** Server snapshot equals first client
 *    snapshot ({online: true, queueDepth: 0, …}). Real values only flow in
 *    after the post-mount `useEffect` reads `outbox.size()` and the outbox
 *    emitter pushes notifications.
 * 3. **`useTransition`-wrapped flush trigger** so cascading optimistic
 *    updates / RSC `updateTag` invalidations stream without janking the
 *    offline-bar dismissal. Bypassed under `prefers-reduced-motion: reduce`.
 *
 * Invariants enforced (R1 / I11 / R3)
 * ───────────────────────────────────
 * - **R1:** The provider NEVER calls raw `fetch()`. The only mutation surface
 *   it exposes is `actions.requestFlush()` which delegates to
 *   `outbox.flush()` (5.1.1) — that flush wraps `authFetch`. Grep for
 *   `fetch(` inside this file to verify.
 * - **I11:** `client_id` is owned by `outbox.enqueue()`. The provider's
 *   `actions.resolveConflict(client_id, …)` passes the id through opaquely;
 *   no mutation, no regeneration on conflict/error paths.
 * - **R3:** This file is `'use client'`. The provider is mounted UNDER the
 *   app shell by `app/(app)/layout.tsx` (5.1.4 — not by this task). On the
 *   server, `useSyncExternalStore`'s `getServerSnapshot` returns the same
 *   shape as the first client snapshot, so React 19's strict-mode hydrate
 *   produces no SSR/CSR mismatch warning.
 *
 * NOT in scope
 * ────────────
 * - Visual rendering (offline bar / install modal): 5.1.4
 * - Replay status badge / drawer / conflict modal: 5.1.5
 * - SW registration: 5.1.2 (already shipped)
 * - The outbox itself + R1 wiring: 5.1.1 (already shipped)
 *
 * @see Planning/.tmp/task-5.1.3-briefing.md §3, §6, §7
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import type { JSX, ReactNode } from 'react';

import { detectIdbAvailability } from './availability';
import {
  flush as outboxFlush,
  remove as outboxRemove,
  size as outboxSize,
  subscribe as outboxSubscribe,
} from './outbox';
import {
  type ReplayConflict,
  type ReplayContext,
  type ReplayEvent,
  type ReplayStatus,
  initialReplayState,
  replayReducer,
} from './replay-state-machine';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Snapshot exposed to consumers via `useOfflineQueue()`. */
export interface OfflineQueueSnapshot {
  online: boolean;
  queueDepth: number;
  idbAvailable: boolean;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  /** Populated when `replayStatus === 'conflict'` — see briefing §11 T3. */
  conflicts: ReadonlyArray<ReplayConflict>;
}

/**
 * Conflict-resolution choices accepted by `actions.resolveConflict`.
 *
 * `'keep-offline'` was intentionally REMOVED in Codex Round 1 (F2 fix). Until
 * 5.1.5 ships an API that rewrites the queued row with refreshed precondition
 * metadata, replaying the same body produced the same 412 indefinitely. The
 * safe surface today is `'use-current'` only (server wins → drop local row).
 */
export type ConflictResolution = 'use-current';

/** Actions exposed via `useOfflineQueue().actions`. */
export interface OfflineQueueActions {
  /** Request a flush; delegates to `outbox.flush()`. R1 wiring lives in 5.1.1. */
  requestFlush: () => Promise<void>;
  /** Forwarded to outbox; F10 modal (5.1.5) consumes this on user choice. */
  resolveConflict: (client_id: string, resolution: ConflictResolution) => Promise<void>;
}

export interface OfflineQueueMeta {
  /** True when `(prefers-reduced-motion: reduce)` matches OR settings override is on. */
  isReducedMotion: boolean;
  /**
   * True when a `useTransition` callback is in flight (rendering priority).
   * Prefer `isFlushing` for "is the outbox actually working right now?" —
   * `useTransition` returns immediately after scheduling the deferred work,
   * so this can drop before `outbox.flush()` resolves.
   */
  isPending: boolean;
  /**
   * True from just before `await outbox.flush()` until the `finally` block
   * after it resolves/rejects (Codex F3 fix — Round 1). Use this in UI to
   * disable retry controls or render replay progress accurately.
   */
  isFlushing: boolean;
}

export interface OfflineQueueContextValue {
  state: OfflineQueueSnapshot;
  actions: OfflineQueueActions;
  meta: OfflineQueueMeta;
}

// ---------------------------------------------------------------------------
// Context plumbing
// ---------------------------------------------------------------------------

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

// ---------------------------------------------------------------------------
// External store — module-scoped to survive React 19 strict-mode double-mount
// ---------------------------------------------------------------------------

interface NetStoreShape {
  online: boolean;
  /** Depth read from `outbox.size()` — refreshed on outbox notify. */
  queueDepth: number;
  idbAvailable: boolean;
  /** Pure-reducer state (briefing §11). */
  replay: ReplayContext;
}

const initialStore: NetStoreShape = {
  online: true,
  queueDepth: 0,
  idbAvailable: true,
  replay: initialReplayState(),
};

let storeState: NetStoreShape = initialStore;
const storeListeners = new Set<() => void>();

function getSnapshot(): NetStoreShape {
  return storeState;
}

/**
 * Server snapshot mirrors the zero state so React 19 hydrate succeeds. Note
 * that `useSyncExternalStore` requires this returns a stable reference — we
 * use the same `initialStore` object every call.
 */
function getServerSnapshot(): NetStoreShape {
  return initialStore;
}

function subscribeStore(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function setStore(next: NetStoreShape): void {
  if (next === storeState) return;
  storeState = next;
  for (const listener of Array.from(storeListeners)) {
    try {
      listener();
    } catch {
      // Listener errors must not break the store path.
    }
  }
}

function dispatchReplay(event: ReplayEvent): void {
  const nextReplay = replayReducer(storeState.replay, event);
  if (nextReplay === storeState.replay) return;
  setStore({ ...storeState, replay: nextReplay });
}

function setOnline(online: boolean): void {
  if (storeState.online === online) return;
  setStore({ ...storeState, online });
}

function setQueueDepth(depth: number): void {
  if (storeState.queueDepth === depth) return;
  setStore({ ...storeState, queueDepth: depth });
  // Mirror into the replay reducer so consumers reading replay.queueDepth
  // (downstream of T9) stay in sync.
  dispatchReplay({ type: 'enqueue', queueDepth: depth });
}

function setIdbAvailable(ok: boolean): void {
  if (storeState.idbAvailable === ok) return;
  setStore({ ...storeState, idbAvailable: ok });
}

/**
 * Test-only reset to clear module-scoped state between vitest cases. Not
 * exported from any barrel — test consumers reach for it directly.
 */
export function __resetOfflineStoreForTests(): void {
  storeState = {
    ...initialStore,
    replay: initialReplayState(),
  };
  storeListeners.clear();
}

// ---------------------------------------------------------------------------
// Reduced-motion probe (no `lib/motion/use-motion.ts` available yet; inline)
// ---------------------------------------------------------------------------

/**
 * Effective reduced-motion = OS pref OR Settings override (`localStorage
 * 'kalori.reduce-motion' === '1'`). The Settings toggle is ADDITIVE: ON
 * forces reduce; OFF inherits OS pref. Never cancels OS-says-reduce.
 *
 * Codex Round 1 (C-1): the original `useReducedMotionPreference()` only
 * read `matchMedia('(prefers-reduced-motion: reduce)')` and ignored the
 * Settings localStorage override. Combined with a CSS reduced-motion
 * block keyed only on `@media (prefers-reduced-motion: reduce)`, the
 * Settings toggle was functionally inert — toggling ON wrote to
 * localStorage but neither this hook nor the global CSS rule re-read
 * the override, so no animation actually slowed down. The hook now
 * merges both sources via `useSyncExternalStore` and the matching
 * mirror CSS block lives at `app/globals.css` keyed on
 * `html[data-reduce-motion='1']`.
 */
const REDUCE_MOTION_STORAGE_KEY = 'kalori.reduce-motion';

function osReducedMotionMatches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function settingsReducedMotionOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function reducedMotionGetSnapshot(): boolean {
  return osReducedMotionMatches() || settingsReducedMotionOverride();
}

function reducedMotionGetServerSnapshot(): boolean {
  return false;
}

function reducedMotionSubscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Cross-tab + same-tab Settings toggle sync. Storage events fire in
  // OTHER tabs; for same-tab updates the ReduceMotionToggle dispatches a
  // window 'kalori:reduce-motion-change' CustomEvent.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === REDUCE_MOTION_STORAGE_KEY || event.key === null) listener();
  };
  const onCustom = (): void => listener();
  let mqlBound = false;
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', listener);
    mqlBound = true;
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(listener);
    mqlBound = true;
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener('kalori:reduce-motion-change', onCustom);
  return () => {
    if (mqlBound) {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', listener);
      } else if (typeof mql.removeListener === 'function') {
        mql.removeListener(listener);
      }
    }
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('kalori:reduce-motion-change', onCustom);
  };
}

function useReducedMotionPreference(): boolean {
  return useSyncExternalStore<boolean>(
    reducedMotionSubscribe,
    reducedMotionGetSnapshot,
    reducedMotionGetServerSnapshot,
  );
}

/**
 * Test-only probe — reads the same merged snapshot the hook serves.
 * Kept under a `__` prefix so it's clearly internal. Used by
 * `tests/integration/reduce-motion-effective.test.tsx` to validate
 * Codex Round 1 (C-1): localStorage override must merge with OS pref.
 */
export function __probeReducedMotionForTests(): boolean {
  return reducedMotionGetSnapshot();
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface OfflineQueueProviderProps {
  children: ReactNode;
}

export function OfflineQueueProvider({ children }: OfflineQueueProviderProps): JSX.Element {
  const store = useSyncExternalStore<NetStoreShape>(subscribeStore, getSnapshot, getServerSnapshot);
  const isReducedMotion = useReducedMotionPreference();
  const [isPending, startTransition] = useTransition();
  const flushInFlightRef = useRef<boolean>(false);
  // Codex F3 — Round 1: explicit flush-in-flight signal. Lives in component
  // state (not just the ref) so consumers see re-renders when it flips. Set
  // BEFORE `await outboxFlush()` and cleared in `finally`.
  const [isFlushing, setIsFlushing] = useState<boolean>(false);

  // ---- Effect: window online/offline listeners (AC6) -----------------------
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = (): void => {
      setOnline(true);
    };
    const onOffline = (): void => {
      setOnline(false);
    };
    // Initial sync — the SSR snapshot may have lied (we always render online:true).
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      setOnline(navigator.onLine);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ---- Effect: outbox emitter wiring (AC2) --------------------------------
  useEffect(() => {
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const depth = await outboxSize();
        if (!cancelled) setQueueDepth(depth);
      } catch {
        // Outbox internals already capture exceptions — provider is non-fatal.
      }
    };
    void refresh(); // initial post-mount read
    const unsub = outboxSubscribe(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // ---- Effect: IDB availability probe -------------------------------------
  useEffect(() => {
    let cancelled = false;
    void detectIdbAvailability().then((result) => {
      if (cancelled) return;
      setIdbAvailable(result.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Effect: success sticky timer (T6) ----------------------------------
  useEffect(() => {
    if (store.replay.status !== 'success') return undefined;
    const t = window.setTimeout(() => {
      dispatchReplay({ type: 'tick' });
    }, 4000);
    return () => window.clearTimeout(t);
  }, [store.replay.status]);

  // ---- Action: requestFlush (AC5) -----------------------------------------
  const runFlush = useCallback(async (): Promise<void> => {
    if (flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    try {
      // Codex F1 — Round 1: the reducer is the single source of truth for
      // admission. Compute the next state first; only delegate to
      // `outboxFlush` when the reducer accepted the transition (i.e. status
      // advanced to `replaying`). When idle/conflict/error encounter the
      // offline or empty-queue guard, the reducer returns prevState by
      // reference and we MUST NOT touch outbox.flush — otherwise queued rows
      // can be marked failed without a valid replay attempt.
      //
      // Codex R2-F1 — Round 2: read the AUTHORITATIVE outbox depth
      // (`outboxSize()`) and `navigator.onLine` synchronously here, then feed
      // those live values into the reducer. The async-refreshed React snapshot
      // (`storeState.queueDepth`) can lag the IDB write, causing the reducer
      // to reject a flush that should have admitted (or vice-versa). When the
      // live read disagrees with the snapshot, also push the corrected depth
      // through `setQueueDepth` so downstream consumers catch up via the
      // existing subscribe path — no separate state store.
      const onlineNow =
        typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
          ? navigator.onLine
          : storeState.online;
      let depthNow: number;
      try {
        depthNow = await outboxSize();
      } catch {
        // outbox.size() reads IDB; on transient failure fall back to the
        // snapshot rather than dropping the flush request entirely.
        depthNow = storeState.queueDepth;
      }
      // Reconcile the snapshot if the live read disagrees so consumers
      // observe the corrected depth on the next render.
      if (depthNow !== storeState.queueDepth) {
        setQueueDepth(depthNow);
      }
      if (onlineNow !== storeState.online) {
        setOnline(onlineNow);
      }
      const startEvent: ReplayEvent = {
        type: 'flush.start',
        online: onlineNow,
        queueDepth: depthNow,
      };
      const projected = replayReducer(storeState.replay, startEvent);
      if (projected.status !== 'replaying') {
        // Reducer rejected (offline, empty queue, or already in motion). No
        // outbox call, no state change.
        return;
      }
      dispatchReplay(startEvent);

      let result: Awaited<ReturnType<typeof outboxFlush>>;
      // Codex F3 — Round 1: flip `isFlushing` immediately before the await
      // and clear it in `finally` so consumers see an accurate signal even
      // when the outer `useTransition` callback already returned.
      setIsFlushing(true);
      try {
        try {
          result = await outboxFlush();
        } catch {
          dispatchReplay({ type: 'flush.aborted-network', now: Date.now() });
          return;
        }

        const conflicts: ReplayConflict[] = result.failed
          .filter((f) => f.conflict !== undefined)
          .map((f) => ({
            client_id: f.client_id,
            kind: f.kind,
            current: f.conflict?.current ?? null,
          }));
        const lastError = result.failed.length > 0 ? (result.failed[0]?.error ?? 'unknown') : null;
        dispatchReplay({
          type: 'flush.complete',
          attempted: result.attempted,
          failed: result.failed.length,
          conflicts,
          lastError,
          now: Date.now(),
        });
      } finally {
        setIsFlushing(false);
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, []);

  const requestFlush = useCallback(async (): Promise<void> => {
    if (isReducedMotion) {
      // Reduced-motion users skip useTransition: instant state swaps, no
      // deferred rendering. Per briefing §6 + ux-specialist §L.
      await runFlush();
      return;
    }
    // useTransition cannot await internally — kick the flush off the
    // transition queue but still surface the same Promise to callers so
    // tests / consumers can await completion.
    let resolveFlush!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveFlush = resolve;
    });
    startTransition(() => {
      void runFlush().finally(() => resolveFlush());
    });
    await done;
  }, [isReducedMotion, runFlush, startTransition]);

  const resolveConflict = useCallback(
    async (client_id: string, resolution: ConflictResolution): Promise<void> => {
      // 5.1.3 owns the dispatch surface; the actual server-side conflict
      // resolution mechanics live in 5.1.5's modal flow. The only safe
      // resolution today is `'use-current'` (server wins → drop local row).
      //
      // Codex F2 — Round 1: `'keep-offline'` was REMOVED from this surface.
      // It used to leave the row untouched and immediately re-flush, but the
      // queued body + client_id are intentionally immutable (I11), so the
      // next flush sent the same stale request and produced the same 412 in
      // an infinite loop. Until 5.1.5 lands an API that rewrites the queued
      // row with refreshed precondition metadata, the public surface is
      // `'use-current'` only — runtime callers passing legacy strings get a
      // silent no-op (no outbox.flush, no row removal).
      if (resolution !== 'use-current') {
        // Defensive: ignore unknown resolutions. The TS type already narrows
        // the public surface, but a runtime caller bypassing the type system
        // (e.g. a test, or a future caller still on the old API) MUST NOT
        // trigger an auto-flush from a `conflict` state.
        return;
      }
      // Codex R2-F2 — Round 2: honour outbox.remove's boolean return value.
      // It returns false when the row is absent OR the IDB write failed; in
      // either case the conflicted row is still queued with the same
      // immutable client_id/body. Auto-flushing here would resend the stale
      // request and recreate the 412 loop the user just resolved. Stay in
      // `conflict` so the UI can surface a "removal failed, retry" state and
      // the user can re-trigger resolution explicitly.
      const removed = await outboxRemove(client_id);
      if (!removed) {
        return;
      }
      // After dropping the local row, kick a flush attempt so the state
      // machine moves out of `conflict` (T7) once the row is gone.
      await runFlush();
    },
    [runFlush],
  );

  const value = useMemo<OfflineQueueContextValue>(() => {
    const snapshot: OfflineQueueSnapshot = Object.freeze({
      online: store.online,
      queueDepth: store.queueDepth,
      idbAvailable: store.idbAvailable,
      lastFlushAt: store.replay.lastFlushAt,
      replayStatus: store.replay.status,
      conflicts: store.replay.conflicts,
    });
    return {
      state: snapshot,
      actions: {
        requestFlush,
        resolveConflict,
      },
      meta: {
        isReducedMotion,
        isPending,
        isFlushing,
      },
    };
  }, [
    store.online,
    store.queueDepth,
    store.idbAvailable,
    store.replay.status,
    store.replay.lastFlushAt,
    store.replay.conflicts,
    isReducedMotion,
    isPending,
    isFlushing,
    requestFlush,
    resolveConflict,
  ]);

  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Read the network/outbox snapshot. Components MUST consume this hook (or
 * its `useOutbox` re-export) — never the underlying `lib/offline/outbox`
 * module. The hook throws when called outside an `OfflineQueueProvider` so
 * misuse fails loudly.
 */
export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (ctx === null) {
    throw new Error(
      'useOfflineQueue must be called inside an <OfflineQueueProvider>. ' +
        'Mount the provider in app/(app)/layout.tsx (Task 5.1.4 owner).',
    );
  }
  return ctx;
}
