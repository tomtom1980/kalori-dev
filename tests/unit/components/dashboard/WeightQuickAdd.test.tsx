/**
 * Task 4.3b — `<WeightQuickAdd />` component tests.
 *
 * Covers:
 *   - Optimistic display before server response
 *   - authPost wire-format ({ client_id, date, weight_kg })
 *   - Rollback flow on server 500 (store state + aria-live toast)
 *   - Replay guard (response.replayed=true does not re-announce)
 *   - Client-side validation error for weight out of [30, 350]
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeightQuickAdd } from '@/components/dashboard/WeightQuickAdd';
import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';

const authPost = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(),
  authPost: (url: string, body: unknown, init?: RequestInit) => authPost(url, body, init),
  SessionExpiredError: class SE extends Error {},
}));

// Task B.4 — `WeightQuickAdd` now reads `useRouter` from `next/navigation`
// to call `router.refresh()` on commit. Vitest renders the component
// outside a real App Router context, so the hook is mocked here.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);
const minDateIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function typeWeight(value: string) {
  const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

describe('<WeightQuickAdd />', () => {
  beforeEach(() => {
    authPost.mockReset();
    authPost.mockResolvedValue({
      row: {
        id: 'w-1',
        client_id: 'c-1',
        date: todayIso,
        weight_kg: 71.4,
        note: null,
      },
    });
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('renders the weight input + unit suffix + submit button', () => {
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    expect(screen.getByTestId('weight-quick-add-input')).toBeTruthy();
    expect(screen.getByText(/^kg$/i)).toBeTruthy();
    expect(screen.getByTestId('weight-quick-add-submit')).toBeTruthy();
  });

  it('groups the weight and date fields together when inline unit choice is enabled', () => {
    render(
      <WeightQuickAdd
        mode="inline"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        allowUnitChoice
        showDateInput
      />,
    );

    const fieldPair = screen.getByTestId('weight-quick-add-field-pair');
    expect(fieldPair).toContainElement(screen.getByTestId('weight-quick-add-input'));
    expect(fieldPair).toContainElement(screen.getByTestId('weight-quick-add-date'));
    expect(screen.getByRole('radio', { name: /^kg$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^lb$/i })).toBeInTheDocument();
  });

  it('fires authPost with { client_id, date, weight_kg, note }', async () => {
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    const [url, body] = authPost.mock.calls[0] ?? [];
    expect(url).toBe('/api/weight/log');
    expect(body).toMatchObject({
      date: todayIso,
      weight_kg: 71.4,
    });
    expect(typeof (body as { client_id: string }).client_id).toBe('string');
  });

  it('optimistically records pending entry before the post resolves', async () => {
    let resolvePost: (v: unknown) => void = () => undefined;
    const p = new Promise((r) => {
      resolvePost = r;
    });
    authPost.mockImplementationOnce(() => p);

    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('72.5');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // While the post is pending, the store's pending entry captures the value.
    await waitFor(() => {
      const pendingEntries = Object.values(useWeightQuickAddStore.getState().pending);
      expect(pendingEntries.length).toBeGreaterThanOrEqual(1);
    });
    const pendingEntries = Object.values(useWeightQuickAddStore.getState().pending);
    expect(pendingEntries[0]?.weightKg).toBe(72.5);

    await act(async () => {
      resolvePost({
        row: { id: 'w-2', client_id: 'c-2', date: todayIso, weight_kg: 72.5, note: null },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // After commit, lastCommittedWeightKg updated.
    await waitFor(() => {
      expect(useWeightQuickAddStore.getState().lastCommittedWeightKg).toBe(72.5);
    });
  });

  it('rolls back + shows rollback toast on server error', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error'));

    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      const toast = screen.queryByTestId('weight-rollback-toast');
      expect(toast).toBeTruthy();
    });

    const toast = screen.getByTestId('weight-rollback-toast');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('aria-live')).toBe('assertive');
    // Rollback toast body references the previous weight (70 — the initial
    // current_weight_kg).
    expect(toast.textContent).toContain('70');
  });

  it('replayed response still commits exactly once (idempotent)', async () => {
    authPost.mockResolvedValueOnce({
      row: { id: 'w-3', client_id: 'c-3', date: todayIso, weight_kg: 73, note: null },
      replayed: true,
    });

    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    typeWeight('73');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(useWeightQuickAddStore.getState().lastCommittedClientIds.size).toBe(1);
    });

    const storeState = useWeightQuickAddStore.getState();
    expect(storeState.lastCommittedWeightKg).toBe(73);
  });

  it('client-side validation rejects weight outside [30, 350]', async () => {
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    typeWeight('400');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  // ---- Phase 3 Round 1 fix tests ----

  it('C2 — rollback applies the ember-pulse CSS class to the weight input for 200ms', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      const host = screen.queryByTestId('weight-quick-add-input');
      expect(host?.className ?? '').toContain('kalori-weight-ember-pulse');
    });
  });

  it('M1 — rollback toast is portalled to <body>, not nested inside the form', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error'));
    const { container } = render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });
    const toast = screen.getByTestId('weight-rollback-toast');
    // Toast must NOT be a descendant of the component's container (portalled).
    expect(container.contains(toast)).toBe(false);
    // Toast must NOT sit inside any <form>.
    expect(toast.closest('form')).toBeNull();
  });

  it('M2 — rollback toast auto-dismisses after 7s', async () => {
    vi.useFakeTimers();
    try {
      authPost.mockRejectedValueOnce(new Error('db_error'));
      render(
        <WeightQuickAdd
          mode="page"
          unitPref="metric"
          todayUserTz={todayIso}
          minDateUserTz={minDateIso}
          initialWeightKg={70}
        />,
      );
      typeWeight('71.4');
      fireEvent.submit(
        (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
      );
      // Flush the pending rejection microtask.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();

      // Advance past 7000ms — toast should self-dismiss.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(7100);
      });
      expect(screen.queryByTestId('weight-rollback-toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('M4 — dismissing the rollback toast returns focus to the weight input', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-dismiss')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('weight-rollback-dismiss'));

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeNull();
    });
    const input = screen.getByTestId('weight-quick-add-input');
    expect(document.activeElement).toBe(input);
  });

  it('M5 — submit button is described by the status <output> element', () => {
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    const submit = screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement;
    const descIds = (submit.getAttribute('aria-describedby') ?? '').split(/\s+/);
    const status = screen.getByTestId('weight-quick-add-status') as HTMLElement;
    const statusId = status.getAttribute('id') ?? '';
    expect(statusId.length).toBeGreaterThan(0);
    expect(descIds).toContain(statusId);
  });

  it('M5 — <output> is populated with save status text after success', async () => {
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );
    await waitFor(() => {
      const status = screen.getByTestId('weight-quick-add-status');
      expect((status.textContent ?? '').trim().length).toBeGreaterThan(0);
    });
  });

  // ---- Codex Round 1 fix tests ----

  it('Codex R1 C-3: imperial unitPref converts lb input to kg before POST', async () => {
    // C-3: user types `154` with unitPref=imperial (meaning 154 lb). The
    // store AND network must persist metric (kg) per design-doc §18.2 I6.
    // 154 lb × 0.45359237 = 69.853... kg.
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="imperial"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('154');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    const [, body] = authPost.mock.calls[0] ?? [];
    const weightKg = (body as { weight_kg: number }).weight_kg;
    // 154 lb = 69.8532... kg. Allow small float tolerance.
    expect(weightKg).toBeGreaterThan(69.8);
    expect(weightKg).toBeLessThan(69.9);
  });

  it('Task 4.5 R1 C1 — rollback restores the optimistic mirror to the previous weight', async () => {
    // Pre-fix the rollback path called store.rollback(...) but did NOT
    // restore `setOpt(previousWeight)`. The optimistic mirror would keep
    // showing the new (non-persisted) weight until the next render.
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    // Initial mirror displays the prior committed weight (70.0).
    expect(screen.getByTestId('weight-quick-add-optimistic-mirror').textContent).toBe('70.0');
    typeWeight('72.5');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    // After the rollback toast surfaces, the optimistic mirror MUST display
    // 70.0 (previousWeight) again — NOT 72.5 (the failed attempt).
    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });
    const mirror = screen.getByTestId('weight-quick-add-optimistic-mirror');
    expect(mirror.textContent).toBe('70.0');
  });

  it('Task 4.5 R1 C1 — rollback with no prior committed value clears the optimistic mirror', async () => {
    // When there's no `initialWeightKg` and no prior committed entry,
    // previousWeight is null. The mirror should disappear (returning to
    // the empty state) rather than continuing to display the failed value.
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    typeWeight('72.5');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });
    // Mirror must NOT display 72.5 (the failed value) — it should be gone.
    const mirror = screen.queryByTestId('weight-quick-add-optimistic-mirror');
    if (mirror !== null) {
      expect(mirror.textContent).not.toBe('72.5');
    }
  });

  it('Task 4.5 R2 S2 — first-time logger rollback restores null mirror (not failed value)', async () => {
    // Stricter than the R1 C1 test above: when there's NO initial weight
    // (first-time logger, `initialWeightKg` undefined, `lastCommittedWeightKg`
    // null), a failed submission MUST fully remove the optimistic mirror.
    //
    // Pre-R2 the rollback branch was guarded by
    //   `if (previousWeight !== null) setOpt(previousWeight);`
    // because `useOptimistic<number | null, number>` didn't allow `setOpt(null)`
    // (action type was narrowed to `number`). This meant first-time loggers
    // were on a race-y revert-at-transition-end path; also the code had a
    // dead branch documenting intent that was never exercised.
    //
    // Post-R2 the action type is widened to `number | null` so `setOpt(null)`
    // is a valid call and the rollback branch is symmetric for first-time
    // and repeat loggers. The end-state (mirror absent) is the same, but the
    // rollback path is now explicitly load-bearing rather than accidentally
    // correct. This test asserts the post-rollback mirror is absent — which
    // guards against future regressions that might, say, move the
    // transition-end natural revert into a code path that only fires for
    // non-null state.
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
      />,
    );
    // Before submit, no mirror is rendered (opt = null).
    expect(screen.queryByTestId('weight-quick-add-optimistic-mirror')).toBeNull();
    typeWeight('72.5');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('weight-rollback-toast')).toBeTruthy();
    });
    // Strict assertion: mirror element MUST be absent post-rollback.
    expect(screen.queryByTestId('weight-quick-add-optimistic-mirror')).toBeNull();
  });

  it('Task 4.5 R1 S1 — emberPulse class applies with proper space separator (concatenation bug fix)', async () => {
    // Pre-fix the className was `\`kalori-weight-input${active ? '...ember-pulse' : ''}\``
    // (missing space) — the ember-pulse class never applied because it
    // concatenated as `kalori-weight-inputkalori-weight-ember-pulse`.
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('71.4');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );

    await waitFor(() => {
      const input = screen.queryByTestId('weight-quick-add-input');
      const cls = input?.className ?? '';
      // Both classes present AND distinct — separated by whitespace.
      const tokens = cls.split(/\s+/).filter(Boolean);
      expect(tokens).toContain('kalori-weight-input');
      expect(tokens).toContain('kalori-weight-ember-pulse');
    });
  });

  it('Codex R1 C-3: imperial unitPref validates lb input against lb bounds (66–771 lb) — not raw kg bounds', async () => {
    // C-3 corollary: when the user types in lb, the [30, 350] kg bounds
    // become [66.14, 771.6] lb. A 200 lb entry (≈ 90.7 kg) is valid and
    // must NOT trigger the "out of range" inline error.
    render(
      <WeightQuickAdd
        mode="page"
        unitPref="imperial"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={70}
      />,
    );
    typeWeight('200');
    fireEvent.submit(
      (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
    );
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    // No inline error should have surfaced.
    expect(screen.queryByTestId('weight-quick-add-error')).toBeNull();
    const [, body] = authPost.mock.calls[0] ?? [];
    const weightKg = (body as { weight_kg: number }).weight_kg;
    expect(weightKg).toBeCloseTo(200 * 0.45359237, 3);
  });
});
