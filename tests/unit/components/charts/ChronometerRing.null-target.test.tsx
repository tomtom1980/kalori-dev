/**
 * Task 3.7 fix — F-UI-3.7-B: `<ChronometerRing />` must render gracefully
 * when the user's `calorie_target` is NULL.
 *
 * Background: the DB column `profiles.calorie_target` is nullable
 * (`numeric(7,2)` with no NOT NULL — see `supabase/migrations/0002_profiles.sql:43`).
 * The `Profile` TS type in `lib/dashboard/types.ts` says `calorie_target: number`,
 * which is a lie — a user in the gap between `handle_new_user()` auto-insert
 * and onboarding completion has a NULL value.
 *
 * The F-UI-3.7-C onboarding guard prevents this from being user-reachable,
 * but defense-in-depth: if a null target ever reaches the component
 * (edge case, race, future breakage), the ring must render a dash ('—') or
 * 0% rather than crash with `null.toLocaleString is not a function`.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChronometerRing } from '@/components/charts/ChronometerRing';
import type { ChronometerData } from '@/lib/dashboard/types';

describe('<ChronometerRing /> null / zero target resilience', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('does not throw when target is null (empty status)', () => {
    // Type-widen via double cast: the runtime shape is what a DB NULL returns
    // before the onboarding guard runs; TS says target is `number`, real
    // runtime can deliver null during the gap.
    const data = { status: 'empty', target: null } as unknown as ChronometerData;
    expect(() => render(<ChronometerRing data={data} />)).not.toThrow();
  });

  it('renders a placeholder dash "—" instead of "null" when target is null', () => {
    const data = { status: 'empty', target: null } as unknown as ChronometerData;
    render(<ChronometerRing data={data} />);
    // Any visible text node containing the literal substring "null" is a
    // bug — the component must substitute a dash for missing values.
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/null/i);
  });

  it('does not log console.error when target is null', () => {
    const data = { status: 'empty', target: null } as unknown as ChronometerData;
    render(<ChronometerRing data={data} />);
    // React would log warnings for bad prop types / format issues.
    // formatNumber(null).toLocaleString() throws which React catches and logs.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('aria-label does not contain the literal string "null"', () => {
    const data = { status: 'empty', target: null } as unknown as ChronometerData;
    render(<ChronometerRing data={data} />);
    const wrapper = screen.getByRole('img');
    const label = wrapper.getAttribute('aria-label') ?? '';
    expect(label).not.toMatch(/null/i);
  });

  it('does not throw when default status data has target=0', () => {
    // Target = 0 is the numeric edge case — division-by-zero must not
    // produce NaN% in the aria-label or visible copy.
    const data: ChronometerData = {
      status: 'default',
      consumed: 500,
      target: 0,
      fiber: { consumed: 5, target: 25 },
      nowAngle: 120,
      entryCount: 1,
      lastLoggedAt: null,
    };
    expect(() => render(<ChronometerRing data={data} />)).not.toThrow();
    const wrapper = screen.getByRole('img');
    const label = wrapper.getAttribute('aria-label') ?? '';
    expect(label).not.toMatch(/nan/i);
    expect(label).not.toMatch(/infinity/i);
  });
});
