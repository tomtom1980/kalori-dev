/**
 * @vitest-environment happy-dom
 *
 * Task B.4 Codex Round 1 — Finding #3 (MEDIUM/Improvement) regression guard.
 *
 * Pin behaviour: the success branch in `WeightQuickAdd` MUST issue
 * `router.refresh()` AFTER the polite live-region announcement has had time
 * to flush. The shared announcer (`lib/a11y/announce.ts`) debounces writes
 * by 150ms — a synchronous `router.refresh()` call would race with that
 * debounce and may hand the screen reader DOM that has already been mutated
 * by the RSC re-stream, dropping the polite "Weight saved." message.
 *
 * Before fix:
 *   announcePolite(success) → 150ms timer ticking
 *   router.refresh() ← fires NOW, RSC may re-stream + mutate DOM mid-debounce
 *   ... 150ms later: announcer writes to DOM (may be in stale region)
 *
 * After fix (Option A — `setTimeout(refresh, 200)` or equivalent):
 *   announcePolite(success) → 150ms timer
 *   ... 150ms later: announcer flushes message
 *   ... 50ms later (200ms total): router.refresh() fires
 *
 * Contract:
 *   1. `router.refresh` is NOT called synchronously after `authPost`
 *      resolves. (Specifically — within 50ms of resolution, the spy must
 *      have 0 calls. This proves the deferral is in place rather than
 *      a fire-and-forget call.)
 *   2. Within 400ms (well past 150ms debounce + 50ms safety buffer),
 *      `router.refresh` HAS been called exactly once.
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

describe('B.4 Codex Round 1 #3 — refresh ordering past announcer debounce', () => {
  beforeEach(() => {
    authPost.mockReset();
    refreshSpy.mockReset();
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('router.refresh() is deferred past the 150ms announcer debounce window', async () => {
    authPost.mockResolvedValueOnce({
      row: { id: 'w-ok', client_id: 'c-ok', date: todayIso, weight_kg: 72.5, note: null },
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

    const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '72.5' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // Wait for authPost to be called + resolve. The transition's success
    // branch enters here.
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });

    // Within 50ms of authPost resolving, router.refresh() must NOT have
    // fired yet — the deferral keeps it past the 150ms debounce window.
    // Sleep 50ms then assert refresh has not fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(refreshSpy).not.toHaveBeenCalled();

    // Within 400ms total (well past 150ms debounce + safety buffer),
    // router.refresh() HAS been called exactly once.
    await waitFor(
      () => {
        expect(refreshSpy).toHaveBeenCalledTimes(1);
      },
      { timeout: 400 },
    );
  });
});

// ----------------------------------------------------------------------------
// Task B.4 Codex Round 2 — Finding #2 (HIGH/Critical) regression guard.
//
// Pin behaviour: the success branch's deferred `router.refresh()` MUST NOT
// fire on a component that has already unmounted. Sequence the test catches:
//
//   1. User fills the form and submits.
//   2. User navigates away (e.g., clicks a nav link) BEFORE the POST resolves.
//   3. The component unmounts. Pending toast/ember timers are cleared by the
//      Round 1 cleanup effect.
//   4. The in-flight `authPost` resolves (typed transition was already in
//      flight; React doesn't cancel it).
//   5. The success branch fires on the destroyed component, and the previous
//      Round 1 fix would still SCHEDULE a `setTimeout(refresh, 200)` — there
//      was nothing left to clear, because cleanup already ran in step 3.
//   6. 200ms later, `router.refresh()` lands on whatever route the user is
//      on now — leaking a stale refresh into another page.
//
// Round 2 fix uses a `mountedRef` checked at BOTH the schedule site AND the
// timer-callback site (belt-and-suspenders), with cleanup setting the ref to
// `false` so neither path runs.
// ----------------------------------------------------------------------------
describe('B.4 Codex Round 2 #2 — post-unmount refresh safety', () => {
  beforeEach(() => {
    authPost.mockReset();
    refreshSpy.mockReset();
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('does NOT call router.refresh() if the component unmounts before authPost resolves', async () => {
    // Arrange — authPost returns a manually-controlled deferred promise so we
    // can choose precisely when it resolves (after unmount).
    let resolveAuthPost!: (value: {
      row: { id: string; client_id: string; date: string; weight_kg: number; note: null };
    }) => void;
    const authPostPromise = new Promise<{
      row: { id: string; client_id: string; date: string; weight_kg: number; note: null };
    }>((resolve) => {
      resolveAuthPost = resolve;
    });
    authPost.mockReturnValueOnce(authPostPromise);

    const { unmount } = render(
      <WeightQuickAdd
        mode="inline"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );

    // Act 1 — submit a valid weight (in-flight transition starts).
    const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '72.5' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // Wait for authPost to be invoked (transition has begun, promise pending).
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });

    // Act 2 — unmount BEFORE authPost resolves.
    unmount();
    cleanup();

    // Act 3 — now resolve the in-flight authPost. The success branch will
    // fire on the destroyed component.
    resolveAuthPost({
      row: {
        id: 'w-late',
        client_id: 'c-late',
        date: todayIso,
        weight_kg: 72.5,
        note: null,
      },
    });

    // Wait past the 200ms refresh-deferral window + a generous safety margin
    // (300ms total — the timer would have fired by now if it had been
    // scheduled).
    await new Promise((r) => setTimeout(r, 500));

    // Assert — `router.refresh()` was NEVER called. The mountedRef guard at
    // BOTH the schedule site and the timer-callback site prevented it.
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
