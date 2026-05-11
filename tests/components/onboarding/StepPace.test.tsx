/**
 * Component test — <StepPace /> with per-chip calculated target date.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';
import { useOnboardingStore } from '@/lib/stores/useOnboardingStore';

describe('<StepPace />', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it('renders 3 pace radios', async () => {
    const { StepPace } = await import('@/app/(app)/onboarding/_components/StepPace');
    render(<StepPace />);
    expect(screen.getByRole('radio', { name: t.onboarding.paceRelaxed })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t.onboarding.paceSteady })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: t.onboarding.paceAggressive })).toBeInTheDocument();
  });

  it('writes goal_pace to store on selection', async () => {
    const user = userEvent.setup();
    const { StepPace } = await import('@/app/(app)/onboarding/_components/StepPace');
    render(<StepPace />);
    await user.click(screen.getByRole('radio', { name: t.onboarding.paceSteady }));
    expect(useOnboardingStore.getState().draftProfile.goal_pace).toBe('moderate');
  });

  it('shows a TARGET date on each chip (3 total)', async () => {
    const { StepPace } = await import('@/app/(app)/onboarding/_components/StepPace');
    render(<StepPace />);
    // Each chip renders `TARGET: <formatted date>`; match the uppercase token.
    const targets = screen.getAllByText(/TARGET:/);
    expect(targets).toHaveLength(3);
  });
});
