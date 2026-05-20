/**
 * Phase 2A — dashboard layout restructure: water + micros side-by-side.
 *
 * `app/(app)/dashboard/page.tsx` is a server component that touches Supabase
 * inside the function body, so it cannot be unit-tested via `render()`
 * without a heavy harness. Following the same string-assertion approach as
 * `dashboard-page-responsive.test.ts`, this test reads the source and
 * asserts:
 *   - A `.kalori-dashboard-water-micros-row` (or equivalent reusable class)
 *     wraps the MicronutrientPanel + WaterTracker pair on tablet+.
 *   - The DOM order inside that row is MicronutrientPanel FIRST, then
 *     WaterTracker.
 *   - The CSS class is defined in `app/globals.css` and uses the same
 *     responsive pattern as `.kalori-dashboard-hero-row` (stacked on mobile,
 *     2-col equal at min-width: 768px).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'app/(app)/dashboard/page.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

const WATER_MICROS_CLASS = 'kalori-dashboard-water-micros-row';

describe('app/(app)/dashboard/page.tsx — water + micros 2-col row (Phase 2A)', () => {
  it('imports and renders BacTracker in the water-side stack', () => {
    expect(pageSource).toContain("from '@/components/dashboard/BacTracker'");

    const rowOpenIdx = pageSource.indexOf(WATER_MICROS_CLASS);
    expect(rowOpenIdx, 'water-micros row class must appear in dashboard/page.tsx').toBeGreaterThan(
      -1,
    );
    const waterIdx = pageSource.indexOf('<WaterTracker', rowOpenIdx);
    const bacIdx = pageSource.indexOf('<BacTracker', rowOpenIdx);
    expect(waterIdx).toBeGreaterThan(-1);
    expect(bacIdx).toBeGreaterThan(-1);
    expect(waterIdx, 'BacTracker should stack after WaterTracker on the right side').toBeLessThan(
      bacIdx,
    );
    expect(pageSource.slice(waterIdx, bacIdx)).not.toMatch(/<\/FadeUpCard>\s*<FadeUpCard/);
  });

  it('renders a side-by-side row class wrapping MicronutrientPanel + WaterTracker', () => {
    expect(
      pageSource,
      `dashboard/page.tsx must use .${WATER_MICROS_CLASS} to lay MicronutrientPanel + WaterTracker side-by-side`,
    ).toMatch(new RegExp(`className=["']${WATER_MICROS_CLASS}["']`));
  });

  it('renders MicronutrientPanel BEFORE WaterTracker inside the water-micros row', () => {
    // Locate the side-by-side row block and assert MicronutrientPanel
    // appears textually before WaterTracker inside it.
    const rowOpenIdx = pageSource.indexOf(WATER_MICROS_CLASS);
    expect(rowOpenIdx, 'water-micros row class must appear in dashboard/page.tsx').toBeGreaterThan(
      -1,
    );
    const microsIdx = pageSource.indexOf('<MicronutrientPanel', rowOpenIdx);
    const waterIdx = pageSource.indexOf('<WaterTracker', rowOpenIdx);
    expect(microsIdx).toBeGreaterThan(-1);
    expect(waterIdx).toBeGreaterThan(-1);
    expect(microsIdx, 'MicronutrientPanel must render before WaterTracker').toBeLessThan(waterIdx);
  });

  it('no longer renders MicronutrientPanel and WaterTracker as two separate full-width FadeUpCards in sequence', () => {
    // Defensive regression guard: the legacy structure had two consecutive
    // top-level FadeUpCard wrappers, one for MicronutrientPanel and one for
    // WaterTracker, with no shared parent row. Once the side-by-side row
    // lands, they must share a parent that carries the row class.
    const microsIdx = pageSource.indexOf('<MicronutrientPanel');
    const waterIdx = pageSource.indexOf('<WaterTracker');
    expect(microsIdx).toBeGreaterThan(-1);
    expect(waterIdx).toBeGreaterThan(-1);
    // The substring between them must contain the row class (i.e., they
    // sit inside the same row element).
    const between = pageSource.slice(microsIdx, waterIdx);
    expect(
      between,
      'MicronutrientPanel and WaterTracker must share a parent carrying the water-micros row class',
    ).not.toMatch(/<\/div>\s*<\/FadeUpCard>\s*<FadeUpCard/);
  });
});

describe('app/globals.css — .kalori-dashboard-water-micros-row responsive contract', () => {
  it('defines a base rule for the water-micros row (stacked single column on mobile)', () => {
    // Base rule: 1fr grid, no media query.
    const baseRule = new RegExp(
      `\\.${WATER_MICROS_CLASS}\\s*\\{[^}]*grid-template-columns:\\s*1fr[^}]*\\}`,
      's',
    );
    expect(
      globalsSource,
      `app/globals.css must define a base .${WATER_MICROS_CLASS} rule with grid-template-columns: 1fr`,
    ).toMatch(baseRule);
  });

  it('escalates to 2-col equal tracks at desktop width (matching the hero row pattern)', () => {
    // Look for the class inside any @media (min-width: 1280px) block,
    // with the 2-col template using minmax(0, 1fr).
    const tabletPattern = new RegExp(
      `@media\\s*\\(min-width:\\s*1280px\\)\\s*\\{[\\s\\S]*?\\.${WATER_MICROS_CLASS}\\s*\\{[\\s\\S]*?grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)\\s+minmax\\(0,\\s*1fr\\)[\\s\\S]*?\\}`,
      's',
    );
    expect(
      globalsSource,
      `app/globals.css must escalate .${WATER_MICROS_CLASS} to 2-col at >=1280px`,
    ).toMatch(tabletPattern);
  });

  it('children of the row can shrink (min-width: 0) — mirrors hero row child rule', () => {
    const childRule = new RegExp(
      `\\.${WATER_MICROS_CLASS}\\s*>\\s*\\*\\s*\\{[^}]*min-width:\\s*0`,
      's',
    );
    expect(
      globalsSource,
      `app/globals.css must declare \`.${WATER_MICROS_CLASS} > * { min-width: 0 }\` so flex/grid children can shrink`,
    ).toMatch(childRule);
  });
});
