/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.3 — `useOutbox` hook integration tests.
 *
 * Hook is the single consumer entry-point per briefing §3 + §15. Components
 * consume `{ online, queueDepth, lastFlushAt, replayStatus, conflicts, actions, meta }`
 * — they MUST NOT read from `lib/offline/outbox` directly.
 *
 * AC2 / AC3 / AC5 / AC6 covered.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subscribers = new Set<() => void>();
const outboxSize = vi.fn().mockResolvedValue(0);
const outboxFlush = vi.fn().mockResolvedValue({
  attempted: 0,
  succeeded: 0,
  failed: [],
  durationMs: 0,
  idbAvailable: true,
});
const outboxRemove = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/offline/outbox', () => ({
  size: () => outboxSize(),
  flush: () => outboxFlush(),
  peek: vi.fn().mockResolvedValue([]),
  remove: (clientId: string) => outboxRemove(clientId),
  enqueue: vi.fn(),
  markFailed: vi.fn(),
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  },
}));

vi.mock('@/lib/offline/availability', () => ({
  detectIdbAvailability: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(async () => {
  subscribers.clear();
  outboxSize.mockReset().mockResolvedValue(0);
  outboxFlush.mockReset().mockResolvedValue({
    attempted: 0,
    succeeded: 0,
    failed: [],
    durationMs: 0,
    idbAvailable: true,
  });
  outboxRemove.mockReset().mockResolvedValue(true);
  const { __resetOfflineStoreForTests } = await import('@/lib/offline/network-state');
  __resetOfflineStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Task 5.1.3 — useOutbox single source of truth', () => {
  it('returns the documented hook shape: state + actions + meta', async () => {
    // AC2 + AC3: hook contract — exactly the briefing §3 fields
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    expect(result.current).toHaveProperty('online');
    expect(result.current).toHaveProperty('queueDepth');
    expect(result.current).toHaveProperty('lastFlushAt');
    expect(result.current).toHaveProperty('replayStatus');
    expect(result.current).toHaveProperty('conflicts');
    expect(result.current).toHaveProperty('actions');
    expect(typeof result.current.actions.requestFlush).toBe('function');
    expect(typeof result.current.actions.resolveConflict).toBe('function');
    expect(typeof result.current.actions.retry).toBe('function');
    expect(result.current.meta).toBeDefined();
  });

  it('does NOT leak outbox internals (no peek/enqueue/markFailed/clear)', async () => {
    // AC3: consumers cannot reach outbox internals through the hook
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    const ret = result.current as unknown as Record<string, unknown>;
    expect(ret).not.toHaveProperty('peek');
    expect(ret).not.toHaveProperty('enqueue');
    expect(ret).not.toHaveProperty('markFailed');
    expect(ret).not.toHaveProperty('clear');
    expect(ret).not.toHaveProperty('size');
  });

  it('throws (or surfaces a clear error) without a provider', async () => {
    // AC3: the hook is mounted-provider-only; the tree without a provider
    // must produce a clearly diagnostic failure.
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    expect(() => renderHook(() => useOutbox())).toThrow(/OfflineQueueProvider/i);
  });

  it('two sibling consumers receive the same shape', async () => {
    // AC3: single source of truth across consumers
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    outboxSize.mockResolvedValue(2);
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <OfflineQueueProvider>{children}</OfflineQueueProvider>
    );
    const a = renderHook(() => useOutbox(), { wrapper: Wrapper });
    const b = renderHook(() => useOutbox(), { wrapper: Wrapper });
    await waitFor(() => {
      expect(a.result.current.queueDepth).toBe(2);
      expect(b.result.current.queueDepth).toBe(2);
    });
    expect(a.result.current.replayStatus).toBe(b.result.current.replayStatus);
    expect(a.result.current.online).toBe(b.result.current.online);
  });
});

describe('Task 5.1.3 — hook reactivity', () => {
  it('replay status transitions are visible to consumers', async () => {
    // AC2 + AC4: state transitions surface through the hook
    let resolveFlush!: (v: unknown) => void;
    outboxFlush.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFlush = resolve;
        }),
    );
    outboxSize.mockResolvedValue(1);

    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    // Wait for the post-mount outbox.size() read to populate queueDepth
    // so the T1 guard (queueDepth > 0) passes.
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.replayStatus).toBe('replaying');
    });
    await act(async () => {
      resolveFlush({
        attempted: 1,
        succeeded: 1,
        failed: [],
        durationMs: 1,
        idbAvailable: true,
      });
      await flushPromise;
    });
    await waitFor(() => {
      expect(result.current.replayStatus).toBe('success');
    });
  });

  it('100ms event-to-state contract for offline transition', async () => {
    // AC6: window offline event surfaces in <=100ms via listener (no polling)
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });

    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.online).toBe(true);
    });

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(
      () => {
        expect(result.current.online).toBe(false);
      },
      { timeout: 150 },
    );

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('actions.retry forwards to outbox.flush', async () => {
    // AC2: retry action is a thin wrapper for downstream UI (5.1.5 chip).
    // Codex F1 (Round 1): admission guard requires queueDepth > 0; seed it.
    outboxSize.mockResolvedValue(1);
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.retry();
    });
    expect(outboxFlush).toHaveBeenCalled();
  });
});

describe('Task 5.1.3 — resolveConflict surface (Codex F2 fix)', () => {
  it("AC2: resolveConflict('use-current') drops the local row and triggers a flush", async () => {
    // Positive control — 'use-current' still calls outbox.remove + outbox.flush
    outboxSize.mockResolvedValue(1);
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.resolveConflict('cid-1', 'use-current');
    });
    expect(outboxRemove).toHaveBeenCalledWith('cid-1');
    expect(outboxFlush).toHaveBeenCalled();
  });

  it("AC2: resolveConflict('use-current') stays in conflict and skips flush when outbox.remove returns false (Codex R2-F2)", async () => {
    // Codex R2-F2: outbox.remove returns false when the row is absent OR the
    // IDB write failed. In that case the conflicted row is still persisted
    // with the same immutable client_id/body, so a runFlush would resend the
    // stale request and recreate the 412 loop after the user chose
    // server-wins. Provider MUST honour the boolean and skip the flush.
    outboxSize.mockResolvedValue(1);
    // Drive into conflict so the row is recorded.
    outboxFlush.mockResolvedValueOnce({
      attempted: 1,
      succeeded: 0,
      failed: [
        {
          client_id: 'cid-fail-remove',
          kind: 'goal-weight-update',
          error: '412 Precondition Failed',
          conflict: { current: { goal_weight: 70 } },
        },
      ],
      durationMs: 1,
      idbAvailable: true,
    });
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.replayStatus).toBe('conflict');
    });
    const flushCallsBefore = outboxFlush.mock.calls.length;

    // Mock outbox.remove to simulate a failed write (returns false).
    outboxRemove.mockResolvedValueOnce(false);

    await act(async () => {
      await result.current.actions.resolveConflict('cid-fail-remove', 'use-current');
    });

    // Removal was attempted...
    expect(outboxRemove).toHaveBeenCalledWith('cid-fail-remove');
    // ...but no flush should follow because the row is still queued.
    expect(outboxFlush).toHaveBeenCalledTimes(flushCallsBefore);
    // State remains in conflict — UI can surface "removal failed" and retry.
    expect(result.current.replayStatus).toBe('conflict');
  });

  it("AC2: resolveConflict('use-current') flushes when outbox.remove returns true (Codex R2-F2 positive control)", async () => {
    // Codex R2-F2 positive control: when outbox.remove returns true the row
    // is gone and runFlush must proceed (it will move state out of conflict
    // via the standard flush.complete reducer path).
    outboxSize.mockResolvedValue(1);
    outboxFlush.mockResolvedValueOnce({
      attempted: 1,
      succeeded: 0,
      failed: [
        {
          client_id: 'cid-ok-remove',
          kind: 'goal-weight-update',
          error: '412 Precondition Failed',
          conflict: { current: { goal_weight: 70 } },
        },
      ],
      durationMs: 1,
      idbAvailable: true,
    });
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.replayStatus).toBe('conflict');
    });
    const flushCallsBefore = outboxFlush.mock.calls.length;

    // Removal succeeds (default mock returns true) — flush MUST follow.
    outboxRemove.mockResolvedValueOnce(true);

    await act(async () => {
      await result.current.actions.resolveConflict('cid-ok-remove', 'use-current');
    });
    expect(outboxRemove).toHaveBeenCalledWith('cid-ok-remove');
    expect(outboxFlush).toHaveBeenCalledTimes(flushCallsBefore + 1);
  });

  it("AC2: resolveConflict('keep-offline') is no longer accepted (no auto-flush, no infinite loop)", async () => {
    // Codex F2: 'keep-offline' is removed from the public API to prevent the
    // 412→412 infinite-loop hazard. Calling it should be a no-op (or rejected
    // by the type system at compile-time). Runtime guard: outbox.flush must
    // NOT be called and state must NOT advance to replaying.
    outboxSize.mockResolvedValue(1);
    // Drive the provider into 'conflict' first so we can verify the action
    // does not silently re-flush from there.
    outboxFlush.mockResolvedValueOnce({
      attempted: 1,
      succeeded: 0,
      failed: [
        {
          client_id: 'cid-keep',
          kind: 'goal-weight-update',
          error: '412 Precondition Failed',
          conflict: { current: { goal_weight: 70 } },
        },
      ],
      durationMs: 1,
      idbAvailable: true,
    });
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.replayStatus).toBe('conflict');
    });
    const flushCallsBefore = outboxFlush.mock.calls.length;
    const removeCallsBefore = outboxRemove.mock.calls.length;

    // Cast through unknown because the public type narrowed to 'use-current'
    // only. This test guards the runtime behaviour for any caller that still
    // passes the legacy string at the type-system boundary.
    await act(async () => {
      await (
        result.current.actions.resolveConflict as unknown as (
          id: string,
          r: string,
        ) => Promise<void>
      )('cid-keep', 'keep-offline');
    });

    // No new flush attempt, no row removal, status remains conflict.
    expect(outboxFlush).toHaveBeenCalledTimes(flushCallsBefore);
    expect(outboxRemove).toHaveBeenCalledTimes(removeCallsBefore);
    expect(result.current.replayStatus).toBe('conflict');
  });
});

describe('Task 5.1.3 — reduced-motion path', () => {
  it('meta.isReducedMotion is true when matchMedia reports reduce', async () => {
    // AC5: reduced-motion is surfaced for downstream UI to drop transition-only animations
    const matchMediaSpy = vi.fn().mockImplementation((q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    });

    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { useOutbox } = await import('@/lib/offline/use-outbox');
    const { result } = renderHook(() => useOutbox(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.meta.isReducedMotion).toBe(true);
    });
  });
});
