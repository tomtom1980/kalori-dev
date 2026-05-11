/**
 * AC1 (F6 cross-tab undo) — `useUndoQueueStore` cross-tab additive diff tests.
 *
 * Contract per synthesis §3.4 + §3.5 + briefing F6 cross-tab half:
 *   - `pushToast()` emits a UndoBroadcastMessage on `BroadcastChannel('kalori-undo')`
 *     UNLESS the input has `_fromBroadcast: true` (loop guard).
 *   - `useCrossTabUndoQueue()` (a React hook) listens for incoming push
 *     messages and routes them to local store via
 *     `pushToast({ ..., _fromBroadcast: true })` (so the receiver does NOT
 *     re-broadcast).
 *   - Topic name is verbatim `'kalori-undo'` (TOPICS.undo).
 *   - Within-tab semantics (5s timer, LIFO, cleared-on-nav) preserved.
 *
 * NOTE: BroadcastChannel under happy-dom delivers asynchronously; tests use
 * real timers + a `pollUntil` helper rather than `vi.useFakeTimers()` so the
 * channel-flush microtask has a chance to run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { TOPICS } from '@/lib/broadcast/topics';
import {
  useUndoQueueStore,
  __resetUndoBroadcastChannelForTests,
} from '@/lib/stores/useUndoQueueStore';

async function pollUntil<T>(
  fn: () => T | undefined,
  timeoutMs = 1000,
  intervalMs = 10,
): Promise<T> {
  const start = Date.now();
  while (true) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error('pollUntil timeout');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('AC1 — F6 cross-tab undo', () => {
  beforeEach(() => {
    useUndoQueueStore.setState({ stack: [] });
    sessionStorage.clear();
    __resetUndoBroadcastChannelForTests();
  });

  afterEach(() => {
    __resetUndoBroadcastChannelForTests();
  });

  it('uses verbatim topic string "kalori-undo"', () => {
    expect(TOPICS.undo).toBe('kalori-undo');
  });

  it('pushToast emits an UndoBroadcastMessage on TOPICS.undo by default', async () => {
    const messages: unknown[] = [];
    const observer = new BroadcastChannel(TOPICS.undo);
    observer.onmessage = (ev) => {
      messages.push(ev.data);
    };

    useUndoQueueStore.getState().pushToast({
      clientId: 'c1',
      kind: 'deleted',
      description: 'DELETED 1 EGG',
      serverRowId: null,
      commit: vi.fn(async () => {}),
      revert: vi.fn(async () => {}),
    });

    await pollUntil(() => (messages.length > 0 ? messages[0] : undefined), 1000);
    observer.close();

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const first = messages[0] as { type: string; clientId: string; kind: string };
    expect(first.type).toBe('push');
    expect(first.clientId).toBe('c1');
    expect(first.kind).toBe('deleted');
  });

  it('does NOT emit when _fromBroadcast=true (loop guard)', async () => {
    const messages: unknown[] = [];
    const observer = new BroadcastChannel(TOPICS.undo);
    observer.onmessage = (ev) => {
      messages.push(ev.data);
    };

    useUndoQueueStore.getState().pushToast({
      clientId: 'c2',
      kind: 'deleted',
      description: 'DELETED FROM BROADCAST',
      serverRowId: null,
      commit: vi.fn(async () => {}),
      revert: vi.fn(async () => {}),
      _fromBroadcast: true,
    });

    // Wait a moderate amount; messages should remain empty.
    await new Promise((r) => setTimeout(r, 100));
    observer.close();

    expect(messages).toHaveLength(0);
  });

  it('listener routes incoming push to local store with _fromBroadcast=true', async () => {
    const { useCrossTabUndoQueue } = await import('@/lib/stores/useUndoQueueStore.cross-tab');
    const { unmount } = renderHook(() => useCrossTabUndoQueue());

    // Sender side — different tab id (echo suppression).
    const sender = new BroadcastChannel(TOPICS.undo);
    sender.postMessage({
      type: 'push',
      clientId: 'cross-tab-1',
      kind: 'deleted',
      description: 'CROSS-TAB DELETE',
      originTabId: 'sender-tab-id-different',
    });

    const entry = await pollUntil(() => {
      const stack = useUndoQueueStore.getState().stack;
      return stack.find((e) => e.clientId === 'cross-tab-1');
    }, 1000);

    expect(entry).toBeDefined();
    expect(entry.description).toBe('CROSS-TAB DELETE');

    sender.close();
    unmount();
  });

  // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — per-call `ttlMs`
  // override must round-trip across the cross-tab broadcast so a 2 s toast
  // shown in tab A surfaces as a 2 s toast in tab B (not the 5 s default).
  it('ttlMs is included in the cross-tab broadcast payload', async () => {
    const messages: unknown[] = [];
    const observer = new BroadcastChannel(TOPICS.undo);
    observer.onmessage = (ev) => {
      messages.push(ev.data);
    };

    useUndoQueueStore.getState().pushToast({
      clientId: 'c-ttl',
      kind: 'delete-failed',
      description: '250 ml logged',
      serverRowId: null,
      commit: vi.fn(async () => {}),
      revert: vi.fn(async () => {}),
      ttlMs: 2000,
    });

    await pollUntil(() => (messages.length > 0 ? messages[0] : undefined), 1000);
    observer.close();

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const first = messages[0] as { type: string; clientId: string; ttlMs?: number };
    expect(first.type).toBe('push');
    expect(first.clientId).toBe('c-ttl');
    expect(first.ttlMs).toBe(2000);
  });

  it('a tab receiving a broadcast with ttlMs reconstructs the entry with that ttl', async () => {
    const { useCrossTabUndoQueue } = await import('@/lib/stores/useUndoQueueStore.cross-tab');
    const { unmount } = renderHook(() => useCrossTabUndoQueue());

    const sender = new BroadcastChannel(TOPICS.undo);
    sender.postMessage({
      type: 'push',
      clientId: 'cross-tab-ttl',
      kind: 'delete-failed',
      description: 'CROSS-TAB 2S TOAST',
      originTabId: 'sender-tab-id-different',
      ttlMs: 2000,
    });

    const entry = await pollUntil(() => {
      const stack = useUndoQueueStore.getState().stack;
      return stack.find((e) => e.clientId === 'cross-tab-ttl');
    }, 1000);

    expect(entry).toBeDefined();
    // Entry preserves the broadcast-supplied 2 s ttl rather than falling
    // back to the 5 s default — required so tab B's toast UX matches A's.
    expect(entry.ttlMs).toBe(2000);

    sender.close();
    unmount();
  });

  // I1 (bugfix-tomi 2026-05-09-water-fab-ux Codex round 1) — cross-tab
  // dismiss propagation. The water FAB pushes an OPTIMISTIC success toast
  // pre-await; on POST failure the active tab calls `dismiss(clientId)`
  // to retract it. Without cross-tab broadcast, sibling tabs continue
  // showing the false success toast for the full TTL window. Fix: extend
  // the BroadcastChannel envelope with a `'dismiss'` discriminant variant
  // so retraction propagates the same way the optimistic push did.
  describe('I1 — dismiss(clientId) cross-tab propagation', () => {
    it('dismiss(clientId) emits a dismiss broadcast on TOPICS.undo', async () => {
      const messages: unknown[] = [];
      const observer = new BroadcastChannel(TOPICS.undo);
      observer.onmessage = (ev) => {
        messages.push(ev.data);
      };

      // Push first so there is something to dismiss locally.
      useUndoQueueStore.getState().pushToast({
        clientId: 'optimistic-1',
        kind: 'delete-failed',
        description: '250 ml logged',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
        ttlMs: 2000,
      });

      // Wait for the push to round-trip to the observer.
      await pollUntil(() => (messages.length > 0 ? messages[0] : undefined), 1000);

      useUndoQueueStore.getState().dismiss('optimistic-1');

      // Wait for the dismiss frame.
      await pollUntil(() => {
        const dismissMsg = messages.find((m) => (m as { type?: string }).type === 'dismiss');
        return dismissMsg ?? undefined;
      }, 1000);
      observer.close();

      const dismissMsg = messages.find((m) => (m as { type?: string }).type === 'dismiss') as
        | { type: string; clientId: string; originTabId: string }
        | undefined;
      expect(dismissMsg).toBeDefined();
      expect(dismissMsg?.type).toBe('dismiss');
      expect(dismissMsg?.clientId).toBe('optimistic-1');
      expect(typeof dismissMsg?.originTabId).toBe('string');
    });

    it('sibling tab receiving a dismiss broadcast removes the matching entry', async () => {
      const { useCrossTabUndoQueue } = await import('@/lib/stores/useUndoQueueStore.cross-tab');
      const { unmount } = renderHook(() => useCrossTabUndoQueue());

      // Sender side — different tab id (echo suppression).
      const sender = new BroadcastChannel(TOPICS.undo);

      // First, push so the receiver tab has the entry in its local stack.
      sender.postMessage({
        type: 'push',
        clientId: 'cross-tab-dismiss-1',
        kind: 'delete-failed',
        description: '250 ml logged',
        originTabId: 'sender-tab-id-different',
        ttlMs: 2000,
      });

      const entry = await pollUntil(() => {
        const stack = useUndoQueueStore.getState().stack;
        return stack.find((e) => e.clientId === 'cross-tab-dismiss-1');
      }, 1000);
      expect(entry).toBeDefined();

      // Now broadcast a dismiss for the same clientId.
      sender.postMessage({
        type: 'dismiss',
        clientId: 'cross-tab-dismiss-1',
        originTabId: 'sender-tab-id-different',
      });

      // Receiver should remove the entry from its stack.
      await pollUntil(() => {
        const stack = useUndoQueueStore.getState().stack;
        return stack.find((e) => e.clientId === 'cross-tab-dismiss-1') === undefined
          ? true
          : undefined;
      }, 1000);

      expect(
        useUndoQueueStore.getState().stack.find((e) => e.clientId === 'cross-tab-dismiss-1'),
      ).toBeUndefined();

      sender.close();
      unmount();
    });

    it('dismiss broadcast for unknown clientId is a no-op (resilient)', async () => {
      const { useCrossTabUndoQueue } = await import('@/lib/stores/useUndoQueueStore.cross-tab');
      const { unmount } = renderHook(() => useCrossTabUndoQueue());

      // Pre-populate receiver with an UNRELATED entry so we can assert it
      // survives an unrelated dismiss broadcast unchanged.
      useUndoQueueStore.getState().pushToast({
        clientId: 'unrelated-entry',
        kind: 'deleted',
        description: 'UNRELATED',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
        _fromBroadcast: true, // suppress emission so this push is local-only
      });

      const sender = new BroadcastChannel(TOPICS.undo);
      sender.postMessage({
        type: 'dismiss',
        clientId: 'never-existed',
        originTabId: 'sender-tab-id-different',
      });

      // Give the message a chance to deliver and the handler to run.
      await new Promise((r) => setTimeout(r, 100));

      // Unrelated entry must remain — no error, no state change.
      const stack = useUndoQueueStore.getState().stack;
      expect(stack.find((e) => e.clientId === 'unrelated-entry')).toBeDefined();

      sender.close();
      unmount();
    });

    it('echo-suppression: a tab does NOT remove its own entry on receiving its own dismiss broadcast', async () => {
      // Mount the receiver in this tab; its `getTabId()` will produce a
      // sessionStorage UUID. The store's `dismiss` will broadcast with
      // `originTabId === ownTabId`, so the receiver must drop the message.
      const { useCrossTabUndoQueue } = await import('@/lib/stores/useUndoQueueStore.cross-tab');
      const { unmount } = renderHook(() => useCrossTabUndoQueue());

      useUndoQueueStore.getState().pushToast({
        clientId: 'self-echo-1',
        kind: 'delete-failed',
        description: '250 ml logged',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });

      // Local dismiss removes the entry locally AND emits a broadcast.
      // The receiver should ignore the self-broadcast (origin === own tab),
      // so the local removal is the only state change.
      useUndoQueueStore.getState().dismiss('self-echo-1');

      // Give the channel a frame to deliver the self-message.
      await new Promise((r) => setTimeout(r, 50));

      // Entry should be gone (from the local dismiss) — and no error from
      // a double-removal in the receiver.
      expect(
        useUndoQueueStore.getState().stack.find((e) => e.clientId === 'self-echo-1'),
      ).toBeUndefined();

      unmount();
    });
  });

  it('within-tab logic preserved: pushToast appends to stack and 5s commit fires', async () => {
    vi.useFakeTimers();
    try {
      const commit = vi.fn(async () => {});
      const id1 = useUndoQueueStore.getState().pushToast({
        clientId: 'c-a',
        kind: 'deleted',
        description: 'A',
        serverRowId: null,
        commit,
        revert: vi.fn(async () => {}),
      });
      const id2 = useUndoQueueStore.getState().pushToast({
        clientId: 'c-b',
        kind: 'deleted',
        description: 'B',
        serverRowId: null,
        commit: vi.fn(async () => {}),
        revert: vi.fn(async () => {}),
      });

      expect(id1).not.toBe(id2);
      expect(useUndoQueueStore.getState().stack).toHaveLength(2);

      // 5s expiry fires commit
      await vi.advanceTimersByTimeAsync(5001);
      await Promise.resolve();
      expect(commit).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
