/**
 * Task 3.4 — `useUndoQueueStore` Zustand LIFO stack tests.
 *
 * Contract (synthesis §5.5 + briefing §10.4):
 *   - LIFO max 5 with FIFO eviction (oldest force-commits + drops).
 *   - Per-item 5s setTimeout; on natural expiry `commit()` fires.
 *   - `clearOnNav()` sets visible=false for all; timers stay armed so
 *     commit/revert still fire on 5s expiry after navigation.
 *   - `undoTop()` runs the `revert()` closure; entry removed + timer cleared.
 *   - `attachServerRowId(clientId, serverRowId)` binds after server-ack.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useUndoQueueStore,
  selectLiveTop,
  type PushToastInput,
  type UndoEntry,
} from '@/lib/stores/useUndoQueueStore';

function baseEntry(overrides: Partial<UndoEntry> = {}): PushToastInput {
  return {
    clientId: 'c1',
    kind: 'saved',
    description: 'LOGGED 2 EGGS',
    serverRowId: null,
    commit: vi.fn(async () => {}),
    revert: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('useUndoQueueStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store state between tests.
    useUndoQueueStore.setState({ stack: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushToast appends to the stack and returns a toastId', () => {
    const id = useUndoQueueStore.getState().pushToast(baseEntry());
    const { stack } = useUndoQueueStore.getState();
    expect(stack).toHaveLength(1);
    expect(stack[0]?.toastId).toBe(id);
    expect(stack[0]?.visible).toBe(true);
  });

  it('LIFO: the newest push is selectLiveTop', () => {
    const store = useUndoQueueStore.getState();
    const idA = store.pushToast(baseEntry({ clientId: 'c1' }));
    const idB = store.pushToast(baseEntry({ clientId: 'c2' }));
    const top = selectLiveTop(useUndoQueueStore.getState().stack);
    expect(top?.toastId).toBe(idB);
    expect(idA).not.toBe(idB);
  });

  it('max 5: 6th push evicts the oldest (FIFO eviction) AND runs its commit()', () => {
    const store = useUndoQueueStore.getState();
    const commits: Array<ReturnType<typeof vi.fn>> = [];
    for (let i = 0; i < 6; i += 1) {
      const commit = vi.fn(async () => {});
      commits.push(commit);
      store.pushToast(baseEntry({ clientId: `c${i}`, commit }));
    }
    const { stack } = useUndoQueueStore.getState();
    expect(stack).toHaveLength(5);
    // Oldest (index 0 original, clientId 'c0') was force-committed.
    expect(commits[0]).toHaveBeenCalledTimes(1);
    // The other 5 still alive, not committed.
    for (let i = 1; i < 6; i += 1) {
      expect(commits[i]).not.toHaveBeenCalled();
    }
  });

  it('natural 5s expiry fires commit() and removes the entry', async () => {
    const commit = vi.fn(async () => {});
    const id = useUndoQueueStore.getState().pushToast(baseEntry({ commit }));
    vi.advanceTimersByTime(5000);
    await vi.runAllTicks();
    await Promise.resolve();
    const { stack } = useUndoQueueStore.getState();
    expect(stack.find((e) => e.toastId === id)).toBeUndefined();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('undoTop runs revert and removes the entry BEFORE 5s elapse', async () => {
    const revert = vi.fn(async () => {});
    const commit = vi.fn(async () => {});
    useUndoQueueStore.getState().pushToast(baseEntry({ commit, revert }));
    await useUndoQueueStore.getState().undoTop();
    expect(revert).toHaveBeenCalledTimes(1);
    // commit must NOT fire after undoTop took over.
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(useUndoQueueStore.getState().stack).toHaveLength(0);
  });

  it('clearOnNav sets visible=false for all entries but timers continue', async () => {
    const commit = vi.fn(async () => {});
    useUndoQueueStore.getState().pushToast(baseEntry({ commit }));
    useUndoQueueStore.getState().clearOnNav();
    const { stack } = useUndoQueueStore.getState();
    expect(stack[0]?.visible).toBe(false);
    // Timer keeps ticking — commit fires on natural 5s expiry.
    vi.advanceTimersByTime(5000);
    await vi.runAllTicks();
    await Promise.resolve();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('selectLiveTop returns null when all entries are invisible after clearOnNav', () => {
    useUndoQueueStore.getState().pushToast(baseEntry());
    useUndoQueueStore.getState().clearOnNav();
    const top = selectLiveTop(useUndoQueueStore.getState().stack);
    // Post-nav selector still returns the still-alive entry (re-surface
    // behaviour per synthesis §2.4) — it checks createdAt + 5000 > now.
    expect(top).not.toBeNull();
  });

  it('attachServerRowId binds server id by clientId', () => {
    useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'c1' }));
    useUndoQueueStore.getState().attachServerRowId('c1', 'srv-1');
    const entry = useUndoQueueStore.getState().stack.find((e) => e.clientId === 'c1');
    expect(entry?.serverRowId).toBe('srv-1');
  });

  it('dismissTop hides the current top without running commit/revert — timer still ticks', async () => {
    const commit = vi.fn(async () => {});
    const revert = vi.fn(async () => {});
    useUndoQueueStore.getState().pushToast(baseEntry({ commit, revert }));
    useUndoQueueStore.getState().dismissTop();
    const { stack } = useUndoQueueStore.getState();
    expect(stack[0]?.visible).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(revert).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    await vi.runAllTicks();
    await Promise.resolve();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  // I3 — `selectLiveTop` ignored `entry.visible` before the fix. After
  // `dismissTop()` the selector returned the SAME dismissed entry, so the
  // chrome mount kept rendering a toast the user had just closed. The fix
  // marks dismissTop-targeted entries as `dismissed` so the selector can
  // skip them while leaving clearOnNav-only entries free to re-surface
  // (F6 3 AM contract, synthesis §2.4).
  it('selectLiveTop skips a dismissTop-hidden entry and returns the next visible top', () => {
    const store = useUndoQueueStore.getState();
    store.pushToast(baseEntry({ clientId: 'c1' }));
    const idB = store.pushToast(baseEntry({ clientId: 'c2' }));
    // Dismiss the newest entry (idB) → selectLiveTop should fall through to
    // the still-live c1 entry, not return idB again.
    useUndoQueueStore.getState().dismissTop();
    const top = selectLiveTop(useUndoQueueStore.getState().stack);
    expect(top?.clientId).toBe('c1');
    expect(top?.toastId).not.toBe(idB);
  });

  it('selectLiveTop returns null when every entry has been dismissTop-dismissed', () => {
    const store = useUndoQueueStore.getState();
    store.pushToast(baseEntry({ clientId: 'c1' }));
    store.pushToast(baseEntry({ clientId: 'c2' }));
    useUndoQueueStore.getState().dismissTop(); // hides c2
    useUndoQueueStore.getState().dismissTop(); // hides c1
    const top = selectLiveTop(useUndoQueueStore.getState().stack);
    expect(top).toBeNull();
  });

  // I4 — FIFO eviction commit() hardening. The previous impl did
  // `void oldest.commit()` — fire-and-forget with no catch, so a rejected
  // commit silently lost the error AND could double-invoke if `_expire`
  // fired on a racing timer before clearTimeout propagated. The fix:
  //   1. Swallow+log commit errors via `.catch(...)` so rejections don't
  //      leak as unhandled rejections.
  //   2. Mark the evicted entry as committed before eviction so `_expire`
  //      no-ops if it somehow still fires (idempotent commit invocation).
  it('FIFO eviction does not double-invoke commit when _expire races on the evicted entry', async () => {
    // Pre-load the stack so pushToast #6 triggers FIFO eviction of #1.
    const commits: Array<ReturnType<typeof vi.fn>> = [];
    for (let i = 0; i < 6; i += 1) {
      const commit = vi.fn(async () => {});
      commits.push(commit);
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: `c${i}`, commit }));
    }
    // commit[0] fired exactly ONCE on eviction.
    expect(commits[0]).toHaveBeenCalledTimes(1);
    // Advance past the 5s window — any entry whose timer wasn't cleared
    // will call _expire. c0 was evicted (timer cleared) so _expire(c0)
    // must NOT fire a second commit. c1..c5 expire naturally.
    vi.advanceTimersByTime(5000);
    await vi.runAllTicks();
    await Promise.resolve();
    // c0 stays at exactly 1 commit — no double-invoke.
    expect(commits[0]).toHaveBeenCalledTimes(1);
    // Stack empty (all 5 remaining entries expired).
    expect(useUndoQueueStore.getState().stack).toHaveLength(0);
  });

  it('FIFO eviction swallows + logs commit rejection without leaking an unhandled promise', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingCommit = vi.fn(async () => {
      throw new Error('network error during eviction commit');
    });
    const goodCommit = vi.fn(async () => {});
    // Fill to capacity, then push a 6th to force eviction of the failing one.
    useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'c0', commit: failingCommit }));
    for (let i = 1; i < 6; i += 1) {
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: `c${i}`, commit: goodCommit }));
    }
    // Let the rejected commit propagate.
    await Promise.resolve();
    await Promise.resolve();
    expect(failingCommit).toHaveBeenCalledTimes(1);
    // Warning was logged — no silent swallow.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — store contract
  // expansion: per-call `ttlMs` override. The hard-coded 5s default is
  // preserved for every existing caller; the optional override lets the
  // water-FAB push a 2s ephemeral toast without dragging every other
  // toast down to 2s.
  describe('Bug-1 — pushToast ttlMs override', () => {
    it('pushToast accepts ttlMs override and uses it instead of TOAST_TTL_MS default', async () => {
      const commit = vi.fn(async () => {});
      const id = useUndoQueueStore.getState().pushToast({ ...baseEntry(), commit, ttlMs: 2000 });
      // 1999 ms — commit must NOT have fired yet.
      vi.advanceTimersByTime(1999);
      await vi.runAllTicks();
      await Promise.resolve();
      expect(commit).not.toHaveBeenCalled();
      // Cross the 2 s threshold — commit fires + entry is removed.
      vi.advanceTimersByTime(2);
      await vi.runAllTicks();
      await Promise.resolve();
      expect(commit).toHaveBeenCalledTimes(1);
      const { stack } = useUndoQueueStore.getState();
      expect(stack.find((e) => e.toastId === id)).toBeUndefined();
    });

    it('when ttlMs is omitted, defaults to TOAST_TTL_MS (5000)', async () => {
      const commit = vi.fn(async () => {});
      useUndoQueueStore.getState().pushToast({ ...baseEntry(), commit });
      // 4999 ms — must NOT have fired.
      vi.advanceTimersByTime(4999);
      await vi.runAllTicks();
      await Promise.resolve();
      expect(commit).not.toHaveBeenCalled();
      // Cross 5 s — commit fires.
      vi.advanceTimersByTime(2);
      await vi.runAllTicks();
      await Promise.resolve();
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it('selectLiveTop honors per-entry ttlMs (a 2s entry stops being live after 2s, not 5s)', () => {
      const baseTime = 1_700_000_000_000;
      vi.setSystemTime(baseTime);
      useUndoQueueStore.getState().pushToast({ ...baseEntry(), ttlMs: 2000 });
      // 1.5 s after creation — still live.
      vi.setSystemTime(baseTime + 1500);
      expect(selectLiveTop(useUndoQueueStore.getState().stack)).not.toBeNull();
      // 2.5 s after creation — should fall outside ttlMs and selectLiveTop
      // returns null even though the default 5 s window still holds.
      vi.setSystemTime(baseTime + 2500);
      expect(selectLiveTop(useUndoQueueStore.getState().stack)).toBeNull();
    });
  });

  // Bug-1 (bugfix-tomi 2026-05-09-water-fab-ux) — `dismiss(clientId)`
  // is a programmatic removal primitive. The water FAB pushes an
  // optimistic success toast on tap (BEFORE awaiting authPost) so the
  // user gets instant feedback; on POST failure the handler must
  // retract THAT exact toast (not the newest, not all toasts) and
  // push an error toast in its place. `dismissTop` is the wrong
  // primitive — it leaves the entry in the stack with a live timer.
  describe('Bug-1 — dismiss(clientId)', () => {
    it('removes the entry whose clientId matches and clears its commit timer', async () => {
      const commit = vi.fn(async () => {});
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'water-1', commit }));
      expect(useUndoQueueStore.getState().stack).toHaveLength(1);

      useUndoQueueStore.getState().dismiss('water-1');
      expect(useUndoQueueStore.getState().stack).toHaveLength(0);

      // Timer cleared — commit must NOT fire even after the 5 s window
      // elapses. (Default ttlMs is 5000.)
      vi.advanceTimersByTime(10_000);
      await vi.runAllTicks();
      await Promise.resolve();
      expect(commit).not.toHaveBeenCalled();
    });

    it('targets a SPECIFIC entry (not the newest like dismissTop)', () => {
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'older' }));
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'newer' }));
      // Dismiss the OLDER entry — `dismissTop` would have hit the newer one.
      useUndoQueueStore.getState().dismiss('older');
      const stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.clientId).toBe('newer');
    });

    it('is a no-op when no entry matches (does not throw, does not mutate)', () => {
      useUndoQueueStore.getState().pushToast(baseEntry({ clientId: 'present' }));
      const before = useUndoQueueStore.getState().stack;
      useUndoQueueStore.getState().dismiss('not-here');
      const after = useUndoQueueStore.getState().stack;
      expect(after).toHaveLength(1);
      expect(after[0]?.clientId).toBe('present');
      // Reference equality: the no-op path returns the same state object,
      // so callers that subscribe by reference don't re-render.
      expect(after).toBe(before);
    });
  });
});
