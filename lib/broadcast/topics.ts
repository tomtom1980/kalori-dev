/**
 * BroadcastChannel topic registry — single source of truth.
 *
 * Constants prevent typo-drift between sender and receiver tabs. A wrong
 * channel name produces a silent listener (the post lands but no one is
 * listening) — making the topic strings into a constant catches that at
 * the call site instead of in production.
 *
 * Universal module (no `'use client'`). Pure constants — safe in either
 * runtime. Used by:
 *   - `lib/auth/cross-tab-signout.ts` (F12 cross-tab — Task 5.2)
 *   - `lib/stores/useUndoQueueStore.ts` + `.cross-tab.ts` (F6 cross-tab — Task 5.2)
 */
export const TOPICS = {
  /** F12 cross-tab sign-out propagation (Task 5.2). */
  auth: 'kalori-auth',
  /** F6 cross-tab undo reveal (Task 5.2 extension of Task 3.4 store). */
  undo: 'kalori-undo',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
