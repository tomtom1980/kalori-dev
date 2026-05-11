/**
 * Component test — <StepBioSex />.
 *
 * Covers:
 *   - 3 native radio inputs (male / female / other) labelled i18n-ly
 *   - Selecting a radio writes `bio_sex` to the store
 *   - role="radiogroup" exposed
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepBioSex />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders 3 radio options', async () => {
    const { StepBioSex } = await import('@/app/(app)/onboarding/_components/StepBioSex');
    render(<StepBioSex />);
    expect(screen.getByRole('radio', { name: t.onboarding.bioSexMale })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t.onboarding.bioSexFemale })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t.onboarding.bioSexOther })).toBeInTheDocument();
  });

  it('exposes a radiogroup landmark', async () => {
    const { StepBioSex } = await import('@/app/(app)/onboarding/_components/StepBioSex');
    render(<StepBioSex />);
    expect(
      screen.getByRole('radiogroup', { name: t.onboarding.bioSexGroupLabel }),
    ).toBeInTheDocument();
  });

  it('writes bio_sex to the store when a radio is picked', async () => {
    const user = userEvent.setup();
    const { StepBioSex } = await import('@/app/(app)/onboarding/_components/StepBioSex');
    render(<StepBioSex />);
    await user.click(screen.getByRole('radio', { name: t.onboarding.bioSexFemale }));
    expect(useOnboardingStore.getState().draftProfile.bio_sex).toBe('female');
  });
});
