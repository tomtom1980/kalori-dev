/**
 * Task 3.5 Milestone 4.3 — MealsBulletin + MealColumn tests.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MealsBulletin } from '@/components/dashboard/MealsBulletin';
import type { FoodEntry, MealsByCategory } from '@/lib/dashboard/types';

// EntryRowActions (rendered inside MealsBulletin rows) calls useRouter()
// for router.refresh() after delete — happy-dom has no app router, so stub.
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

function makeEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: 'e1',
    client_id: 'c1',
    logged_at: '2026-04-22T08:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: [
      {
        name: 'Eggs',
        portion: 100,
        unit: 'g',
        kcal: 150,
        macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
        micros: {},
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
    ...overrides,
  };
}

describe('<MealsBulletin />', () => {
  it('renders all 5 meal columns (breakfast, lunch, dinner, snack, drink)', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    for (const cat of ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const) {
      expect(screen.getByTestId(`meal-column-${cat}`)).toBeInTheDocument();
    }
  });

  it('each empty column shows the "— none —" placeholder', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    expect(screen.getAllByText('— none —')).toHaveLength(5);
  });

  it('renders entries grouped under their meal category', () => {
    const meals = makeEmptyMeals();
    meals.breakfast = {
      category: 'breakfast',
      entries: [makeEntry({ id: 'e-eggs' })],
      totalKcal: 150,
      heaviestEntryId: 'e-eggs',
    };
    render(<MealsBulletin meals={meals} />);
    const col = screen.getByTestId('meal-column-breakfast');
    expect(col.textContent).toContain('Eggs');
  });

  it('formats entry aria-label time in the supplied local timezone', () => {
    const meals = makeEmptyMeals();
    meals.breakfast = {
      category: 'breakfast',
      entries: [makeEntry({ id: 'e-eggs' })],
      totalKcal: 150,
      heaviestEntryId: 'e-eggs',
    };
    render(<MealsBulletin meals={meals} timezone="Asia/Bangkok" />);
    expect(screen.getByTestId('entry-e-eggs')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('logged at 15:00'),
    );
  });

  it('renders + ADD button per meal column with aria-label', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    const add = screen.getByTestId('meal-add-breakfast');
    expect(add.getAttribute('aria-label')?.toLowerCase()).toContain('breakfast');
  });

  it('renders the bulletin header text', () => {
    const { container } = render(<MealsBulletin meals={makeEmptyMeals()} />);
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toMatch(/The day.*s entries/i);
  });

  it('renders category kickers (§ 01 BREAKFAST etc.)', () => {
    render(<MealsBulletin meals={makeEmptyMeals()} />);
    expect(screen.getByText(/§ 01 · BREAKFAST/)).toBeInTheDocument();
    expect(screen.getByText(/§ 05 · DRINK/)).toBeInTheDocument();
  });
});
