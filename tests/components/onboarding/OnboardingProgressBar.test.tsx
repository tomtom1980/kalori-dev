/**
 * Component test — <OnboardingProgressBar />.
 *
 * Coverage:
 *   - role="progressbar" with aria-valuenow/min/max + aria-label
 *   - 8 dashes rendered in the visual track
 *   - "Step N of 8" visible text alongside dashes (ux-specialist §7.4)
 *   - `aria-label` built via t.onboarding.progressA11y {N} substitution
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<OnboardingProgressBar />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders role="progressbar" with correct aria values at step 1', async () => {
    const { OnboardingProgressBar } =
      await import('@/app/(app)/onboarding/_components/OnboardingProgressBar');
    render(<OnboardingProgressBar />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemin', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
    expect(bar).toHaveAttribute('aria-label', t.onboarding.progressA11y.replace('{N}', '1'));
  });

  it('reflects the current step from the store', async () => {
    useOnboardingStore.getState().setStep(5);
    const { OnboardingProgressBar } =
      await import('@/app/(app)/onboarding/_components/OnboardingProgressBar');
    render(<OnboardingProgressBar />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '5');
  });

  it('shows "Step N of 8" text alongside the dashes', async () => {
    useOnboardingStore.getState().setStep(3);
    const { OnboardingProgressBar } =
      await import('@/app/(app)/onboarding/_components/OnboardingProgressBar');
    render(<OnboardingProgressBar />);
    expect(screen.getByText(/step 3 of 8/i)).toBeInTheDocument();
  });
});
