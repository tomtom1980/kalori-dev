'use client';

/**
 * F6 cross-tab undo listener (Task 5.2).
 *
 * Mounted exactly once via `<UndoCrossTabBridge />` (Phase 2B) adjacent to
 * `<UndoToastMount />`. Installs a BroadcastChannel('kalori-undo') listener
 * and routes each incoming UndoBroadcastMessage through the local store via
 * `pushToast({..., _fromBroadcast: true})`. The flag prevents the receiver
 * from re-broadcasting (loop guard).
 *
 * MVP scope: RECEIVE-ONLY. Tab B sees the toast; its UNDO clicks restore via
 * the existing server roundtrip. Bidirectional cross-tab UNDO restore (tab
 * B's undo synchronously updates tab A's local toast UI) is a deferred
 * follow-up (Conflict #9b).
 *
 * Echo suppression: each tab's `kalori-tab-id` (sessionStorage UUID) is
 * compared to the inbound message's `originTabId`; matches are dropped.
 *
 * HMR cleanup: `useEffect` returns a cleanup that unconditionally calls
 * `channel.close()` and removes the listener. Single instance per `(app)`
 * layout mount.
 */
import { useEffect } from 'react';

import { TOPICS } from '@/lib/broadcast/topics';
import { useUndoQueueStore, type UndoBroadcastMessage } from '@/lib/stores/useUndoQueueStore';

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

/**
 * Hook — installs a kalori-undo channel listener that routes inbound
 * push messages to the local store with `_fromBroadcast: true`.
 *
 * Receiver-side `commit` and `revert` are no-ops because the originating
 * tab is the owner of the underlying server mutation; bidirectional
 * cross-tab restore is out of MVP scope. The local toast is purely a
 * VIEW of the originator's pending mutation.
 */
export function useCrossTabUndoQueue(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const ownTabId = getTabId();
    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(TOPICS.undo);
    } catch {
      return;
    }

    const handler = (ev: MessageEvent): void => {
      const data = ev.data as Partial<UndoBroadcastMessage> | null;
      if (!data || typeof data.originTabId !== 'string') return;
      if (data.originTabId === ownTabId) return; // echo suppression

      if (data.type === 'push') {
        if (!data.clientId || !data.kind || typeof data.description !== 'string') return;
        // No-op commit/revert — receiving tab does not own the server side
        // of the originating mutation. The toast is a passive reveal only
        // (MVP — Conflict #9b).
        // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — forward the
        // originator's ttlMs so a 2 s water-FAB toast in tab A surfaces as
        // a 2 s toast in tab B, not the 5 s default. Older messages that
        // omit `ttlMs` reconstruct on the default via the store's fallback.
        useUndoQueueStore.getState().pushToast({
          clientId: data.clientId,
          kind: data.kind,
          description: data.description,
          serverRowId: null,
          commit: async () => {
            /* receiver no-op */
          },
          revert: async () => {
            /* receiver no-op */
          },
          _fromBroadcast: true,
          ...(typeof data.ttlMs === 'number' ? { ttlMs: data.ttlMs } : {}),
        });
        return;
      }

      if (data.type === 'dismiss') {
        if (!data.clientId) return;
        // I1 (bugfix-tomi 2026-05-09-water-fab-ux Codex round 1) — sibling
        // retraction. The receiver-side dismiss is no-op when the entry
        // never landed locally (the store's `dismiss` is no-op for unknown
        // ids — backwards-compatible with builds that didn't propagate the
        // originating push). `_fromBroadcast: true` suppresses re-emit so
        // each user-initiated dismiss emits exactly once total.
        useUndoQueueStore.getState().dismiss(data.clientId, { _fromBroadcast: true });
        return;
      }
    };

    channel.addEventListener('message', handler);

    return () => {
      try {
        channel?.removeEventListener('message', handler);
        channel?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
}
