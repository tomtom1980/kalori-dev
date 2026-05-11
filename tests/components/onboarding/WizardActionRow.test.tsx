/**
 * Component test — <WizardActionRow />.
 *
 * Coverage:
 *   - Back button hidden on Step 1, visible on Step 2+
 *   - Next label swaps to "START TRACKING" on Step 8
 *   - `disabled` prop gates the Next button
 *   - `isSaving` prop swaps label + adds aria-busy
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<WizardActionRow />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('hides Back button on step 1', async () => {
    const onBack = vi.fn();
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={true} isSaving={false} onBack={onBack} />);
    expect(screen.queryByRole('button', { name: t.onboarding.buttonBack })).toBeNull();
  });

  it('shows Back button on steps 2-8', async () => {
    useOnboardingStore.getState().setStep(2);
    const onBack = vi.fn();
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={true} isSaving={false} onBack={onBack} />);
    const back = screen.getByRole('button', { name: t.onboarding.buttonBack });
    expect(back).toBeInTheDocument();
  });

  it('renders Next with default label on steps 1-7', async () => {
    useOnboardingStore.getState().setStep(3);
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={true} isSaving={false} onBack={() => void 0} />);
    expect(screen.getByRole('button', { name: t.onboarding.buttonNext })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.onboarding.buttonStartTracking })).toBeNull();
  });

  it('renders START TRACKING on step 8', async () => {
    useOnboardingStore.getState().setStep(8);
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={true} isSaving={false} onBack={() => void 0} />);
    expect(
      screen.getByRole('button', { name: t.onboarding.buttonStartTracking }),
    ).toBeInTheDocument();
  });

  it('disables Next when canAdvance=false', async () => {
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={false} isSaving={false} onBack={() => void 0} />);
    expect(screen.getByRole('button', { name: t.onboarding.buttonNext })).toBeDisabled();
  });

  it('swaps Next label to SAVING… + aria-busy when isSaving', async () => {
    useOnboardingStore.getState().setStep(3);
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    render(<WizardActionRow canAdvance={true} isSaving={true} onBack={() => void 0} />);
    const btn = screen.getByRole('button', { name: t.onboarding.buttonNextLoading });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('calls onBack when Back clicked on step 3', async () => {
    useOnboardingStore.getState().setStep(3);
    const onBack = vi.fn();
    const { WizardActionRow } = await import('@/app/(app)/onboarding/_components/WizardActionRow');
    const user = userEvent.setup();
    render(<WizardActionRow canAdvance={true} isSaving={false} onBack={onBack} />);
    await user.click(screen.getByRole('button', { name: t.onboarding.buttonBack }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
