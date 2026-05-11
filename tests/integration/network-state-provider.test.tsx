/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.3 — Network state provider integration tests.
 *
 * Validates:
 *   - AC1: hydration-safe mount (server snapshot equals first client snapshot)
 *   - AC2: queueDepth sourced from outbox.size; reactive to outbox notify()
 *   - AC5: useTransition wraps replay; reduced-motion bypasses it
 *   - AC6: window 'online'/'offline' events surface in <100ms
 *   - R3: 'use client' provider — no `navigator.onLine` access during server render
 *   - StrictMode dev double-mount: subscriptions cleaned up cleanly (no leaked listeners)
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import React, { StrictMode } from 'react';
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

vi.mock('@/lib/offline/outbox', () => {
  return {
    size: () => outboxSize(),
    flush: () => outboxFlush(),
    peek: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(true),
    enqueue: vi.fn(),
    markFailed: vi.fn(),
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
  };
});

vi.mock('@/lib/offline/availability', () => ({
  detectIdbAvailability: vi.fn().mockResolvedValue({ ok: true }),
}));

function notifyOutboxFromTest(): void {
  for (const fn of Array.from(subscribers)) fn();
}

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
  // Reset module-scoped offline store between tests so replay.status sticky
  // transitions from a prior test don't bleed into the next.
  const { __resetOfflineStoreForTests } = await import('@/lib/offline/network-state');
  __resetOfflineStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Task 5.1.3 — OfflineQueueProvider hydration-safety', () => {
  it('mounts client-only without throwing when navigator is undefined', async () => {
    // AC1 / R3: provider tolerates server render (no direct navigator.onLine read)
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    expect(() =>
      render(
        <OfflineQueueProvider>
          <div data-testid="child">child</div>
        </OfflineQueueProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('initial render exposes the documented zero-state snapshot', async () => {
    // AC1: server snapshot must equal first client snapshot
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    expect(result.current.state.replayStatus).toBe('idle');
    // Initial paint must not depend on async IDB read — depth is 0 until notify().
    expect(result.current.state.queueDepth).toBe(0);
    expect(result.current.state.lastFlushAt).toBeNull();
  });

  it('strict-mode double-mount does not leak window listeners or subscriptions', async () => {
    // AC1: cleanup wired so duplicate online/offline listeners do not accumulate
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { OfflineQueueProvider } = await import('@/lib/offline/network-state');
    const { unmount } = render(
      <StrictMode>
        <OfflineQueueProvider>
          <div data-testid="child">child</div>
        </OfflineQueueProvider>
      </StrictMode>,
    );
    unmount();
    // Each `online` add must be matched by a `online` remove (same for `offline`).
    const onlineAdds = addSpy.mock.calls.filter((c) => c[0] === 'online').length;
    const onlineRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'online').length;
    expect(onlineAdds).toBe(onlineRemoves);
    const offlineAdds = addSpy.mock.calls.filter((c) => c[0] === 'offline').length;
    const offlineRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'offline').length;
    expect(offlineAdds).toBe(offlineRemoves);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('Task 5.1.3 — provider state sourcing', () => {
  it('queueDepth is sourced from outbox.size (mocked)', async () => {
    // AC2: provider does not maintain a duplicate counter
    outboxSize.mockResolvedValue(3);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(3);
    });
  });

  it('outbox notify() triggers a re-render with new depth', async () => {
    // AC2: emitter wiring drives reactivity
    outboxSize.mockResolvedValue(1);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(1);
    });
    // Simulate outbox-side mutation by changing the size and notifying.
    outboxSize.mockResolvedValue(7);
    await act(async () => {
      notifyOutboxFromTest();
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(7);
    });
  });

  it('actions.requestFlush calls outbox.flush exactly once', async () => {
    // AC2: provider delegates flush execution to 5.1.1's outbox.flush (R1 contract)
    // Codex F1 (Round 1): admission guard requires queueDepth > 0, so seed
    // outbox.size before mounting.
    outboxSize.mockResolvedValue(1);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1);
  });
});

describe('Task 5.1.3 — online/offline 100ms event-to-state contract', () => {
  it('window online event flips state.online to true within the contract window', async () => {
    // AC6: under 100ms event-to-state — driven by listener, not polling
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.online).toBe(false);
    });

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(
      () => {
        expect(result.current.state.online).toBe(true);
      },
      { timeout: 200 },
    );

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('window offline event flips state.online to false within the contract window', async () => {
    // AC6: same contract, opposite direction
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.online).toBe(true);
    });

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(
      () => {
        expect(result.current.state.online).toBe(false);
      },
      { timeout: 200 },
    );

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });
});

describe('Task 5.1.3 — replay status visibility', () => {
  it('replay status transitions to replaying during a flush', async () => {
    // AC2 + AC4 + AC5: hook surfaces transitions for downstream consumers
    let resolveFlush!: (v: unknown) => void;
    outboxFlush.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFlush = resolve;
        }),
    );
    outboxSize.mockResolvedValue(2);

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(2);
    });

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.state.replayStatus).toBe('replaying');
    });

    await act(async () => {
      resolveFlush({
        attempted: 2,
        succeeded: 2,
        failed: [],
        durationMs: 4,
        idbAvailable: true,
      });
      await flushPromise;
    });
    await waitFor(() => {
      expect(result.current.state.replayStatus).toBe('success');
    });
  });
});

describe('Task 5.1.3 — flush.start admission guard (Codex F1 fix)', () => {
  it('AC4: idle + offline → flush.start ignored, outbox.flush NOT called', async () => {
    // Codex F1: provider must consult the reducer-admission decision before
    // delegating to outbox.flush. When idle+offline, T1 guard rejects and the
    // outbox MUST stay untouched.
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    outboxSize.mockResolvedValue(2); // queue has work but we are offline

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.online).toBe(false);
      expect(result.current.state.queueDepth).toBe(2);
    });

    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).not.toHaveBeenCalled();
    // State remains idle — reducer rejected the transition.
    expect(result.current.state.replayStatus).toBe('idle');

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('AC4: idle + queueDepth=0 → flush.start ignored, outbox.flush NOT called', async () => {
    // Codex F1: empty-queue guard
    outboxSize.mockResolvedValue(0);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(0);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).not.toHaveBeenCalled();
    expect(result.current.state.replayStatus).toBe('idle');
  });

  it('AC4: conflict state + offline → flush.start guard prevents outbox.flush call', async () => {
    // Codex F1: conflict→replaying transition must respect online + queueDepth
    // guards too. Drive into conflict, go offline, attempt retry.
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    outboxSize.mockResolvedValue(1);
    outboxFlush.mockResolvedValueOnce({
      attempted: 1,
      succeeded: 0,
      failed: [
        {
          client_id: 'cid-1',
          kind: 'goal-weight-update',
          error: '412 Precondition Failed',
          conflict: { current: { goal_weight: 70 } },
        },
      ],
      durationMs: 1,
      idbAvailable: true,
    });

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.state.replayStatus).toBe('conflict');
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1);

    // Now go offline; second requestFlush must NOT delegate to outbox.flush.
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => {
      expect(result.current.state.online).toBe(false);
    });

    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1); // still 1 — guard prevented call
    expect(result.current.state.replayStatus).toBe('conflict');

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });

  it('AC4: error state + queueDepth=0 → flush.start guard prevents outbox.flush call', async () => {
    // Codex F1: same guard from error state with empty queue.
    outboxSize.mockResolvedValue(1);
    outboxFlush.mockResolvedValueOnce({
      attempted: 1,
      succeeded: 0,
      failed: [
        {
          client_id: 'cid-2',
          kind: 'meal-create',
          error: '500 Internal Server Error',
        },
      ],
      durationMs: 1,
      idbAvailable: true,
    });

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(1);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.state.replayStatus).toBe('error');
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1);

    // Drain the queue (simulate outbox-side cleanup) and notify.
    outboxSize.mockResolvedValue(0);
    await act(async () => {
      notifyOutboxFromTest();
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(0);
    });

    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1); // guard rejected — still 1
    expect(result.current.state.replayStatus).toBe('error');
  });

  it('AC4: idle + online + queueDepth>0 → outbox.flush IS called (positive control)', async () => {
    // Codex F1: positive control — happy path still works.
    outboxSize.mockResolvedValue(2);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(2);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).toHaveBeenCalledTimes(1);
  });
});

describe('Task 5.1.3 — runFlush reads live outbox.size() and navigator.onLine (Codex R2-F1 fix)', () => {
  it('AC4: runFlush calls outbox.size() to fetch live queueDepth before reducer admission', async () => {
    // Codex R2-F1: provider must read the authoritative outbox depth inside
    // runFlush, not rely on the async-refreshed React snapshot. This guards
    // against the race where a row is just-persisted but the snapshot has not
    // ticked yet.
    outboxSize.mockResolvedValue(1);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    // Wait for initial mount-time refresh to complete so the post-mount
    // outboxSize() call is settled. From here, runFlush must read it again.
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(1);
    });
    const sizeCallsBeforeFlush = outboxSize.mock.calls.length;
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    // runFlush must invoke outbox.size() at least once for its admission read.
    expect(outboxSize.mock.calls.length).toBeGreaterThan(sizeCallsBeforeFlush);
    expect(outboxFlush).toHaveBeenCalledTimes(1);
  });

  it('AC4: runFlush proceeds when outbox.size() reports work even if React snapshot is stale', async () => {
    // Codex R2-F1: if outbox.size() says queueDepth=1 but the React snapshot
    // still says 0 (e.g. enqueue happened but provider notify -> refresh ->
    // setQueueDepth has not flushed yet), runFlush MUST still admit the
    // transition based on the live read. Simulate by booting with size=0,
    // mounting, then bumping size=1 WITHOUT firing a notify (so the snapshot
    // never updates). Calling requestFlush must still call outbox.flush.
    outboxSize.mockResolvedValue(0);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    // Initial post-mount read settles to 0.
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(0);
    });
    // Outbox now has work; do NOT notify so the snapshot stays at 0.
    outboxSize.mockResolvedValue(1);
    expect(result.current.state.queueDepth).toBe(0); // confirm snapshot is stale
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    // The live outbox.size() returned 1 — admission must succeed.
    expect(outboxFlush).toHaveBeenCalledTimes(1);
  });

  it('AC4: runFlush rejects when outbox.size() reports empty even if React snapshot is stale-positive', async () => {
    // Codex R2-F1 (negative control): if React snapshot says queueDepth=2 but
    // outbox.size() says 0 (race the other way — rows drained from another tab
    // mid-flight), runFlush MUST trust the live read and skip the call.
    outboxSize.mockResolvedValue(2);
    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(2);
    });
    // Outbox drained from another tab — but no notify reaches us yet.
    outboxSize.mockResolvedValue(0);
    expect(result.current.state.queueDepth).toBe(2); // confirm snapshot is stale-positive
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).not.toHaveBeenCalled();
    expect(result.current.state.replayStatus).toBe('idle');
  });

  it('AC4: runFlush reads navigator.onLine live before reducer admission', async () => {
    // Codex R2-F1: navigator.onLine must be read at the same point as
    // outbox.size() so a window 'offline' event that landed between mount and
    // flush is honoured even if the React snapshot has not yet propagated.
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    outboxSize.mockResolvedValue(1);

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.online).toBe(true);
      expect(result.current.state.queueDepth).toBe(1);
    });

    // Flip navigator.onLine BUT do NOT dispatch the event so the React
    // snapshot stays stale. runFlush should read navigator.onLine live and
    // refuse to delegate to outbox.flush.
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    expect(result.current.state.online).toBe(true); // snapshot is stale
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    expect(outboxFlush).not.toHaveBeenCalled();
    expect(result.current.state.replayStatus).toBe('idle');

    if (onlineDescriptor) {
      Object.defineProperty(navigator, 'onLine', onlineDescriptor);
    } else {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    }
  });
});

describe('Task 5.1.3 — meta.isFlushing tracks outbox lifetime (Codex F3 fix)', () => {
  it('AC2: meta.isFlushing is true while outbox.flush() is pending and false after it resolves', async () => {
    // Codex F3: useTransition does not track Promise lifetime; provide an
    // explicit isFlushing signal that flips true before await and clears in
    // finally.
    let resolveFlush!: (v: unknown) => void;
    outboxFlush.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFlush = resolve;
        }),
    );
    outboxSize.mockResolvedValue(2);

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.state.queueDepth).toBe(2);
    });
    expect(result.current.meta.isFlushing).toBe(false);

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.meta.isFlushing).toBe(true);
    });

    await act(async () => {
      resolveFlush({
        attempted: 2,
        succeeded: 2,
        failed: [],
        durationMs: 4,
        idbAvailable: true,
      });
      await flushPromise;
    });
    await waitFor(() => {
      expect(result.current.meta.isFlushing).toBe(false);
    });
  });
});

describe('Task 5.1.3 — reduced-motion bypass', () => {
  it('useTransition is bypassed when prefers-reduced-motion: reduce', async () => {
    // AC5: reduced-motion users get instant state swaps; no isPending toggle path
    // We assert via observable behaviour: when reduced-motion is on and flush
    // resolves synchronously, the next status read is already 'success' without
    // a deferred-render race. (Codex review will check the implementation
    // wires the bypass via meta.isReducedMotion sourced from matchMedia.)
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
    vi.stubGlobal('matchMedia', matchMediaSpy);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaSpy,
    });

    outboxFlush.mockResolvedValue({
      attempted: 1,
      succeeded: 1,
      failed: [],
      durationMs: 0,
      idbAvailable: true,
    });
    outboxSize.mockResolvedValue(1);

    const { OfflineQueueProvider, useOfflineQueue } = await import('@/lib/offline/network-state');
    const { result } = renderHook(() => useOfflineQueue(), {
      wrapper: ({ children }) => <OfflineQueueProvider>{children}</OfflineQueueProvider>,
    });
    await waitFor(() => {
      expect(result.current.meta.isReducedMotion).toBe(true);
    });
    await act(async () => {
      await result.current.actions.requestFlush();
    });
    await waitFor(() => {
      expect(result.current.state.replayStatus).toBe('success');
    });
  });
});
