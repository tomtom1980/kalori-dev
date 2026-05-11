/**
 * Task 5.1.3 — Replay state machine (pure reducer; framework-agnostic).
 *
 * Five states: idle | replaying | success | conflict | error.
 * Ten transitions (briefing §11). Illegal transitions return prevState by
 * reference so React's `useSyncExternalStore` and `useMemo` consumers can
 * cheaply detect no-ops.
 *
 * The reducer is consumed BOTH by React (the OfflineQueueProvider) and by
 * non-React paths (e.g. `outbox.ts` notify helpers) — hence keeping it free
 * of any React imports / hooks. State objects are frozen on output to make
 * accidental mutation in consumers impossible.
 *
 * Ownership boundaries (R1 / I11):
 *   - This module never calls `fetch` or `authFetch`. Flush execution is
 *     owned by `lib/offline/outbox.ts` (5.1.1).
 *   - `client_id` flows through `conflicts[].client_id` opaquely; the reducer
 *     never mutates or regenerates it (I11 contract).
 *   - The state machine is "status only": it tracks counts and enums, not
 *     payloads.
 *
 * @see Planning/.tmp/task-5.1.3-briefing.md §11 for the canonical transition
 *      table.
 */

import type { OutboxKind } from './types';

/** Five replay states (briefing §11). */
export type ReplayStatus = 'idle' | 'replaying' | 'success' | 'conflict' | 'error';

/** Conflict carry-state — populated on T3 (412 goal-weight). */
export interface ReplayConflict {
  client_id: string;
  kind: OutboxKind;
  /** Server's authoritative current value, surfaced verbatim to 5.1.5's modal. */
  current: unknown;
}

/**
 * State + carry-state. The status enum is the discriminator; the other fields
 * carry information needed by consumers (counts, conflicts, lastError, sticky
 * timestamp). Consumers MUST treat returned objects as read-only — every
 * non-no-op transition produces a frozen object.
 */
export interface ReplayContext {
  status: ReplayStatus;
  queueDepth: number;
  attempted: number;
  failed: number;
  lastFlushAt: number | null;
  lastError: string | null;
  conflicts: ReadonlyArray<ReplayConflict>;
}

/** Failure record from outbox.flush (subset of `FlushResult.failed`). */
export interface ReplayFailure {
  client_id: string;
  kind: OutboxKind;
  error: string;
  conflict?: { current: unknown };
}

/** Event union driving the reducer. */
export type ReplayEvent =
  | { type: 'flush.start'; online: boolean; queueDepth: number }
  | {
      type: 'flush.complete';
      attempted: number;
      failed: number;
      conflicts: ReadonlyArray<ReplayConflict>;
      lastError: string | null;
      now: number;
    }
  | { type: 'flush.aborted-network'; now: number }
  | { type: 'tick' }
  | { type: 'enqueue'; queueDepth: number }
  | { type: 'clear-dev' };

/** Initial state factory. Always returns a fresh frozen `idle` state. */
export function initialReplayState(): ReplayContext {
  return Object.freeze({
    status: 'idle',
    queueDepth: 0,
    attempted: 0,
    failed: 0,
    lastFlushAt: null,
    lastError: null,
    conflicts: Object.freeze([] as ReplayConflict[]),
  }) as ReplayContext;
}

/**
 * Pure reducer: `(state, event) => state`. Illegal transitions return the
 * SAME reference (prev state) — consumers can use `===` to detect no-ops.
 */
export function replayReducer(state: ReplayContext, event: ReplayEvent): ReplayContext {
  switch (event.type) {
    case 'flush.start': {
      // T1 / T7 / T8 — idle, conflict, error all transition to replaying when
      // online and queue has work. The online + non-empty-queue guard applies
      // UNIFORMLY to every entry path so the provider can rely on the reducer
      // as the single source of truth for admission (Codex F1 — Round 1).
      if (state.status === 'idle' || state.status === 'conflict' || state.status === 'error') {
        if (!event.online || event.queueDepth <= 0) return state;
        return freeze({
          ...state,
          status: 'replaying',
          queueDepth: event.queueDepth,
        });
      }
      // replaying / success — already in motion or just-finished sticky window.
      return state;
    }

    case 'flush.complete': {
      // T2 / T3 / T4 — must be in replaying. Routing rule:
      //   - failed = 0                                                  → success
      //   - failed > 0 AND ALL failures are conflicts (412)              → conflict
      //   - failed > 0 AND any non-412 failure                           → error
      if (state.status !== 'replaying') return state;
      if (event.failed === 0) {
        return freeze({
          ...state,
          status: 'success',
          attempted: event.attempted,
          failed: 0,
          queueDepth: 0,
          conflicts: Object.freeze([]),
          lastError: null,
          lastFlushAt: event.now,
        });
      }
      const allConflicts = event.conflicts.length === event.failed && event.conflicts.length > 0;
      if (allConflicts) {
        return freeze({
          ...state,
          status: 'conflict',
          attempted: event.attempted,
          failed: event.failed,
          conflicts: Object.freeze(event.conflicts.slice()) as ReadonlyArray<ReplayConflict>,
          lastError: event.lastError,
        });
      }
      return freeze({
        ...state,
        status: 'error',
        attempted: event.attempted,
        failed: event.failed,
        conflicts: Object.freeze(event.conflicts.slice()) as ReadonlyArray<ReplayConflict>,
        lastError: event.lastError,
      });
    }

    case 'flush.aborted-network': {
      // T5 — only valid mid-replay.
      if (state.status !== 'replaying') return state;
      return freeze({
        ...state,
        status: 'error',
        lastError: 'network',
      });
    }

    case 'tick': {
      // T6 — only the success state ages out. Other states ignore tick.
      if (state.status !== 'success') return state;
      return freeze({
        ...state,
        status: 'idle',
        attempted: 0,
        failed: 0,
        // lastFlushAt is preserved across age-out so consumers can still
        // render "Synced HH:mm" on hover etc.
      });
    }

    case 'enqueue': {
      // T9 — bumps queueDepth without changing status.
      return freeze({
        ...state,
        queueDepth: event.queueDepth,
      });
    }

    case 'clear-dev': {
      // T10 — full reset.
      return initialReplayState();
    }

    default: {
      // Unknown event types are no-ops (briefing §11 illegal-transition policy).
      return state;
    }
  }
}

function freeze(c: ReplayContext): ReplayContext {
  // Conflicts array already frozen at the call sites that pass through it,
  // but the test suite asserts both the outer object and the conflicts array
  // are frozen on every emitted state.
  if (!Object.isFrozen(c.conflicts)) {
    Object.freeze(c.conflicts);
  }
  return Object.freeze(c);
}
