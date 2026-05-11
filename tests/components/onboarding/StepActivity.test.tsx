/**
 * Component test — <StepActivity /> (5-chip radiogroup).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepActivity />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders 5 activity radios with subtitles', async () => {
    const { StepActivity } = await import('@/app/(app)/onboarding/_components/StepActivity');
    render(<StepActivity />);
    for (const name of [
      t.onboarding.activitySedentary,
      t.onboarding.activityLight,
      t.onboarding.activityModerate,
      t.onboarding.activityActive,
      t.onboarding.activityVeryActive,
    ]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    // A subtitle sample: italic Newsreader text renders as plain text.
    expect(screen.getByText(t.onboarding.activitySedentarySub)).toBeInTheDocument();
    expect(screen.getByText(t.onboarding.activityVeryActiveSub)).toBeInTheDocument();
  });

  it('writes activity_level to store', async () => {
    const user = userEvent.setup();
    const { StepActivity } = await import('@/app/(app)/onboarding/_components/StepActivity');
    render(<StepActivity />);
    await user.click(screen.getByRole('radio', { name: t.onboarding.activityActive }));
    expect(useOnboardingStore.getState().draftProfile.activity_level).toBe('active');
  });
});
