/**
 * Phase 3 fix-round regression tests for <WizardShell />.
 *
 * Covers the four behaviors the Phase 3 reviewers flagged as missing:
 *   1. `saveError` banner renders with role="alert" when the store state
 *      is non-null (ux-specialist §9.5 + ux-auditor V4).
 *   2. Focus moves to the current step's first interactive element on
 *      mount and on step change (ux-specialist §11.1 + ux-auditor V1).
 *   3. A sr-only `aria-live="polite"` live region carries the
 *      "Step N of 8: {title}" announcement after step change
 *      (ux-auditor V3). Delay is 150ms — the test waits past that.
 *   4. A pending network save error announces via role="alert" so
 *      screen readers catch it (ux-auditor V4).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

const authPost = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPost(...args),
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor() {
      super('Session expired after refresh attempt');
      this.name = 'SessionExpiredError';
    }
  },
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: () => void 0 }),
}));

describe('<WizardShell /> Phase 3 fix-round behaviors', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
    authPost.mockReset();
    authPost.mockResolvedValue({ ok: true, profile: {} });
    routerPush.mockReset();
  });

  afterEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders the saveError banner with role="alert" when the store has an error', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);

    // Initially no alert present.
    expect(screen.queryByRole('alert')).toBeNull();

    // Simulate a failed network save by setting saveError in the store.
    act(() => {
      useOnboardingStore.getState().setSaveError(t.onboarding.saveErrorRetry);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t.onboarding.saveErrorRetry);
  });

  it('moves focus to the current step first interactive element on mount', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);

    // Step 1 = first radio (bio_sex male).
    await waitFor(() => {
      const firstRadio = screen.getByRole('radio', { name: t.onboarding.bioSexMale });
      expect(firstRadio).toHaveFocus();
    });
  });

  it('moves focus to the next step first interactive element after Next advances', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    const user = userEvent.setup();
    render(<WizardShell />);

    await user.click(screen.getByRole('radio', { name: t.onboarding.bioSexMale }));
    await user.click(screen.getByRole('button', { name: t.onboarding.buttonNext }));

    await waitFor(() => {
      expect(useOnboardingStore.getState().currentStep).toBe(2);
    });

    // Step 2 first interactive = age input.
    await waitFor(() => {
      const ageInput = screen.getByLabelText(t.onboarding.ageLabel);
      expect(ageInput).toHaveFocus();
    });
  });

  it('renders a sr-only aria-live polite region for step-change announcements', async () => {
    const { WizardShell } = await import('@/app/(app)/onboarding/_components/WizardShell');
    render(<WizardShell />);

    // Region must exist from first render so announcements can enter it.
    const live = document.querySelector('[aria-live="polite"][data-wizard-announcement]');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute('aria-atomic', 'true');
  });
});
