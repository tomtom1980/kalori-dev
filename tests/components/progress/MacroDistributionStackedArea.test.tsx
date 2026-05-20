/**
 * Component tests for <MacroDistributionStackedArea /> (Task 4.3a).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

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
        cholesterolMg: 220,
        cholesterolTargetMg: 300,
      },
    ],
    sparse: { daysLogged: 2, threshold: 3, isSparse: true },
    srSummary:
      'Macro distribution, this week: total protein 210g, carbs 410g, fat 125g, fiber 38g.',
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

describe('<MacroDistributionStackedArea />', () => {
  it('renders one stack per bucket', () => {
    render(<MacroDistributionStackedArea data={makeData()} />);
    expect(screen.getAllByTestId(/^mds-stack-/)).toHaveLength(2);
  });

  it('renders legend with protein/carbs/fat/fiber items', () => {
    render(<MacroDistributionStackedArea data={makeData()} />);
    const legend = screen.getByRole('list', { name: /macro legend/i });
    expect(legend).toHaveTextContent(/protein/i);
    expect(legend).toHaveTextContent(/carbs/i);
    expect(legend).toHaveTextContent(/fat/i);
    expect(legend).toHaveTextContent(/fiber/i);
  });

  it('has zero axe violations', async () => {
    const { container } = render(<MacroDistributionStackedArea data={makeData()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
