import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyEditorsNote } from '@/components/dashboard/DailyEditorsNote';
import { buildDailyEditorsNote } from '@/lib/dashboard/daily-editors-note';
import type { DashboardSnapshot, MacrosByKey, MealsByCategory } from '@/lib/dashboard/types';

const emptyMacros: MacrosByKey = {
  protein: {
    key: 'protein',
    consumedG: 0,
    targetG: 120,
    pct: 0,
    status: 'empty',
    contributions: [],
  },
  carbs: { key: 'carbs', consumedG: 0, targetG: 260, pct: 0, status: 'empty', contributions: [] },
  fat: { key: 'fat', consumedG: 0, targetG: 70, pct: 0, status: 'empty', contributions: [] },
  fiber: { key: 'fiber', consumedG: 0, targetG: 25, pct: 0, status: 'empty', contributions: [] },
};

const emptyMeals: MealsByCategory = {
  breakfast: { category: 'breakfast', entries: [], totalKcal: 0, heaviestEntryId: null },
  lunch: { category: 'lunch', entries: [], totalKcal: 0, heaviestEntryId: null },
  dinner: { category: 'dinner', entries: [], totalKcal: 0, heaviestEntryId: null },
  snack: { category: 'snack', entries: [], totalKcal: 0, heaviestEntryId: null },
  drink: { category: 'drink', entries: [], totalKcal: 0, heaviestEntryId: null },
};

function makeSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    edition: { n: 1, weekday: 'Monday', day: 18, month: 'May', year: 2026 },
    chronometer: { status: 'empty', target: 2000 },
    macros: emptyMacros,
    meals: emptyMeals,
    water: { consumedMl: 0, targetMl: 2000, entries: [] },
    bac: { value: 0, calculatedAt: '2026-05-18T12:00:00.000Z' },
    micros: [],
    microsRda: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildDailyEditorsNote', () => {
  it('returns a clear daily empty state without weekly review wording', () => {
    const note = buildDailyEditorsNote(makeSnapshot(), '2026-05-18');

    expect(note.body).toMatch(/nothing is logged/i);
    expect(note.body).toMatch(/log food/i);
    expect(note.body).not.toMatch(/week|weekly|full review/i);
    expect(note.bullets).toEqual([]);
  });

  it('summarizes populated daily snapshot facts with outcome, recommendation, and signal bullets', () => {
    const note = buildDailyEditorsNote(
      makeSnapshot({
        chronometer: {
          status: 'over-target',
          consumed: 2250,
          target: 2000,
          fiber: { consumed: 8, target: 25 },
          nowAngle: 180,
          entryCount: 2,
          lastLoggedAt: '2026-05-18T12:00:00.000Z',
        },
        macros: {
          ...emptyMacros,
          protein: {
            key: 'protein',
            consumedG: 100,
            targetG: 120,
            pct: 83,
            status: 'on-target',
            contributions: [],
          },
          fiber: {
            key: 'fiber',
            consumedG: 8,
            targetG: 25,
            pct: 32,
            status: 'default',
            contributions: [],
          },
        },
        water: { consumedMl: 500, targetMl: 2000, entries: [] },
        micros: [{ name: 'Iron', consumed: 4, rda: 18, pct: 22, status: 'low', unit: 'mg' }],
      }),
      '2026-05-18',
    );

    expect(note.body).toMatch(/2 entries/i);
    expect(note.body).toMatch(/2,250 of 2,000 kcal/i);
    expect(note.body).not.toMatch(/week|weekly|full review/i);
    expect(note.bullets.join(' ')).toMatch(/Outcome:/i);
    expect(note.bullets.join(' ')).toMatch(/Recommendation:/i);
    expect(note.bullets.join(' ')).toMatch(/Needs attention:/i);
    expect(note.bullets.join(' ')).toMatch(/water|fiber|iron/i);
  });
});

describe('<DailyEditorsNote />', () => {
  it('renders the first-load skeleton before the AI summary resolves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    render(<DailyEditorsNote snapshot={makeSnapshot()} viewedDay="2026-05-18" aiSummaryOptIn />);

    expect(screen.getByTestId('daily-editors-note')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('daily-editors-note-skeleton')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/week|weekly|full review/i);
  });
});
