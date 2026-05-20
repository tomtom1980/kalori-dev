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
 * One hero row lives in `dashboard/page.tsx`:
 *   - Row 1 (chronometer + macros)
 *
 * It must use `.kalori-dashboard-hero-row` so it collapses to 1fr at
 * mobile widths and only escalates to two columns at >=768.
 *
 * 2026-05-16 update — the dashboard layout was simplified so the
 * MicrosRdaPanel was removed and the second hero row (water + micros)
 * was unrolled into stacked full-width sections (entries → micros →
 * water). Only one hero row remains. The legacy-grid guard below
 * stays as a regression check.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/(app)/dashboard/page.tsx'), 'utf8');

describe('app/(app)/dashboard/page.tsx — responsive hero rows (Bug #1)', () => {
  it('uses the .kalori-dashboard-hero-row className (so CSS media rules apply)', () => {
    // After the 2026-05-16 layout simplification there is exactly one
    // hero row (chronometer + macros). The legacy two-row layout had
    // a second one for water + micros which is now unrolled.
    const matches = source.match(/className=["']kalori-dashboard-hero-row["']/g) ?? [];
    expect(
      matches.length,
      'expected at least 1 .kalori-dashboard-hero-row usage (chronometer/macros)',
    ).toBeGreaterThanOrEqual(1);
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
