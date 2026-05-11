/**
 * Component test — <StepAge />.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepAge />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders a labelled number input', async () => {
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.ageLabel);
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('min', '13');
    expect(input).toHaveAttribute('max', '120');
  });

  it('writes parsed integer to store', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    await user.type(screen.getByLabelText(t.onboarding.ageLabel), '32');
    expect(useOnboardingStore.getState().draftProfile.age).toBe(32);
  });

  it('shows range error when out of bounds on blur', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.ageLabel);
    await user.type(input, '200');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Phase 2 Codex R1 F3 — per-field error span MUST NOT carry role="alert".
    // `role="alert"` is reserved exclusively for the cross-step saveError
    // lane on WizardShell. The input's own aria-invalid + aria-describedby
    // provide the SR path for per-field errors.
    const errorSpan = document.getElementById('age-error');
    expect(errorSpan).not.toBeNull();
    expect(errorSpan).toHaveTextContent(t.onboarding.errorAgeRange);
    expect(errorSpan).not.toHaveAttribute('role', 'alert');
    // Input points at the error span via aria-describedby — the canonical SR path.
    expect(input).toHaveAttribute('aria-describedby', 'age-error');
  });

  it('clears error once value is in range', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.ageLabel);
    await user.type(input, '200');
    await user.tab();
    await user.clear(input);
    await user.type(input, '45');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});
