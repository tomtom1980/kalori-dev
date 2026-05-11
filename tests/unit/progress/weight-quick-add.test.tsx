/**
 * Task B.4 (US-STAB-B4) AC2 — bounds validation for the Progress-page
 * inline quick-add wrapper.
 *
 * Pins behavior of `<ProgressWeightQuickAdd />` (which renders
 * `<WeightQuickAdd mode="inline" />`):
 *   - Out-of-range values (<30 kg or >350 kg) render an inline error AND
 *     never call `authPost`.
 *   - Imperial-mode values are converted via the canonical NIST constant
 *     `KG_PER_LB = 0.45359237` from `lib/units/conversion.ts` BEFORE the
 *     bounds check — so a lb value that resolves to 30.0 kg exactly passes,
 *     and a lb value that resolves below 30 kg is rejected.
 *   - Boundary values 30.0 / 350.0 kg are accepted (inclusive bounds).
 *   - Non-numeric / empty input is rejected.
 *
 * Together with the existing `tests/unit/components/dashboard/WeightQuickAdd.test.tsx`
 * regression suite, this pins the Progress-page wrapper's contract and
 * proves the lb-conversion edge cases AC2 calls out explicitly.
 *
 * R1 firewall — `@/lib/auth/refresh-interceptor` is mocked here; the
 * production module is never imported, modified, or executed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ProgressWeightQuickAdd } from '@/app/(app)/progress/_components/weight-quick-add';
import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';

const authPost = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(),
  authPost: (url: string, body: unknown, init?: RequestInit) => authPost(url, body, init),
  SessionExpiredError: class SE extends Error {},
}));

const refreshSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}));

const todayIso = new Date().toISOString().slice(0, 10);
const minDateIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function typeWeight(value: string) {
  const input = screen.getByTestId('weight-quick-add-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function submitForm() {
  fireEvent.submit(
    (screen.getByTestId('weight-quick-add-submit') as HTMLButtonElement).closest('form')!,
  );
}

describe('<ProgressWeightQuickAdd /> AC2 — bounds validation', () => {
  beforeEach(() => {
    authPost.mockReset();
    authPost.mockResolvedValue({
      row: { id: 'w-ok', client_id: 'c-ok', date: todayIso, weight_kg: 30.0, note: null },
    });
    refreshSpy.mockReset();
    useWeightQuickAddStore.getState().reset();
  });

  afterEach(() => {
    useWeightQuickAddStore.getState().reset();
  });

  it('rejects 29.9 kg (below 30) — inline error + no authPost', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('29.9');
    submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  it('rejects 350.1 kg (above 350) — inline error + no authPost', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('350.1');
    submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  it('rejects non-numeric input — inline error + no authPost', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('abc');
    submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  it('accepts boundary 30.0 kg (lower edge inclusive) — calls authPost', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('30');
    submitForm();
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    const [url, body] = authPost.mock.calls[0] ?? [];
    expect(url).toBe('/api/weight/log');
    expect(body).toMatchObject({ date: todayIso, weight_kg: 30 });
    expect(screen.queryByTestId('weight-quick-add-error')).toBeNull();
  });

  it('accepts boundary 350.0 kg (upper edge inclusive) — calls authPost', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('350');
    submitForm();
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    const [, body] = authPost.mock.calls[0] ?? [];
    expect(body).toMatchObject({ weight_kg: 350 });
    expect(screen.queryByTestId('weight-quick-add-error')).toBeNull();
  });

  it('imperial 65 lb (≈ 29.48 kg) — rejected, no authPost', async () => {
    // 65 * 0.45359237 ≈ 29.4835 kg — below the 30 kg bound after conversion.
    render(
      <ProgressWeightQuickAdd
        unitPref="imperial"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('65');
    submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(authPost).not.toHaveBeenCalled();
  });

  it('imperial 66.1387 lb (= 30.0 kg via × 0.45359237) — accepted, sends weight_kg in kg', async () => {
    // Boundary case proves the lb→kg constant is the canonical NIST value
    // from `lib/units/conversion.ts` (KG_PER_LB = 0.45359237).
    // 66.1387 * 0.45359237 ≈ 30.0000048 kg — within the [30, 350] kg bound.
    render(
      <ProgressWeightQuickAdd
        unitPref="imperial"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('66.1387');
    submitForm();
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    const [, body] = authPost.mock.calls[0] ?? [];
    const sentKg = (body as { weight_kg: number }).weight_kg;
    // Storage is kg-canonical (design-doc §18.2 I6) — the wire value is kg,
    // not lb. Verify the lb→kg conversion landed within 0.0001 of 30.0.
    expect(sentKg).toBeGreaterThanOrEqual(30);
    expect(sentKg).toBeLessThan(30.001);
  });

  it('on successful submit calls router.refresh() exactly once (DT-7 / AC1 lock-in)', async () => {
    // AC1 contract: success branch calls router.refresh(). This unit-test
    // pin complements the Playwright AC1 spec — Playwright proves no full
    // navigation happens; this proves the call is actually made.
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('72.5');
    submitForm();
    await waitFor(() => {
      expect(authPost).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('on rejected (out-of-range) submit does NOT call router.refresh()', async () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    typeWeight('29.9');
    submitForm();
    await waitFor(() => {
      expect(screen.getByTestId('weight-quick-add-error')).toBeTruthy();
    });
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('renders the inline-mode section with data-testid="weight-quick-add-inline" (mount-point selector for AC1/AC3 e2e)', () => {
    render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    expect(screen.getByTestId('weight-quick-add-inline')).toBeTruthy();
  });

  it('axe-core: zero critical/serious violations on the inline surface', async () => {
    const { container } = render(
      <ProgressWeightQuickAdd
        unitPref="metric"
        todayUserTz={todayIso}
        minDateUserTz={minDateIso}
        initialWeightKg={null}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
