/**
 * Component test — <StepResults />.
 *
 * Covers:
 *   - Renders attribution + hero target
 *   - Sub-1200 warning appears when target < 1200, absent otherwise
 *   - Warning uses role="note" + aria-live="polite"
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepResults />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders attribution + BMR/TDEE labels when draft is complete', async () => {
    const s = useOnboardingStore.getState();
    s.setDraftField('bio_sex', 'male');
    s.setDraftField('age', 30);
    s.setDraftField('height_cm', 175);
    s.setDraftField('current_weight_kg', 80);
    s.setDraftField('goal_weight_kg', 72);
    s.setDraftField('goal_pace', 'moderate');
    s.setDraftField('activity_level', 'moderate');

    const { StepResults } = await import('@/app/(app)/onboarding/_components/StepResults');
    render(<StepResults />);

    expect(screen.getByText(t.onboarding.resultsAttribution)).toBeInTheDocument();
    expect(screen.getByText(t.onboarding.bmrLabel)).toBeInTheDocument();
    expect(screen.getByText(t.onboarding.tdeeLabel)).toBeInTheDocument();
    expect(screen.getByText(t.onboarding.targetValueLabel)).toBeInTheDocument();
  });

  it('does NOT render sub-1200 warning when target >= 1200', async () => {
    const s = useOnboardingStore.getState();
    s.setDraftField('bio_sex', 'male');
    s.setDraftField('age', 30);
    s.setDraftField('height_cm', 180);
    s.setDraftField('current_weight_kg', 80);
    s.setDraftField('goal_weight_kg', 80);
    s.setDraftField('goal_pace', 'moderate');
    s.setDraftField('activity_level', 'moderate');
    // TDEE ≈ 2808, target ≈ 2810 > 1200 → no warning.

    const { StepResults } = await import('@/app/(app)/onboarding/_components/StepResults');
    render(<StepResults />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('renders sub-1200 warning when target < 1200', async () => {
    const s = useOnboardingStore.getState();
    // Small sedentary aggressive cutter:
    //   female / age 25 / 150 cm / 45 kg / 30 kg goal / fast (8w) / sedentary
    //   BMR = 10*45 + 6.25*150 − 5*25 − 161 = 450 + 937.5 − 125 − 161 = 1101.5 → 1102
    //   TDEE = 1102 * 1.2 = 1322.4 → 1322
    //   delta = 30 − 45 = −15; paceWeeks = 8
    //   dailyDelta = −15 * 7700 / 8 / 7 = −2062.5
    //   target = 1322 − 2062.5 = −740 → < 1200.
    s.setDraftField('bio_sex', 'female');
    s.setDraftField('age', 25);
    s.setDraftField('height_cm', 150);
    s.setDraftField('current_weight_kg', 45);
    s.setDraftField('goal_weight_kg', 30);
    s.setDraftField('goal_pace', 'fast');
    s.setDraftField('activity_level', 'sedentary');

    const { StepResults } = await import('@/app/(app)/onboarding/_components/StepResults');
    render(<StepResults />);
    const note = screen.getByRole('note');
    expect(note).toHaveAttribute('aria-live', 'polite');
    expect(note).toHaveTextContent(t.onboarding.sub1200Warning);
  });
});
