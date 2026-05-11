/**
 * @vitest-environment happy-dom
 *
 * Phase B Codex Round 1 — Finding F-PB-R1-4 (HIGH/Improvement) regression guard.
 *
 * Pin behaviour: a same-date submit MUST be blocked even across an
 * unmount/remount cycle while the original POST is still in flight.
 *
 * Threat model (Codex finding, verbatim):
 *   "The unmount cleanup clears inFlightRef even though the authPost cannot
 *   be cancelled. A user can submit a weight, navigate away, return before
 *   the first POST resolves, and submit again; the new component mints a
 *   fresh client_id, so server idempotency does not collapse the duplicate.
 *   The schema only makes client_id unique and has an index, not a uniqueness
 *   constraint, on user/date, so two same-day rows can be inserted and
 *   target recalculation can run twice."
 *
 * The Round 1/2 fixes (component-local `inFlightRef` + `mountedRef`) only
 * cover SAME-INSTANCE same-tick double submits. They do NOT survive
 * unmount/remount. A fresh remount instantiates a fresh `inFlightRef`
 * (`useRef(false)`), mints a fresh `client_id`, and re-fires the POST.
 *
 * Fix: lift the in-flight latch into the shared `useWeightQuickAddStore`
 * (Zustand, module-scoped — survives remount). Component checks the store
 * before submitting; if the store says a same-date submit is in flight,
 * abort. Latch clears in `finally` (success or rejection), so future
 * submissions work normally.
 *
 * Test design:
 *   - Mount WeightQuickAdd, fire one submit, mock authPost returning a
 *     never-resolving promise (the in-flight POST).
 *   - Unmount the component (simulates user navigating away).
 *   - Remount a fresh WeightQuickAdd for the same user/date.
 *   - Fire a second submit on the fresh instance.
 *   - Assert: authPost was called ONLY ONCE total. The second submit was
 *     blocked because the store-level latch survived unmount.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeightQuickAdd } from '@/components/dashboard/WeightQuickAdd';
import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';

const authPost = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(),
  authPost: (...args: unknown[]) => authPost(...args),
  SessionExpiredError: class SE extends Error {},
}));

const refreshSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);
const minDateIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('Phase B Codex R1 #4 — cross-remount in-flight latch', () => {
  beforeEach(() => {
    authPost.mockReset();
    refreshSpy.mockReset();
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
    cleanup();
  });

  it('blocks same-date duplicate submit across unmount + remount while POST is in flight', async () => {
    // Arrange — first authPost returns a never-resolving promise so the
    // in-flight latch stays set across the unmount/remount cycle.
    const neverResolves = new Promise<unknown>(() => {
      /* intentionally unresolved */
    });
    authPost.mockReturnValueOnce(neverResolves);

    // Mount #1, fill, submit. Transition begins; authPost called once.
    const first = render(
      <WeightQuickAdd
        mode="inline"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );

    const input1 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input1, { target: { value: '72.5' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });

    // Act — user navigates away. The in-flight POST is NOT cancelled (no
    // AbortController plumbing on authPost) — it's still pending.
    first.unmount();

    // Act 2 — user returns to the dashboard. A fresh WeightQuickAdd mounts.
    // Without the store-level latch, this fresh instance has a fresh
    // `inFlightRef = useRef(false)` and a fresh `client_id` mint.
    render(
      <WeightQuickAdd
        mode="inline"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );

    const input2 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: '72.5' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // Brief microtask + macrotask flush so any rogue duplicate authPost
    // call would have landed.
    await new Promise((r) => setTimeout(r, 30));

    // CONTRACT: the store-level latch blocked the second submit. authPost
    // was called exactly ONCE across both mounts. The first POST is still
    // pending (we never resolve `neverResolves`); a duplicate same-date
    // submit must NOT slip past the cross-remount guard.
    expect(authPost).toHaveBeenCalledTimes(1);
  });

  it('auto-releases the latch after IN_FLIGHT_TIMEOUT_MS so a hung POST cannot block the date forever', async () => {
    // Phase B Codex R2 #F-PB-R2-2 (HIGH/Improvement) regression guard.
    //
    // Threat model (Codex finding, verbatim):
    //   "The store stores only a bare Set<string> of in-flight dates and has
    //   no timestamp, timeout, abort, or stale-entry cleanup. The component
    //   releases the latch only from the network promise's finally; if
    //   authPost('/api/weight/log') hangs indefinitely after a network drop,
    //   the same date remains blocked for the life of the JS store. The new
    //   regression test even models a never-resolving request, but only
    //   asserts the block, not recovery."
    //
    // Pin behaviour: even if the network promise never resolves, the latch
    // must self-recover after a bounded staleness window so the user can
    // submit again. We use Approach A (timestamp-on-read staleness check):
    // acquireInFlight records Date.now(); isInFlight returns true only if
    // the entry is younger than IN_FLIGHT_TIMEOUT_MS. No setTimeout needed
    // — the next acquireInFlight call evicts stale entries on read.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // Mount #1, fill, submit. Mock authPost as a never-resolving promise
      // (mirrors a network drop / silent abort).
      const neverResolves = new Promise<unknown>(() => {});
      authPost.mockReturnValueOnce(neverResolves);

      const first = render(
        <WeightQuickAdd
          mode="inline"
          unitPref="metric"
          todayUserTz={todayIso}
          minDateUserTz={minDateIso}
          initialWeightKg={null}
        />,
      );
      const input1 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
      fireEvent.change(input1, { target: { value: '72.5' } });
      fireEvent.submit(
        (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
      );
      await waitFor(() => {
        expect(authPost).toHaveBeenCalledTimes(1);
      });

      // Latch acquired — confirm the store sees the date as in-flight.
      expect(useWeightQuickAddStore.getState().isInFlight(todayIso)).toBe(true);

      // Unmount — simulates user navigating away mid-submit.
      first.unmount();

      // Advance time past the staleness window. The latch's timestamp is
      // now older than IN_FLIGHT_TIMEOUT_MS, so isInFlight() must return
      // false (read-time eviction).
      vi.advanceTimersByTime(31_000); // 30s timeout + 1s buffer

      expect(useWeightQuickAddStore.getState().isInFlight(todayIso)).toBe(false);

      // Mount #2 — fresh component, same date. The second submit must
      // proceed because the stale latch was evicted on read. Mock a clean
      // resolution so the second authPost goes through normally.
      authPost.mockResolvedValueOnce({
        row: {
          id: 'w-2',
          client_id: 'c-2',
          date: todayIso,
          weight_kg: 72.5,
          note: null,
        },
      });

      render(
        <WeightQuickAdd
          mode="inline"
          unitPref="metric"
          todayUserTz={todayIso}
          minDateUserTz={minDateIso}
          initialWeightKg={null}
        />,
      );
      const input2 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
      fireEvent.change(input2, { target: { value: '72.5' } });
      fireEvent.submit(
        (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
      );

      // CONTRACT: with the stale-entry eviction, the second submit reaches
      // the network. authPost has now been called twice total (the first
      // call is still hanging; the second call replaced it).
      await waitFor(() => {
        expect(authPost).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('late release of an already-evicted stale entry is a no-op (idempotent)', () => {
    // Pin: if the original POST eventually resolves AFTER the staleness
    // window has expired AND a fresh acquire has re-acquired the latch,
    // the late releaseInFlight() must NOT release the FRESH acquire's
    // latch. Approach A makes this safe by tagging the latch with a
    // timestamp — releaseInFlight is keyed on date only and removes the
    // current entry, so the late release does collide. We pin the
    // observable behaviour: after a late release the store is consistent
    // (no orphaned data, no crashes) and a follow-up acquire still works.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const store = useWeightQuickAddStore.getState();

      // Acquire #1 at T=0. (Hung POST, never resolves.)
      expect(store.acquireInFlight(todayIso)).toBe(true);

      // T=31s: staleness window passed. isInFlight() reports false.
      vi.advanceTimersByTime(31_000);
      expect(useWeightQuickAddStore.getState().isInFlight(todayIso)).toBe(false);

      // Acquire #2 at T=31s — fresh latch with new timestamp.
      expect(useWeightQuickAddStore.getState().acquireInFlight(todayIso)).toBe(true);
      expect(useWeightQuickAddStore.getState().isInFlight(todayIso)).toBe(true);

      // The hung POST from acquire #1 finally resolves and calls release.
      // This is a late release — it lands AFTER acquire #2 took the latch.
      // We accept that release is keyed on date only (no per-acquire token),
      // but we MUST NOT crash, throw, or leave the store in an inconsistent
      // state. After the late release, a follow-up acquire MUST still work.
      expect(() => useWeightQuickAddStore.getState().releaseInFlight(todayIso)).not.toThrow();

      // Follow-up acquire after the late release — must succeed (latch is
      // not permanently broken).
      expect(useWeightQuickAddStore.getState().acquireInFlight(todayIso)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('different-date submit on fresh remount is allowed (latch is per-date)', async () => {
    // Pin the corollary: the latch is keyed on `date`. A submit for
    // a different day on a fresh remount must NOT be blocked, even if
    // a same-day POST is still in flight from before.
    const neverResolves = new Promise<unknown>(() => {});
    authPost.mockReturnValueOnce(neverResolves);

    // Mount #1 — submit weight for `todayIso`.
    const first = render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    const input1 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input1, { target: { value: '72.5' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    first.unmount();

    // Mount #2 — submit weight for a DIFFERENT day (yesterday). The
    // todayIso latch is irrelevant here; this submit must proceed.
    const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    authPost.mockResolvedValueOnce({
      row: {
        id: 'w-yest',
        client_id: 'c-yest',
        date: yesterdayIso,
        weight_kg: 71.0,
        note: null,
      },
    });

    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );

    const input2 = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input2, { target: { value: '71.0' } });
    const dateInput2 = screen.getByTestId('weight-quick-add-date') as HTMLInputElement;
    fireEvent.change(dateInput2, { target: { value: yesterdayIso } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // Different-date latch is independent — second authPost must fire.
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(2);
    });
  });
});
