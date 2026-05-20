/**
 * Cholesterol bar-fill bug fix (2026-05-16).
 *
 * Bug: the cholesterol row used `--color-rule-strong` for its bar fill —
 * the SAME variable applied to the bar's track/rail background. As a
 * result the fill rendered at the correct width but was visually
 * invisible against the identical-coloured track. Users reported "no
 * color and no fill" on the dashboard cholesterol row.
 *
 * Fix: switch the cholesterol fill colour to `--color-plum` — the
 * 5th-series token explicitly reserved in `globals.css` for a 5th
 * macro/data series. Still muted (signals "limit, not target") but
 * visually distinct from the rail.
 *
 * These tests assert structural rendering AND the colour token
 * difference so any future regression that hides the fill behind the
 * rail again will fail.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroBars } from '@/components/dashboard/MacroBars';
import type { MacroContribution, MacrosByKey } from '@/lib/dashboard/types';

function contribution(overrides: Partial<MacroContribution> = {}): MacroContribution {
  return {
    id: 'e1:0:cholesterol',
    entryId: 'e1',
    mealCategory: 'breakfast',
    loggedAt: '2026-05-16T08:00:00.000Z',
    itemName: 'Egg',
    portionLabel: '1 large',
    grams: 150,
    amount: 150,
    pctOfTotal: 100,
    ...overrides,
  };
}

function emptyMacroRow(key: 'protein' | 'carbs' | 'fat' | 'fiber') {
  const targets = { protein: 125, carbs: 225, fat: 67, fiber: 25 } as const;
  return {
    key,
    unit: 'g' as const,
    consumedG: 0,
    targetG: targets[key],
    pct: 0,
    status: 'empty' as const,
    contributions: [],
  };
}

function buildMacros(opts: {
  consumed: number;
  target?: number;
  status?: 'empty' | 'default' | 'on-target' | 'over';
}): MacrosByKey {
  const target = opts.target ?? 300;
  const pct = target > 0 ? Math.round((opts.consumed / target) * 100) : 0;
  const status =
    opts.status ??
    (opts.consumed === 0
      ? 'empty'
      : pct > 105
        ? 'over'
        : pct >= 95 && pct <= 105
          ? 'on-target'
          : 'default');
  return {
    protein: emptyMacroRow('protein'),
    carbs: emptyMacroRow('carbs'),
    fat: emptyMacroRow('fat'),
    fiber: emptyMacroRow('fiber'),
    cholesterol: {
      key: 'cholesterol',
      unit: 'mg',
      consumedG: opts.consumed,
      targetG: target,
      pct,
      status,
      contributions:
        opts.consumed === 0 ? [] : [contribution({ amount: opts.consumed, grams: opts.consumed })],
    },
  };
}

/**
 * Walk the cholesterol macro row's DOM to find the bar's track div and
 * the fill div. Returns the {track, fill} pair so the test can compare
 * their inline `background` properties.
 *
 * Layout from MacroBars.tsx: the row button contains a "track" div
 * (8px height, `--color-rule-strong` background) with a positioned
 * "fill" div inside it. The fill is the only absolutely-positioned
 * child of the track.
 */
function getBarParts(row: HTMLElement): { track: HTMLElement; fill: HTMLElement } {
  // The track is the div with explicit `height: 8px` inline style.
  const allDivs = row.querySelectorAll<HTMLElement>('div');
  let track: HTMLElement | null = null;
  for (const d of allDivs) {
    if (d.style.height === '8px') {
      track = d;
      break;
    }
  }
  if (!track) throw new Error('Cholesterol bar track (height:8px div) not found');
  const fill = track.querySelector<HTMLElement>(':scope > div');
  if (!fill) throw new Error('Cholesterol bar fill (track > div) not found');
  return { track, fill };
}

describe('<MacroBars /> — cholesterol bar fill visibility', () => {
  it('renders the bar fill with a different background colour than the rail (track)', () => {
    render(<MacroBars macros={buildMacros({ consumed: 150 })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { track, fill } = getBarParts(row);
    // The rail uses --color-rule-strong. The fill MUST NOT use the same
    // token, otherwise it is invisible against the track.
    expect(track.style.background).toContain('--color-rule-strong');
    expect(fill.style.background).not.toContain('--color-rule-strong');
  });

  it('renders the bar fill using --color-plum (the 5th-series cholesterol colour)', () => {
    render(<MacroBars macros={buildMacros({ consumed: 150 })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { fill } = getBarParts(row);
    expect(fill.style.background).toContain('--color-plum');
  });

  it('fills the bar to ~50% width when consumed=150 / target=300 (status default)', () => {
    render(<MacroBars macros={buildMacros({ consumed: 150, target: 300 })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { fill } = getBarParts(row);
    // The fill is rendered with `transform: scaleX(pct/100)`. At 50%
    // pct, scaleX(0.5). The transform string is set inline.
    expect(fill.style.transform).toContain('scaleX(0.5)');
  });

  it('caps the fill visually at scaleX(1) when over target, but text shows actual percent', () => {
    render(<MacroBars macros={buildMacros({ consumed: 400, target: 300, status: 'over' })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { fill } = getBarParts(row);
    // Math.min(100, 133) = 100 → scaleX(1).
    expect(fill.style.transform).toContain('scaleX(1)');
    // Text shows the actual percent.
    expect(row.textContent).toMatch(/133\s*%/);
  });

  it('uses oxblood (warning) for the fill when status === over', () => {
    render(<MacroBars macros={buildMacros({ consumed: 400, target: 300, status: 'over' })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { fill } = getBarParts(row);
    expect(fill.style.background).toContain('--color-oxblood');
  });

  it('shows no visible fill when status === empty (consumed = 0)', () => {
    render(<MacroBars macros={buildMacros({ consumed: 0, status: 'empty' })} />);
    const row = screen.getByTestId('macro-row-cholesterol');
    const { fill } = getBarParts(row);
    expect(fill.style.transform).toContain('scaleX(0)');
  });
});
