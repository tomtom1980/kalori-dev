/**
 * Bug #1 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — responsive grid contract
 * for `<MealsBulletin />`.
 *
 * Before this bug fix, MealsBulletin shipped an inline
 * `style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}` which clipped
 * to ~68px-per-column at the 375px viewport. The fix replaces the inline
 * `gridTemplateColumns` declaration with a `.kalori-meals-bulletin-grid`
 * className so the same DOM tree responds to the canonical 768/1280
 * breakpoints via globals.css media rules.
 *
 * This test asserts the markup contract the CSS depends on:
 *   1. The 5 MealColumn children render at every viewport (no DOM swapping).
 *   2. The grid container carries the `.kalori-meals-bulletin-grid` className.
 *   3. The container does NOT carry the legacy hard-coded
 *      `gridTemplateColumns: repeat(5, minmax(0, 1fr))` inline style — that
 *      would defeat the responsive media rules.
 *
 * happy-dom does not honour @media branches, so we cannot assert the actual
 * computed grid-template-columns at simulated viewports here; the
 * accompanying string-assertion test
 * (`tests/unit/design-tokens/responsive-page-classes.test.ts`) verifies the
 * CSS rules are correctly authored, and the Playwright spec under
 * `tests/visual/responsive-overflow.spec.ts` proves no horizontal overflow
 * at 375 / 768 / 1280 in real Chromium.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MealsBulletin } from '@/components/dashboard/MealsBulletin';
import type { MealsByCategory } from '@/lib/dashboard/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeEmptyMeals(): MealsByCategory {
  return {
    breakfast: { category: 'breakfast', entries: [], totalKcal: 0, heaviestEntryId: null },
    lunch: { category: 'lunch', entries: [], totalKcal: 0, heaviestEntryId: null },
    dinner: { category: 'dinner', entries: [], totalKcal: 0, heaviestEntryId: null },
    snack: { category: 'snack', entries: [], totalKcal: 0, heaviestEntryId: null },
    drink: { category: 'drink', entries: [], totalKcal: 0, heaviestEntryId: null },
  };
}

describe('<MealsBulletin /> — responsive grid contract (Bug #1)', () => {
  it('renders all 5 meal columns regardless of viewport (no DOM swapping)', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    for (const cat of ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const) {
      expect(screen.getByTestId(`meal-column-${cat}`)).toBeInTheDocument();
    }
  });

  it('grid container carries the .kalori-meals-bulletin-grid className so CSS media rules apply', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    const bulletin = screen.getByTestId('meals-bulletin');
    // The 5 MealColumn children share a parent grid container — locate it via
    // the first meal column and walk up to the className-bearing wrapper.
    const breakfast = screen.getByTestId('meal-column-breakfast');
    const gridContainer = breakfast.parentElement;
    expect(gridContainer, 'meal-column-breakfast must have a parent grid wrapper').not.toBeNull();
    expect(gridContainer!.className).toContain('kalori-meals-bulletin-grid');
    // The grid must live inside the bulletin section (sanity check).
    expect(bulletin.contains(gridContainer)).toBe(true);
  });

  it('grid container does NOT inline-set gridTemplateColumns: repeat(5, ...) anymore', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    const breakfast = screen.getByTestId('meal-column-breakfast');
    const gridContainer = breakfast.parentElement as HTMLElement;
    // The legacy hard-coded value would override the media rules. After the
    // fix the inline style.gridTemplateColumns must be empty (CSS owns it).
    expect(gridContainer.style.gridTemplateColumns).toBe('');
  });
});
