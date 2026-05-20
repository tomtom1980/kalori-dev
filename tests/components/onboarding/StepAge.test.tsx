/**
 * Component test - <StepAge />.
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

  it('renders a labelled calendar input', async () => {
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.birthdayLabel);
    expect(input).toHaveAttribute('type', 'date');
  });

  it('writes birthday and derived age to store', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    await user.type(screen.getByLabelText(t.onboarding.birthdayLabel), '1990-05-10');
    const draft = useOnboardingStore.getState().draftProfile;
    expect(draft.birthday).toBe('1990-05-10');
    expect(draft.age).toBeGreaterThanOrEqual(35);
  });

  it('shows range error when out of bounds on blur', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.birthdayLabel);
    await user.type(input, '2020-01-01');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorSpan = document.getElementById('birthday-error');
    expect(errorSpan).not.toBeNull();
    expect(errorSpan).toHaveTextContent(t.onboarding.errorBirthdayRange);
    expect(errorSpan).not.toHaveAttribute('role', 'alert');
    expect(input).toHaveAttribute('aria-describedby', 'birthday-error');
  });

  it('clears error once value is in range', async () => {
    const user = userEvent.setup();
    const { StepAge } = await import('@/app/(app)/onboarding/_components/StepAge');
    render(<StepAge />);
    const input = screen.getByLabelText(t.onboarding.birthdayLabel);
    await user.type(input, '2020-01-01');
    await user.tab();
    await user.clear(input);
    await user.type(input, '1990-05-10');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});
