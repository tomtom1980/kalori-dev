/**
 * Task C.1 — AC3 + AC5 integration test: dashboard micros panel.
 *
 * Mounts `<MicrosRdaPanel />` with `DEFAULT_MICROS_LIST`-shaped fixtures
 * (the same shape `aggregateDay` produces via `resolveMicrosRda`) and
 * asserts the render contract:
 *
 *   - AC3: 30-chip grid renders every row from `DEFAULT_MICROS_LIST` with
 *          a "% of RDA" value and the binary threshold attribute.
 *   - AC5: when every row has `value === 0`, the empty-state branch
 *          renders the existing i18n copy (`emptyHeading`, `emptyCaption`)
 *          and NO chip cells render.
 *
 * The resolver is its own unit-tested module (AC4 — `tests/unit/lib/
 * dashboard/micros-rda-resolver.test.ts`). This file ONLY characterises
 * the visual / DOM contract of the panel.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MicrosRdaPanel } from '@/components/dashboard/MicrosRdaPanel';
import { resolveMicrosRda, type MicroRdaRow } from '@/lib/dashboard/micros-rda-resolver';
import type { FoodEntry } from '@/lib/dashboard/types';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';

function populatedRows(): MicroRdaRow[] {
  // Build an entry that contributes a non-zero value to every canonical
  // micronutrient. Values are crafted so a few rows cross the 90%
  // threshold (oxblood foreground) while others stay below (sand).
  const micros: Record<string, number> = {};
  for (const entry of DEFAULT_MICROS_LIST) {
    // Half the RDA for most, full RDA for vitamin_c so AC3 has a row
    // exercising the meetsThreshold=true branch.
    micros[entry.code] = entry.code === 'vitamin_c' ? entry.rda : entry.rda / 2;
  }
  const fakeEntry: FoodEntry = {
    id: 'e1',
    client_id: 'c1',
    logged_at: '2026-05-14T05:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: [
      {
        name: 'composite test meal',
        portion: 1,
        unit: 'piece',
        kcal: 100,
        macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
        micros,
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
  };
  return resolveMicrosRda([fakeEntry]);
}

function emptyRows(): MicroRdaRow[] {
  // resolver([]) returns 30 rows with value=0
  return resolveMicrosRda([]);
}

describe('Task C.1 AC3 — renders-thirty-micros-with-pct-rda', () => {
  it('renders one chip per DEFAULT_MICROS_LIST entry when data is populated', () => {
    const rows = populatedRows();
    expect(rows).toHaveLength(DEFAULT_MICROS_LIST.length);

    render(<MicrosRdaPanel rows={rows} />);

    // Panel + grid render
    expect(screen.getByTestId('micros-rda-panel')).toBeInTheDocument();
    expect(screen.getByTestId('micros-rda-grid')).toBeInTheDocument();

    // Eyebrow header (Phase 1 style spec)
    expect(screen.getByText('MICROS')).toBeInTheDocument();
    expect(screen.getByText('30 ELEMENTS')).toBeInTheDocument();

    // Empty-state branch is NOT mounted
    expect(screen.queryByTestId('micros-rda-empty')).toBeNull();

    // Exactly one chip per canonical code
    for (const entry of DEFAULT_MICROS_LIST) {
      const chip = screen.getByTestId(`micros-rda-chip-${entry.code}`);
      expect(chip).toBeInTheDocument();
      expect(chip.getAttribute('aria-label')).toContain(entry.name);
      expect(chip.getAttribute('aria-label')).toMatch(/\d+ percent of daily reference/);
      // Name label appears
      expect(chip.textContent ?? '').toContain(entry.name);
      // Pct numeral suffix
      expect(chip.textContent ?? '').toMatch(/\d+%/);
    }

    // Total chip count matches the constant
    const chips = screen.getAllByRole('listitem');
    expect(chips).toHaveLength(DEFAULT_MICROS_LIST.length);
  });

  it('flips [data-over-threshold] on rows with pct >= 90 (oxblood foreground)', () => {
    const rows = populatedRows();
    render(<MicrosRdaPanel rows={rows} />);

    // vitamin_c was set to 100% of RDA in the fixture — meetsThreshold=true
    const chip = screen.getByTestId('micros-rda-chip-vitamin_c');
    const pctSpan = chip.querySelector('[data-over-threshold]');
    expect(pctSpan).not.toBeNull();
    expect(pctSpan?.getAttribute('data-over-threshold')).toBe('true');

    // vitamin_a was set to 50% of RDA — meetsThreshold=false
    const vaChip = screen.getByTestId('micros-rda-chip-vitamin_a');
    const vaPctSpan = vaChip.querySelector('[data-over-threshold]');
    // The pct span exists but [data-over-threshold] attribute is undefined
    // (React renders undefined → omitted attribute).
    expect(vaPctSpan).toBeNull();
  });
});

describe('Task C.1 AC5 — sparse-data-empty-state', () => {
  it('renders empty-state heading + caption when every row has value=0', () => {
    const rows = emptyRows();
    expect(rows.every((r) => r.value === 0)).toBe(true);

    render(<MicrosRdaPanel rows={rows} />);

    // Empty-state branch is mounted
    const empty = screen.getByTestId('micros-rda-empty');
    expect(empty).toBeInTheDocument();
    // Existing i18n keys are surfaced verbatim (briefing §8.3)
    expect(empty.textContent ?? '').toContain('— nothing to audit yet —');
    expect(empty.textContent ?? '').toContain(
      'Log a few meals and the minor elements will surface here.',
    );

    // Chip grid is NOT rendered — AC5 prohibits 30 zero-pct chips
    expect(screen.queryByTestId('micros-rda-grid')).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('one non-zero row flips the panel to populated mode (NOT empty-state)', () => {
    // Even a single 1mg contribution to one row prevents empty-state.
    const rows = emptyRows().map((r, i) =>
      i === 0 ? { ...r, value: 1, pct: Math.round((1 / r.rda) * 100) } : r,
    );

    render(<MicrosRdaPanel rows={rows} />);

    // Empty-state NOT mounted
    expect(screen.queryByTestId('micros-rda-empty')).toBeNull();
    // Grid is mounted with all 30 chips (the other 29 show 0%)
    expect(screen.getByTestId('micros-rda-grid')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(DEFAULT_MICROS_LIST.length);
  });
});
