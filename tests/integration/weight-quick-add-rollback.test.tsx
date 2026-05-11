/**
 * @vitest-environment happy-dom
 *
 * Task 4.3b — F3 rollback integration test for WeightQuickAdd component.
 *
 * Wires the `<WeightQuickAdd />` component through a rejecting `authPost`
 * (simulating server 500) and verifies the full rollback chain:
 *   1. Optimistic pending entry is written to the store.
 *   2. authPost rejects.
 *   3. store.rollback() flips the entry status.
 *   4. A `role="alert"` + `aria-live="assertive"` rollback toast mounts with
 *      the previous weight.
 *   5. `lastCommittedWeightKg` remains unchanged (no ghost commit).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeightQuickAdd } from '@/components/dashboard/WeightQuickAdd';
import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';

const authPost = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(),
  authPost: (...args: unknown[]) => authPost(...args),
  SessionExpiredError: class SE extends Error {},
}));

// Task B.4 — `WeightQuickAdd` now reads `useRouter` from `next/navigation`
// to call `router.refresh()` on commit. Mocked so jsdom render works
// outside a real App Router context.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);
const minDateIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('F3 — WeightQuickAdd optimistic + rollback integration', () => {
  beforeEach(() => {
    authPost.mockReset();
    useWeightQuickAddStore.getState().reset();
  });
  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('server 500 → rollback toast mounts with correct ARIA semantics + previous weight', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error_500'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={68}
      />,
    );

    const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '70.0' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // Toast mounts with correct semantics.
    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });

    const toast = screen.getByTestId('weight-rollback-toast');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('aria-live')).toBe('assertive');
    expect(toast.textContent).toContain('68');

    // Store entry should be flipped to rolled-back.
    const storeState = useWeightQuickAddStore.getState();
    const pendingEntries = Object.values(storeState.pending);
    expect(pendingEntries.some((e) => e.status === 'rolled-back')).toBe(true);

    // Last committed weight should NOT have been changed.
    expect(storeState.lastCommittedWeightKg).toBeNull();
  });

  it('undo button re-submits with fresh clientId (new mintClientId) against the same weight', async () => {
    // First attempt fails; second attempt succeeds.
    authPost.mockRejectedValueOnce(new Error('db_error_500'));
    authPost.mockResolvedValueOnce({
      row: { id: 'w-retry', client_id: 'c-retry', date: todayIso, weight_kg: 70, note: null },
    });

    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={68}
      />,
    );
    const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '70.0' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );
    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('weight-rollback-undo'));

    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(2);
    });

    const firstCall = authPost.mock.calls[0]?.[1] as { client_id: string; weight_kg: number };
    const secondCall = authPost.mock.calls[1]?.[1] as { client_id: string; weight_kg: number };
    expect(firstCall.weight_kg).toBe(70);
    expect(secondCall.weight_kg).toBe(70);
    // Different clientId so the server's I11 guard doesn't short-circuit a
    // genuine retry.
    expect(firstCall.client_id).not.toBe(secondCall.client_id);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // After the successful undo, toast should be gone + lastCommittedWeightKg updated.
    await waitFor(() => {
      expect(useWeightQuickAddStore.getState().lastCommittedWeightKg).toBe(70);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Codex Round 2 R2-I1: the rollback toast + ARIA-live string must be
  // unit-aware. Under unitPref="imperial", the displayed previous-weight
  // must be lb (converted from internal kg) and the ARIA string must say
  // "pounds" (not "kilograms"). The submitted server payload stays kg.
  // ─────────────────────────────────────────────────────────────────────
  it('imperial mode: server 500 → rollback toast shows lb, ARIA string says "pounds", body submits kg', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error_500'));
    // initialWeightKg=68 → 68 kg ≈ 149.9 lb (68 / 0.45359237).
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="imperial"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={68}
      />,
    );

    const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
    // User types 154.3 lb.
    fireEvent.change(input, { target: { value: '154.3' } });
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });

    const toast = screen.getByTestId('weight-rollback-toast');
    // Previous weight 68 kg → 149.9 lb (rounded to one decimal).
    // Toast shows lb, not kg.
    expect(toast.textContent).toMatch(/149\.9\s*lb/i);
    expect(toast.textContent).not.toMatch(/149\.9\s*kg/);

    // Submitted body is the kg-canonical value (154.3 lb → 69.988... kg).
    const submittedBody = authPost.mock.calls[0]?.[1] as { weight_kg: number };
    const expectedKg = 154.3 * 0.45359237;
    expect(submittedBody.weight_kg).toBeCloseTo(expectedKg, 3);

    // Status region (aria-describedby the submit button) contains the
    // rollback ARIA-live copy in pounds, not kilograms.
    const status = screen.getByTestId('weight-quick-add-status');
    expect(status.textContent ?? '').toMatch(/pounds/i);
    expect(status.textContent ?? '').not.toMatch(/kilograms/i);
    // Numeric value in status region matches the lb conversion of previous.
    expect(status.textContent ?? '').toMatch(/149\.9/);
  });
});
