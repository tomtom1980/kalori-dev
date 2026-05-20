/**
 * Phase 2D — <MacroDistributionStackedArea /> 5th cholesterol stack.
 *
 * Confirms the chart renders the cholesterol series alongside the existing
 * 4 macros (protein / carbs / fat / fiber), with mg unit in the bar title /
 * data table (NOT g) and a legend entry for cholesterol.
 *
 * Color treatment: --color-rule-strong (muted slate-tan) to match the
 * "limit, not target" semantics Phase 2A picked for the dashboard MacroBars.
 * We assert that the cholesterol series exists via its data-series attribute
 * and that the legend lists cholesterol — colour-by-string-comparison would
 * be too brittle across token changes.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroDistributionStackedArea } from '@/components/charts/MacroDistributionStackedArea';

import type { MacroDistributionData } from '@/lib/aggregations/progress';

function makeData(): MacroDistributionData {
  return {
    range: 'W',
    tz: 'UTC',
    points: [
      {
        bucket: '2026-04-18',
        proteinG: 100,
        carbsG: 200,
        fatG: 60,
        fiberG: 18,
        proteinTargetG: 125,
        carbsTargetG: 225,
        fatTargetG: 67,
        fiberTargetG: 30,
        cholesterolMg: 180,
        cholesterolTargetMg: 300,
      },
      {
        bucket: '2026-04-19',
        proteinG: 110,
        carbsG: 210,
        fatG: 65,
        fiberG: 20,
        proteinTargetG: 125,
        carbsTargetG: 225,
        fatTargetG: 67,
        fiberTargetG: 30,
        cholesterolMg: 240,
        cholesterolTargetMg: 300,
      },
    ],
    sparse: { daysLogged: 7, threshold: 3, isSparse: false },
    srSummary: 'Macro distribution, this week: …',
    window: {
      range: 'W',
      tz: 'UTC',
      startUtc: '',
      endUtc: '',
      userTzStartDay: '2026-04-18',
      userTzEndDay: '2026-04-24',
      bucketCount: 7,
      buckets: ['2026-04-18', '2026-04-19'],
    },
  };
}

describe('<MacroDistributionStackedArea /> — cholesterol (Phase 2D)', () => {
  it('renders a cholesterol series segment on each bucket stack', () => {
    const { container } = render(<MacroDistributionStackedArea data={makeData()} />);
    const cholSegments = container.querySelectorAll('[data-series="cholesterol"]');
    expect(cholSegments).toHaveLength(2); // one per bucket
  });

  it('legend lists cholesterol alongside the existing 4 macros', () => {
    render(<MacroDistributionStackedArea data={makeData()} />);
    const legend = screen.getByRole('list', { name: /macro legend/i });
    expect(legend).toHaveTextContent(/protein/i);
    expect(legend).toHaveTextContent(/carbs/i);
    expect(legend).toHaveTextContent(/fat/i);
    expect(legend).toHaveTextContent(/fiber/i);
    expect(legend).toHaveTextContent(/cholesterol/i);
  });

  it('bar title shows cholesterol in mg, not g', () => {
    const { container } = render(<MacroDistributionStackedArea data={makeData()} />);
    const stack = container.querySelector('[data-testid="mds-stack-2026-04-18"]');
    expect(stack).not.toBeNull();
    const title = (stack as HTMLElement).getAttribute('title') ?? '';
    // mg appears next to the cholesterol number
    expect(title).toMatch(/(?:Chol|Cholesterol)\s+\d+\s*mg/i);
    // sanity: grams are still g for the others
    expect(title).toMatch(/P\s+\d+\s*g/);
  });

  it('cholesterol series uses --color-rule-strong as background fill', () => {
    const { container } = render(<MacroDistributionStackedArea data={makeData()} />);
    const cholSegment = container.querySelector(
      '[data-series="cholesterol"]',
    ) as HTMLElement | null;
    expect(cholSegment).not.toBeNull();
    const bg = cholSegment!.style.background;
    expect(bg).toMatch(/--color-rule-strong/);
  });
});
