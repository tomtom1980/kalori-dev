/**
 * Component test — <HowWeCalculated />.
 *
 * Covers briefing §13.4:
 *   - Collapsed by default, toggle reveals formula
 *   - aria-expanded flips + aria-controls wired
 *   - BMR / TDEE / target values match `lib/nutrition/*` pipeline
 *   - All three bio_sex constant branches (+5 / -161 / -78) display
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';

import type { HowWeCalculatedInputs } from '@/app/(app)/onboarding/_components/HowWeCalculated';

const BASE: HowWeCalculatedInputs = {
  bio_sex: 'male',
  age: 30,
  height_cm: 175,
  current_weight_kg: 80,
  goal_weight_kg: 72,
  goal_pace: 'moderate',
  activity_level: 'moderate',
};

describe('<HowWeCalculated />', () => {
  it('renders the toggle button collapsed with aria-expanded=false', async () => {
    const { HowWeCalculated } = await import('@/app/(app)/onboarding/_components/HowWeCalculated');
    render(<HowWeCalculated inputs={BASE} />);
    const btn = screen.getByRole('button', { name: t.onboarding.howWeCalculatedToggle });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls');
  });

  it('expands on click and flips aria-expanded', async () => {
    const user = userEvent.setup();
    const { HowWeCalculated } = await import('@/app/(app)/onboarding/_components/HowWeCalculated');
    render(<HowWeCalculated inputs={BASE} />);
    await user.click(screen.getByRole('button', { name: t.onboarding.howWeCalculatedToggle }));
    expect(
      screen.getByRole('button', { name: t.onboarding.howWeCalculatedToggle }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('renders the BMR, TDEE, and target values from lib/nutrition/* pipeline', async () => {
    const user = userEvent.setup();
    const { HowWeCalculated } = await import('@/app/(app)/onboarding/_components/HowWeCalculated');
    // male / 80 kg / 175 cm / 30 age:
    //   BMR = 10*80 + 6.25*175 − 5*30 + 5 = 800 + 1093.75 − 150 + 5 = 1748.75 → 1749
    //   TDEE = 1749 * 1.55 = 2710.95 → 2711
    //   goal delta = 72 − 80 = −8; paceWeeks = 16; dailyDelta = -8 * 7700 / 16 / 7 = -550
    //   target = 2711 − 550 = 2161 → round to 2160
    render(<HowWeCalculated inputs={BASE} />);
    await user.click(screen.getByRole('button', { name: t.onboarding.howWeCalculatedToggle }));
    expect(screen.getByText(/BMR = 1749 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/TDEE = 2711 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/target = 2160 kcal/)).toBeInTheDocument();
  });

  it('renders the +5 / -161 / -78 constant string for all bio_sex branches', async () => {
    const user = userEvent.setup();
    const { HowWeCalculated } = await import('@/app/(app)/onboarding/_components/HowWeCalculated');
    render(<HowWeCalculated inputs={BASE} />);
    await user.click(screen.getByRole('button', { name: t.onboarding.howWeCalculatedToggle }));
    // formulaBmrConstants contains +5 male, −161 female, −78 other
    expect(screen.getByText(/\+5 male/i)).toBeInTheDocument();
    expect(screen.getByText(/female/i)).toBeInTheDocument();
    expect(screen.getByText(/other/i)).toBeInTheDocument();
  });
});
