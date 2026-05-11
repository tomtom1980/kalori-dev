/**
 * Bug #1 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — dashboard hero-row
 * responsive contract.
 *
 * `app/(app)/dashboard/page.tsx` is a server component that calls Supabase
 * inside the function body, so it cannot be unit-tested via render() without
 * a heavy harness. The hero-row contract is small and structural, so this
 * test takes the same string-assertion approach
 * `tests/unit/design-tokens/ledger-tokens-full.test.ts` uses for globals.css:
 * read the source once and assert the responsive className landed and the
 * legacy hard-coded `gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)'`
 * is gone.
 *
 * Two hero rows live in `dashboard/page.tsx`:
 *   - Row 1 (chronometer + macros)
 *   - Row 2 (water + micros)
 *
 * Both must use `.kalori-dashboard-hero-row` so they collapse to 1fr at
 * mobile widths and only escalate to two columns at >=768.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/(app)/dashboard/page.tsx'), 'utf8');

describe('app/(app)/dashboard/page.tsx — responsive hero rows (Bug #1)', () => {
  it('uses the .kalori-dashboard-hero-row className (so CSS media rules apply)', () => {
    // Both hero rows must reference the className. There are exactly two,
    // so we expect at least two occurrences.
    const matches = source.match(/className=["']kalori-dashboard-hero-row["']/g) ?? [];
    expect(
      matches.length,
      'expected at least 2 .kalori-dashboard-hero-row usages (chronometer/macros + water/micros)',
    ).toBeGreaterThanOrEqual(2);
  });

  it('does NOT inline-set the legacy two-column gridTemplateColumns', () => {
    // The legacy literal we are removing.
    const legacy = `gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)'`;
    expect(
      source.includes(legacy),
      `dashboard/page.tsx must not contain the legacy hard-coded grid: ${legacy}`,
    ).toBe(false);
  });
});

const navShell = readFileSync(resolve(process.cwd(), 'components/nav/nav-shell.tsx'), 'utf8');

describe('components/nav/nav-shell.tsx — responsive page padding (Bug #1)', () => {
  it('<main> uses the .kalori-page-main className', () => {
    expect(navShell).toMatch(/className=["']kalori-page-main["']/);
  });

  it('<main> no longer hard-codes padding: var(--page-padding-mobile)', () => {
    // The legacy inline padding value was tied to mobile only and never
    // escalated. After Bug #1 the className owns padding entirely.
    expect(
      navShell.includes(`padding: 'var(--page-padding-mobile)'`),
      'nav-shell.tsx <main> must no longer inline-set --page-padding-mobile',
    ).toBe(false);
  });
});
