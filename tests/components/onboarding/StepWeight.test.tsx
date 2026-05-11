/**
 * Component test — <StepWeight /> (metric canonical + kg/lb toggle).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepWeight />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('writes metric kg on metric input', async () => {
    const user = userEvent.setup();
    const { StepWeight } = await import('@/app/(app)/onboarding/_components/StepWeight');
    render(<StepWeight />);
    await user.type(screen.getByLabelText(t.onboarding.weightLabel), '80');
    expect(useOnboardingStore.getState().draftProfile.current_weight_kg).toBe(80);
  });

  it('converts imperial lb to metric kg when toggle is imperial', async () => {
    const user = userEvent.setup();
    const { StepWeight } = await import('@/app/(app)/onboarding/_components/StepWeight');
    render(<StepWeight />);
    await user.click(screen.getByRole('radio', { name: t.onboarding.unitLb }));
    await user.type(screen.getByLabelText(t.onboarding.weightLabel), '150');
    // 150 × 0.45359237 ≈ 68.04
    const value = useOnboardingStore.getState().draftProfile.current_weight_kg as number;
    expect(value).toBeCloseTo(68.04, 2);
  });

  it('raises range error below 30 kg', async () => {
    const user = userEvent.setup();
    const { StepWeight } = await import('@/app/(app)/onboarding/_components/StepWeight');
    render(<StepWeight />);
    const input = screen.getByLabelText(t.onboarding.weightLabel);
    await user.type(input, '20');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Phase 2 Codex R1 F3 — per-field error span MUST NOT carry role="alert".
    const errorSpan = document.getElementById('weight-error');
    expect(errorSpan).not.toBeNull();
    expect(errorSpan).not.toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', 'weight-error');
  });
});
