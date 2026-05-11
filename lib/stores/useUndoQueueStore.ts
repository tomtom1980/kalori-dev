/**
 * `useUndoQueueStore` — Task 3.4 chrome-level undo LIFO queue.
 *
 * Contract (synthesis §2.4 + §5.5 + briefing §10.4):
 *   - LIFO max 5; FIFO eviction on overflow — oldest force-commits then drops.
 *   - Per-item 5s `setTimeout`; on natural expiry, `commit()` runs then
 *     the entry is removed.
 *   - `clearOnNav()` marks all entries `visible=false` but keeps timers
 *     armed so commit/revert still fire on 5s expiry across route changes.
 *   - `undoTop()` clears the newest live entry's timer, runs `revert()`, and
 *     removes the entry.
 *   - `dismissTop()` hides the newest visible entry without running
 *     commit/revert; timer continues so commit still fires at expiry.
 *   - `attachServerRowId(clientId, serverRowId)` binds a committed server
 *     row id onto the client_id-keyed entry (for DELETE-on-undo paths).
 *   - In-memory only (no persistence) — toasts are ephemeral.
 *
 * Selector pattern (§2.4): `selectLiveTop(stack)` returns the newest entry
 * whose `createdAt + 5000 > Date.now()`. On nav, if entries were hidden but
 * still alive, this re-surfaces the newest of them so F6 (3 AM scenario)
 * works.
 */
import { create } from 'zustand';

import { TOPICS } from '@/lib/broadcast/topics';

export type UndoKind =
  | 'saved'
  | 'deleted'
  | 'edited'
  | 'copied'
  | 'merged'
  | 'hydrated'
  // F3 delete-recovery — pushed by ConfirmationScreen when the save-toast's
  // UNDO → DELETE request is rejected by the server. The food_entries row is
  // still persisted; the toast only informs the user that the un-save failed.
  // revert + commit are both no-ops (cannot un-undo a server-side failure).
  | 'delete-failed';

export interface UndoEntry {
  toastId: string;
  clientId: string;
  kind: UndoKind;
  description: string;
  createdAt: number;
  /** False after clearOnNav() OR dismissTop() — UI hint only. */
  visible: boolean;
  /**
   * I3 — set by `dismissTop()` to permanently suppress the entry from
   * `selectLiveTop` while its 5s commit timer continues. `visible=false`
   * alone is not enough: `clearOnNav()` also flips visibility but the
   * entry must re-surface on the destination route per F6 (§2.4).
   */
  dismissed: boolean;
  serverRowId: string | null;
  commit: () => Promise<void>;
  revert: () => Promise<void>;
  timerId: ReturnType<typeof setTimeout>;
  /**
   * Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — per-entry TTL
   * override. Defaulted at push time to `TOAST_TTL_MS` when caller omits
   * the override; persisted on the entry so `selectLiveTop` and the
   * cross-tab receiver reconstruct the same TTL the originator chose.
   */
  ttlMs: number;
}

export type PushToastInput = Omit<
  UndoEntry,
  'toastId' | 'createdAt' | 'visible' | 'dismissed' | 'timerId' | 'ttlMs'
> & {
  /**
   * Set to `true` ONLY by the cross-tab listener (`useCrossTabUndoQueue`)
   * when forwarding an inbound BroadcastChannel push to the local store.
   * The store SUPPRESSES re-emission when this is `true` — that is the loop
   * guard which closes the bidirectional broadcast cycle. Local callers
   * MUST omit this flag (Task 5.2 F6 cross-tab additive contract).
   */
  _fromBroadcast?: boolean;
  /**
   * Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — optional per-call
   * TTL override in ms. Defaults to TOAST_TTL_MS (5000). Used by the
   * water-FAB toast (`ttlMs: 2000`) so a fast non-undoable confirmation
   * does not block the kalori-canonical 5 s undo affordance for every
   * other toast caller. Existing callers omit this field and continue to
   * inherit the 5 s default.
   */
  ttlMs?: number;
};

/**
 * Cross-tab broadcast payload (Task 5.2 F6 cross-tab additive diff).
 * The receiver-side `useCrossTabUndoQueue` hook unpacks this into a local
 * `pushToast({..., _fromBroadcast: true})` call. The originator includes
 * its `originTabId` so receivers can suppress self-receive.
 *
 * I1 (bugfix-tomi 2026-05-09-water-fab-ux Codex round 1) — extended to a
 * discriminated union with a `'dismiss'` variant. Optimistic toasts that
 * originate cross-tab MUST also retract cross-tab; otherwise sibling tabs
 * keep showing the false success for the full TTL window. Receivers
 * unknown to the new variant (older builds) drop it via the `'push'`-only
 * type guard in their handler — backwards compatible.
 */
export type UndoBroadcastMessage = UndoBroadcastPushMessage | UndoBroadcastDismissMessage;

export interface UndoBroadcastPushMessage {
  type: 'push';
  clientId: string;
  kind: UndoKind;
  description: string;
  originTabId: string;
  /**
   * Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — per-entry TTL
   * forwarded across tabs so a 2 s toast in tab A surfaces as a 2 s toast
   * in tab B. Optional for backwards compatibility with messages emitted
   * by older builds (receiver falls back to TOAST_TTL_MS when absent).
   */
  ttlMs?: number;
}

/**
 * I1 — emitted by `dismiss(clientId)` so sibling tabs that received the
 * originating push also drop the entry from their local stack. No `kind`
 * or `description` needed — the receiver matches purely on `clientId`.
 */
export interface UndoBroadcastDismissMessage {
  type: 'dismiss';
  clientId: string;
  originTabId: string;
}

const TAB_ID_KEY = 'kalori-tab-id';

function getTabId(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return 'ssr-no-tab-id';
  }
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    sessionStorage.setItem(TAB_ID_KEY, fresh);
    return fresh;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

let undoChannel: BroadcastChannel | null = null;

/**
 * Lazily-acquired channel reference. Reused across emits within a tab
 * (matches synthesis §3.4 module-level singleton). Closed by the
 * receiver-side hook's unmount only — emit-side never closes (the channel
 * outlives the store).
 */
function getUndoBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (undoChannel === null) {
    try {
      undoChannel = new BroadcastChannel(TOPICS.undo);
    } catch {
      return null;
    }
  }
  return undoChannel;
}

/** Test-only: reset the channel singleton between tests. */
export function __resetUndoBroadcastChannelForTests(): void {
  if (undoChannel !== null) {
    try {
      undoChannel.close();
    } catch {
      /* ignore */
    }
    undoChannel = null;
  }
}

export interface UndoQueueState {
  stack: UndoEntry[];
  pushToast: (input: PushToastInput) => string;
  clearOnNav: () => void;
  undoTop: () => Promise<void>;
  dismissTop: () => void;
  /**
   * Bug-1 (bugfix-tomi 2026-05-09-water-fab-ux) — programmatic removal
   * of a specific toast by `clientId`. Used by callers that show an
   * OPTIMISTIC success toast pre-await, then need to retract that exact
   * toast on POST failure (the water FAB). Differs from `dismissTop`:
   *
   *   - `dismissTop` only hides the newest non-dismissed entry; the
   *     entry stays in the stack and its commit timer keeps ticking.
   *   - `dismiss(clientId)` REMOVES the entry from the stack entirely
   *     and clears its timer (no commit/revert fires) — the toast did
   *     not represent a real persisted change, so no commit is owed.
   *
   * Cross-tab: dismissals ARE broadcast (I1, bugfix-tomi
   * 2026-05-09-water-fab-ux Codex round 1). `pushToast` already
   * propagates cross-tab so an optimistic success toast appears in
   * every tab; without a matching cross-tab dismiss, sibling tabs keep
   * showing the false success until the TTL self-heals (2s in the
   * water-FAB case). `dismissTop` and `clearOnNav` remain tab-local —
   * they do not represent retractions of an OPTIMISTIC mutation, so
   * sibling-tab UX inconsistency does not arise for them.
   *
   * The `_fromBroadcast` flag mirrors `pushToast`'s pattern: the
   * receiver hook routes inbound dismiss messages through this action
   * with the flag set, suppressing re-emission so each user-initiated
   * dismiss emits exactly once total (originator → all other tabs).
   */
  dismiss: (clientId: string, options?: { _fromBroadcast?: boolean }) => void;
  attachServerRowId: (clientId: string, serverRowId: string) => void;
  _expire: (toastId: string) => Promise<void>;
}

const MAX_STACK = 5;
const TOAST_TTL_MS = 5000;

function generateToastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useUndoQueueStore = create<UndoQueueState>((set, get) => ({
  stack: [],

  pushToast: (input) => {
    const toastId = generateToastId();
    // Bug-1 — resolve the per-call TTL once. Falsy values (0, undefined,
    // negative) fall back to the canonical 5 s default so a buggy caller
    // can't ship a zero-tick toast that auto-commits before render.
    const ttlMs = typeof input.ttlMs === 'number' && input.ttlMs > 0 ? input.ttlMs : TOAST_TTL_MS;
    const timerId = setTimeout(() => {
      void get()._expire(toastId);
    }, ttlMs);
    const entry: UndoEntry = {
      ...input,
      toastId,
      createdAt: Date.now(),
      visible: true,
      dismissed: false,
      timerId,
      ttlMs,
    };
    // FIFO eviction: if we're at capacity, force-commit the OLDEST before
    // appending the new entry.
    //
    // I4 — Clear the evicted timer synchronously so `_expire(oldestId)`
    // cannot fire a second commit after eviction. Attach `.catch` so a
    // rejected commit logs rather than leaking as an unhandled rejection
    // (in Next 16 this would trip the global error boundary).
    set((s) => {
      let nextStack = [...s.stack, entry];
      if (nextStack.length > MAX_STACK) {
        const [oldest, ...rest] = nextStack;
        if (oldest) {
          clearTimeout(oldest.timerId);
          oldest.commit().catch((err: unknown) => {
            console.warn('[useUndoQueueStore] eviction commit failed', err);
          });
        }
        nextStack = rest.concat([]);
        // Preserve the newly-pushed entry at the top of the kept rest.
        if (!nextStack.includes(entry)) nextStack.push(entry);
      }
      return { stack: nextStack };
    });

    // Task 5.2 — F6 cross-tab additive diff. Emit AFTER local FIFO eviction
    // so receivers see the same entry that this tab now holds. Skip when
    // `_fromBroadcast=true` (loop guard — receiver re-emit would echo).
    if (!input._fromBroadcast) {
      const channel = getUndoBroadcastChannel();
      if (channel !== null) {
        try {
          const msg: UndoBroadcastMessage = {
            type: 'push',
            clientId: input.clientId,
            kind: input.kind,
            description: input.description,
            originTabId: getTabId(),
            ttlMs,
          };
          channel.postMessage(msg);
        } catch {
          // Channel may have been closed by HMR or a sibling; surface
          // silently — the local toast still appears, only cross-tab
          // reveal is lost.
        }
      }
    }

    return toastId;
  },

  clearOnNav: () => {
    set((s) => ({
      stack: s.stack.map((e) => ({ ...e, visible: false })),
    }));
  },

  undoTop: async () => {
    const s = get();
    // Pick the newest visible-alive entry first; fall back to any entry.
    const top = [...s.stack].reverse().find((e) => e.visible) ?? s.stack[s.stack.length - 1];
    if (!top) return;
    clearTimeout(top.timerId);
    try {
      await top.revert();
    } finally {
      set((st) => ({
        stack: st.stack.filter((e) => e.toastId !== top.toastId),
      }));
    }
  },

  dismissTop: () => {
    set((s) => {
      // I3 — walk the stack from newest → oldest and dismiss the first
      // NOT-yet-dismissed entry. Checking `e.visible` would also dismiss
      // an already-clearOnNav-hidden entry, which is wrong: clearOnNav
      // hides for UI re-surface (F6) and is NOT a user dismissal.
      const idx = [...s.stack].reverse().findIndex((e) => !e.dismissed);
      if (idx === -1) return s;
      const realIdx = s.stack.length - 1 - idx;
      const nextStack = s.stack.slice();
      const current = nextStack[realIdx];
      if (current) {
        nextStack[realIdx] = { ...current, visible: false, dismissed: true };
      }
      return { stack: nextStack };
    });
  },

  // Bug-1 (bugfix-tomi 2026-05-09-water-fab-ux) — programmatic removal
  // by `clientId`. The water FAB pushes an optimistic success toast on
  // tap, then on POST failure must retract THAT exact toast and replace
  // it with an error toast. Removing the entry (not just dismissing it)
  // also clears the 2 s commit timer so no spurious commit fires after
  // the toast is gone — commit/revert closures for the water-FAB toast
  // are no-ops, but keeping the contract honest matters for future
  // callers that may pass real commit closures.
  dismiss: (clientId: string, options) => {
    let didRemove = false;
    set((s) => {
      const target = s.stack.find((e) => e.clientId === clientId);
      if (!target) return s;
      clearTimeout(target.timerId);
      didRemove = true;
      return {
        stack: s.stack.filter((e) => e.clientId !== clientId),
      };
    });

    // I1 (bugfix-tomi 2026-05-09-water-fab-ux Codex round 1) — cross-tab
    // dismiss propagation. Mirror the pushToast emit pattern:
    //   - Skip emit when `_fromBroadcast=true` (loop guard — receiver
    //     re-emit would cause N-tab fan-out spam).
    //   - Skip emit when nothing was removed locally (no-op `dismiss`
    //     on unknown id should not spam siblings).
    if (!didRemove) return;
    if (options?._fromBroadcast === true) return;
    const channel = getUndoBroadcastChannel();
    if (channel !== null) {
      try {
        const msg: UndoBroadcastMessage = {
          type: 'dismiss',
          clientId,
          originTabId: getTabId(),
        };
        channel.postMessage(msg);
      } catch {
        // Channel may have been closed by HMR or a sibling; surface
        // silently — local removal already happened, only sibling-tab
        // retraction is lost (the 2 s TTL still self-heals there).
      }
    }
  },

  attachServerRowId: (clientId, serverRowId) => {
    set((s) => ({
      stack: s.stack.map((e) => (e.clientId === clientId ? { ...e, serverRowId } : e)),
    }));
  },

  _expire: async (toastId) => {
    const entry = get().stack.find((e) => e.toastId === toastId);
    if (!entry) return;
    try {
      await entry.commit();
    } finally {
      set((s) => ({
        stack: s.stack.filter((e) => e.toastId !== toastId),
      }));
    }
  },
}));

/**
 * Selector: the newest live entry whose 5s window hasn't elapsed. Used by
 * `<UndoToastMount>` to render the top toast, re-surfacing still-alive
 * entries after a route nav (synthesis §2.4).
 *
 * I3 fix: `dismissed` entries are skipped permanently — a user who closed
 * the toast does not want it to re-appear on nav. `visible=false` alone is
 * NOT a skip signal because `clearOnNav()` uses visibility to wipe the UI
 * without suppressing re-surface on the destination route (F6 contract).
 */
export function selectLiveTop(stack: UndoEntry[]): UndoEntry | null {
  const now = Date.now();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    if (!entry) continue;
    if (entry.dismissed) continue;
    // Bug-1 — honor the per-entry TTL recorded at push time. Older entries
    // pre-dating the contract change have `ttlMs` defaulted to
    // TOAST_TTL_MS at push, so the fallback below never fires in practice;
    // it stays in for type-safety against external callers that might
    // hand-construct an UndoEntry (none today).
    const ttlMs = typeof entry.ttlMs === 'number' && entry.ttlMs > 0 ? entry.ttlMs : TOAST_TTL_MS;
    if (entry.createdAt + ttlMs > now) return entry;
  }
  return null;
}

export const UNDO_TOAST_TTL_MS = TOAST_TTL_MS;
export const UNDO_MAX_STACK = MAX_STACK;
