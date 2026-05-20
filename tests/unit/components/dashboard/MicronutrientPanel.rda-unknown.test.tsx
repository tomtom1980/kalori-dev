/**
 * Codex R2 I2 regression test (bugfix-tomi 2026-05-17-micros-display-consistency).
 *
 * The R1 fix correctly keeps RDA-unknown rows (sugar / caffeine / orphan)
 * visible at the END of the dashboard panel's sorted list, but the public
 * row shape still carried `{ pct: 0, status: 'low' }`. Result: the renderer
 * (`MicrosOverflowToggle`) painted RDA-unknown rows red with a `0%` label
 * and an aria phrase of "below reference" — a user-visible false nutrition
 * signal.
 *
 * R2 fix: RDA-unknown rows must reach the renderer with a distinct status
 * value (`'unknown'`) so the renderer can:
 *
 *   1. Omit the `0%` numeric label (replace with a non-numeric placeholder,
 *      typically an em-dash).
 *   2. Avoid the "low" red color treatment (no oxblood fill, no ember pct
 *      text).
 *   3. Use neutral aria copy (e.g., "no daily reference") instead of the
 *      "below reference" wording reserved for actually-low measurable rows.
 *
 * Mirrors the existing `<MicrosReadOnly />` behaviour in
 * `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` which
 * already distinguishes `dvPct === null` rows from measurable rows.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MicronutrientPanel } from '@/components/dashboard/MicronutrientPanel';
import type { MicroRow } from '@/lib/dashboard/types';

const baselineRows: MicroRow[] = [
  // One measurable low row so we can contrast "real low" against "unknown".
  { name: 'Iron', consumed: 4, rda: 18, pct: 22, status: 'low', unit: 'mg' },
  // RDA-unknown row — the sugar / caffeine / orphan shape.
  { name: 'sugar', consumed: 25, rda: null, pct: 0, status: 'unknown', unit: 'g' },
];

describe('<MicronutrientPanel /> — RDA-unknown rendering (Codex R2 I2)', () => {
  it('RDA-unknown row does NOT render a "0%" percentage label', () => {
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const sugarRow = screen.getByTestId('micro-row-sugar');
    // The row must not contain the literal "0%" or "0 %" anywhere in its
    // visible text. Measurable rows still carry a "{n}%" label; unknown
    // rows fall back to an em-dash (or other non-numeric placeholder).
    expect(sugarRow.textContent ?? '').not.toMatch(/0\s*%/);
  });

  it('RDA-unknown row aria description does NOT include "below reference"', () => {
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const sugarRow = screen.getByTestId('micro-row-sugar');
    // The "low" / "mid" rows carry "below reference" in their aria copy.
    // RDA-unknown rows must use a neutral phrase ("no daily reference").
    const ariaText =
      sugarRow.getAttribute('aria-label') ?? sugarRow.getAttribute('aria-valuetext') ?? '';
    expect(ariaText.toLowerCase()).not.toContain('below reference');
    // Sanity: the unknown row must still convey SOME accessible name so
    // assistive tech can announce it.
    expect(ariaText.toLowerCase()).toContain('sugar');
  });

  it('RDA-unknown row aria copy says "no daily reference" (neutral phrasing)', () => {
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const sugarRow = screen.getByTestId('micro-row-sugar');
    const ariaText =
      sugarRow.getAttribute('aria-label') ?? sugarRow.getAttribute('aria-valuetext') ?? '';
    expect(ariaText.toLowerCase()).toContain('no daily reference');
  });

  it('measurable low row still renders the "{pct}%" label and "below reference" aria', () => {
    // Regression guard: the I2 fix must NOT change the existing behaviour
    // for measurable rows. The iron row (22% RDA) is still painted as "low"
    // with the 22% label + "below reference" aria copy.
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const ironRow = screen.getByTestId('micro-row-Iron');
    expect(ironRow.textContent ?? '').toMatch(/22\s*%/);
    const ariaText =
      ironRow.getAttribute('aria-label') ?? ironRow.getAttribute('aria-valuetext') ?? '';
    expect(ariaText.toLowerCase()).toContain('below reference');
  });

  it('RDA-unknown row does NOT render a meter bar fill (no scaleX transform with non-zero %)', () => {
    // The "low" red oxblood fill is painted via a scaleX(...) transform on
    // an absolute-positioned div inside the meter row. For an RDA-unknown
    // row we never want that visual treatment — the row should read as
    // "no daily reference" rather than "empty bar at 0% red".
    //
    // Assertion: the sugar row's inner DOM must NOT contain any element
    // whose style includes `--color-oxblood` (the low fill color) or an
    // ember pct color. The neutral palette uses --color-dust / --color-sand.
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const sugarRow = screen.getByTestId('micro-row-sugar');
    const sugarHtml = sugarRow.outerHTML;
    expect(sugarHtml).not.toContain('var(--color-oxblood)');
    expect(sugarHtml).not.toContain('var(--color-ember)');
  });

  it('measurable rows still contrast: iron row uses oxblood + ember', () => {
    // Regression guard for the color palette pinning above. The measurable
    // low iron row MUST still paint oxblood + ember — those are the visual
    // signals reserved for "actually below the reference RDA".
    render(<MicronutrientPanel rows={baselineRows} visibleCount={10} />);
    const ironRow = screen.getByTestId('micro-row-Iron');
    const ironHtml = ironRow.outerHTML;
    // Either the fill color OR the pct text color carries the low palette;
    // the contract is "at least one of them does". We require the fill.
    expect(ironHtml).toContain('var(--color-oxblood)');
  });
});

describe('<MicronutrientPanel /> — RDA-unknown coexistence with overflow toggle', () => {
  it('RDA-unknown rows behind the overflow toggle render with neutral treatment after expand', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    // Push the unknown row into the hidden tail so we exercise the
    // post-expand render path (Codex R2 finding noted "MicrosOverflowToggle
    // paints them red" — covers both visible AND hidden slices).
    const rows: MicroRow[] = [
      // Eight measurable rows fill the visible slice.
      ...Array.from({ length: 8 }, (_, i) => ({
        name: `Micro ${i + 1}`,
        consumed: 50,
        rda: 100,
        pct: 50,
        status: 'mid' as const,
        unit: 'mg',
      })),
      // Hidden tail: the unknown sugar row.
      { name: 'sugar', consumed: 25, rda: null, pct: 0, status: 'unknown', unit: 'g' },
    ];
    render(<MicronutrientPanel rows={rows} visibleCount={8} />);

    // Initially sugar should not be in the DOM.
    expect(screen.queryByTestId('micro-row-sugar')).toBeNull();

    const toggle = screen.getByTestId('micros-overflow-toggle');
    await userEvent.click(toggle);

    const sugarRow = screen.getByTestId('micro-row-sugar');
    expect(sugarRow.textContent ?? '').not.toMatch(/0\s*%/);
    const ariaText =
      sugarRow.getAttribute('aria-label') ?? sugarRow.getAttribute('aria-valuetext') ?? '';
    expect(ariaText.toLowerCase()).not.toContain('below reference');
    expect(within(sugarRow).queryByText(/below reference/i)).toBeNull();
  });
});
