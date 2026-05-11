/**
 * @vitest-environment happy-dom
 *
 * Task B.4 Codex Round 1 — Finding #1 (HIGH/Critical) regression guard.
 *
 * Pin behaviour: two synchronous `form.requestSubmit()` calls in the same
 * tick must result in:
 *   - Exactly ONE `authPost` invocation (no second POST against a different
 *     freshly-minted client_id, which would slip past the unique-by-client_id
 *     constraint and insert two rows for the same user/date).
 *   - Exactly ONE `router.refresh()` call (no double RSC re-stream).
 *
 * Why this test exists: the previous in-flight guard
 *   `if (busy) return;`
 * was racy — `setBusy(true)` was inside `startTransition`, so two same-tick
 * submissions both observed `busy === false` and both proceeded. The fix is
 * a synchronous `useRef<boolean>` latch checked BEFORE entering the
 * transition. The latch resets in `finally` (success) or in the synchronous
 * abort path (impossible reads, validation failures).
 *
 * Test design:
 *   - `authPost` returns a slow-resolving promise (200ms) so the second
 *     submit happens BEFORE the first resolves — the worst-case window
 *     for the race.
 *   - We submit twice in the same synchronous tick via
 *     `form.requestSubmit()`. React's batching does not protect us here
 *     because `requestSubmit` triggers a synchronous form `submit` event;
 *     two consecutive calls produce two `onSubmit` invocations.
 *   - Asserting "exactly 1" rather than "at most 1" pins the contract:
 *     the second call MUST be a no-op, not a no-op-after-network.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('B.4 Codex Round 1 #1 — same-tick double-submit guard', () => {
  beforeEach(() => {
    authPost.mockReset();
    refreshSpy.mockReset();
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('two synchronous requestSubmit() calls → 1 authPost call + 1 router.refresh() call', async () => {
    // Slow-resolving authPost so the second requestSubmit fires while the
    // first is still in-flight. 50ms is enough for the same-tick second
    // submit to land before the first resolves (jsdom microtask flush).
    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise<unknown>((resolve) => {
      resolveFirst = resolve;
    });
    authPost.mockReturnValueOnce(firstPromise);

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

    const submitButton = screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement;
    const form = submitButton.closest('form') as HTMLFormElement;

    // Same-tick double-submit: both fireEvent.submit calls run in the same
    // synchronous task. Without the in-flight ref latch, both pass the
    // `busy === false` check and both call authPost.
    fireEvent.submit(form);
    fireEvent.submit(form);

    // Wait briefly for any rogue microtask-flushed second authPost to land.
    await new Promise((r) => setTimeout(r, 20));

    // CONTRACT: exactly one authPost call after the same-tick double submit.
    expect(authPost).toHaveBeenCalledTimes(1);

    // Resolve the slow first authPost — let the success branch run.
    resolveFirst({
      row: { id: 'w-ok', client_id: 'c-ok', date: todayIso, weight_kg: 72.5, note: null },
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    // Sanity: the latch did not lock us out forever — a follow-up submit
    // (after the in-flight resolved) should be allowed.
    authPost.mockResolvedValueOnce({
      row: { id: 'w-ok-2', client_id: 'c-ok-2', date: todayIso, weight_kg: 73.0, note: null },
    });
    fireEvent.change(input, { target: { value: '73.0' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(2);
    });
  });
});
