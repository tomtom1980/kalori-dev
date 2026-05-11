/**
 * Component test — <StepGoalWeight /> with live delta chip.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepGoalWeight />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
    // Seed current weight so delta chip can render.
    useOnboardingStore.getState().setDraftField('current_weight_kg', 80);
  });

  it('writes metric kg on input and stores under goal_weight_kg', async () => {
    const user = userEvent.setup();
    const { StepGoalWeight } = await import('@/app/(app)/onboarding/_components/StepGoalWeight');
    render(<StepGoalWeight />);
    await user.type(screen.getByLabelText(t.onboarding.goalWeightLabel), '72');
    expect(useOnboardingStore.getState().draftProfile.goal_weight_kg).toBe(72);
  });

  it('renders a "lose" delta chip when goal < current', async () => {
    const user = userEvent.setup();
    const { StepGoalWeight } = await import('@/app/(app)/onboarding/_components/StepGoalWeight');
    render(<StepGoalWeight />);
    await user.type(screen.getByLabelText(t.onboarding.goalWeightLabel), '72');
    // Template: YOU WANT TO LOSE {amount} {unit}
    expect(screen.getByText(/YOU WANT TO LOSE 8 KG/i)).toBeInTheDocument();
  });

  it('renders a "gain" delta chip when goal > current', async () => {
    const user = userEvent.setup();
    const { StepGoalWeight } = await import('@/app/(app)/onboarding/_components/StepGoalWeight');
    render(<StepGoalWeight />);
    await user.type(screen.getByLabelText(t.onboarding.goalWeightLabel), '85');
    expect(screen.getByText(/YOU WANT TO GAIN 5 KG/i)).toBeInTheDocument();
  });

  it('renders a "maintain" caption when goal === current', async () => {
    const user = userEvent.setup();
    const { StepGoalWeight } = await import('@/app/(app)/onboarding/_components/StepGoalWeight');
    render(<StepGoalWeight />);
    await user.type(screen.getByLabelText(t.onboarding.goalWeightLabel), '80');
    expect(
      screen.getByText(new RegExp(t.onboarding.goalWeightDeltaMaintain, 'i')),
    ).toBeInTheDocument();
  });

  it('per-field error span does NOT carry role="alert" (F3 — a11y contract)', async () => {
    // Phase 2 Codex R1 F3 — `role="alert"` is reserved for the cross-step
    // saveError lane on WizardShell. Per-field validation relies on
    // aria-invalid + aria-describedby, which the input already wires.
    const user = userEvent.setup();
    const { StepGoalWeight } = await import('@/app/(app)/onboarding/_components/StepGoalWeight');
    render(<StepGoalWeight />);
    const input = screen.getByLabelText(t.onboarding.goalWeightLabel);
    await user.type(input, '20'); // below 30 kg range
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorSpan = document.getElementById('goal-weight-error');
    expect(errorSpan).not.toBeNull();
    expect(errorSpan).not.toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', 'goal-weight-error');
  });
});
