'use client';

/**
 * Task 5.1.3 — `useOutbox` consumer entry-point.
 *
 * `useOutbox()` is the SINGLE hook UI components should reach for. It
 * flattens the `OfflineQueueProvider` snapshot into a stable shape:
 *
 *   {
 *     online,
 *     queueDepth,
 *     lastFlushAt,
 *     replayStatus,
 *     conflicts,
 *     actions: { requestFlush, resolveConflict, retry },
 *     meta:    { isReducedMotion, isPending },
 *   }
 *
 * Why the flatten layer
 * ─────────────────────
 * - The provider's `state` shape is reusable for diagnostics, but UI sites
 *   want a flat contract — destructuring `{queueDepth}` is friendlier than
 *   `state: { queueDepth }`.
 * - `actions.retry` is a friendly alias for `requestFlush` (5.1.5's chip
 *   click target maps to "tap to retry" copy).
 * - This hook NEVER imports `lib/offline/outbox` directly. R1 + I11 firewalls
 *   are owned by `OfflineQueueProvider`. Components that import from
 *   `@/lib/offline/use-outbox` cannot reach the underlying outbox API surface
 *   — they get only the flat contract above.
 */

import { useMemo } from 'react';

import { type OfflineQueueActions, type OfflineQueueMeta, useOfflineQueue } from './network-state';
import type { ReplayConflict, ReplayStatus } from './replay-state-machine';

export interface UseOutboxResult {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  conflicts: ReadonlyArray<ReplayConflict>;
  actions: OfflineQueueActions & {
    /** Friendly alias for `requestFlush` — used by 5.1.5's "tap to retry" chip. */
    retry: () => Promise<void>;
  };
  meta: OfflineQueueMeta;
}

export function useOutbox(): UseOutboxResult {
  const { state, actions, meta } = useOfflineQueue();
  return useMemo<UseOutboxResult>(
    () => ({
      online: state.online,
      queueDepth: state.queueDepth,
      lastFlushAt: state.lastFlushAt,
      replayStatus: state.replayStatus,
      conflicts: state.conflicts,
      actions: {
        requestFlush: actions.requestFlush,
        resolveConflict: actions.resolveConflict,
        retry: actions.requestFlush,
      },
      meta,
    }),
    [
      state.online,
      state.queueDepth,
      state.lastFlushAt,
      state.replayStatus,
      state.conflicts,
      actions.requestFlush,
      actions.resolveConflict,
      meta,
    ],
  );
}
