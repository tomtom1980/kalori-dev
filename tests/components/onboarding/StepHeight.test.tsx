/**
 * Component test — <StepHeight /> (metric canonical + unit toggle).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepHeight />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('writes metric cm on metric input', async () => {
    const user = userEvent.setup();
    const { StepHeight } = await import('@/app/(app)/onboarding/_components/StepHeight');
    render(<StepHeight />);
    await user.type(screen.getByLabelText(t.onboarding.heightLabel), '175');
    expect(useOnboardingStore.getState().draftProfile.height_cm).toBe(175);
  });

  it('converts imperial inches to metric cm when unit toggle is imperial', async () => {
    const user = userEvent.setup();
    const { StepHeight } = await import('@/app/(app)/onboarding/_components/StepHeight');
    render(<StepHeight />);
    // Flip the toggle to imperial — the IN radio becomes checked.
    await user.click(screen.getByRole('radio', { name: t.onboarding.unitIn }));
    await user.type(screen.getByLabelText(t.onboarding.heightLabel), '70');
    // 70 in × 2.54 = 177.8 cm
    const value = useOnboardingStore.getState().draftProfile.height_cm as number;
    expect(value).toBeCloseTo(177.8, 1);
  });

  it('raises range error on blur when metric value is below 100 cm', async () => {
    const user = userEvent.setup();
    const { StepHeight } = await import('@/app/(app)/onboarding/_components/StepHeight');
    render(<StepHeight />);
    const input = screen.getByLabelText(t.onboarding.heightLabel);
    await user.type(input, '90');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Phase 2 Codex R1 F3 — per-field error span MUST NOT carry role="alert".
    const errorSpan = document.getElementById('height-error');
    expect(errorSpan).not.toBeNull();
    expect(errorSpan).not.toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', 'height-error');
  });
});
