/**
 * Task 3.7 fix — F-UI-3.7-A: `<MicronutrientPanel />` must not pass a
 * function as `children` to the `<MicrosOverflowToggle />` client leaf.
 *
 * React 19 contract: server components cannot pass non-serializable props
 * (functions, class instances, Symbols) across the server→client boundary.
 * Render-props across this boundary fail because RSC cannot serialize the
 * function for hydration.
 *
 * Previous (buggy) implementation passed a render function:
 *   <MicrosOverflowToggle ...>
 *     {(expanded) => <div>{expanded ? full : partial}</div>}
 *   </MicrosOverflowToggle>
 *
 * The fix moves the visible/hidden split + Row rendering INSIDE the client
 * leaf, which receives serializable props (rows + visibleCount) and owns
 * the toggle state + conditional render internally.
 *
 * Structural assertion strategy: inspect the compiled source of both
 * MicronutrientPanel.tsx and MicrosOverflowToggle.tsx. If the panel
 * constructs JSX of the form `<MicrosOverflowToggle ...>{(...) => ...}`,
 * OR if the client leaf declares `children: (...) => ReactNode`, the test
 * fails. This locks the invariant at the source level rather than hoping
 * happy-dom replicates RSC semantics.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MicronutrientPanel } from '@/components/dashboard/MicronutrientPanel';
import type { MicroRow } from '@/lib/dashboard/types';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const PANEL_SRC = readFileSync(
  path.join(repoRoot, 'components', 'dashboard', 'MicronutrientPanel.tsx'),
  'utf-8',
);
const TOGGLE_SRC = readFileSync(
  path.join(repoRoot, 'components', 'dashboard', 'MicrosOverflowToggle.tsx'),
  'utf-8',
);

const rows: MicroRow[] = Array.from({ length: 11 }).map((_, i) => ({
  name: `micro-${i + 1}`,
  consumed: 100 + i,
  rda: 200,
  pct: 50 + i,
  status: i % 2 === 0 ? 'mid' : 'low',
}));

describe('<MicronutrientPanel /> — RSC boundary compliance (F-UI-3.7-A)', () => {
  it('MicronutrientPanel source does not contain a render-prop JSX child for MicrosOverflowToggle', () => {
    // Matches `{(arg) => ...}` or `{(arg) =>` patterns — the render-prop
    // signature. Finding this literal pattern anywhere in the panel source
    // is the bug shape we are eliminating.
    const renderPropRegex = /\{\s*\([a-zA-Z_$][\w$]*\)\s*=>/;
    expect(
      renderPropRegex.test(PANEL_SRC),
      'MicronutrientPanel.tsx must not embed a JSX render-prop child; ' +
        'move rendering logic INSIDE MicrosOverflowToggle so no function ' +
        'crosses the server→client RSC boundary.',
    ).toBe(false);
  });

  it('MicrosOverflowToggle does not declare `children` as a function type', () => {
    // Matches `children: (... ) => ...` or variations with whitespace. The
    // client leaf must receive serializable children (ReactNode) only.
    const fnChildrenRegex = /children\s*:\s*\([^)]*\)\s*=>/;
    expect(
      fnChildrenRegex.test(TOGGLE_SRC),
      'MicrosOverflowToggle.tsx must not declare `children` as a function; ' +
        'use serializable props (rows, visibleCount) instead.',
    ).toBe(false);
  });

  it('still renders visibleCount rows initially and full list after expand', async () => {
    render(<MicronutrientPanel rows={rows} visibleCount={7} />);
    expect(screen.getAllByRole('meter').length).toBe(7);
    const toggle = screen.getByTestId('micros-overflow-toggle');
    await userEvent.click(toggle);
    expect(screen.getAllByRole('meter').length).toBe(rows.length);
  });
});
