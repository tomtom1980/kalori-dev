/**
 * Bug #1 (bugfix-tomi 2026-05-08-mobile-ui-overhaul) — String-assertion test
 * for the three new responsive utility class blocks added to globals.css:
 *
 *   - `.kalori-page-main`             page-padding token escalation 16/32/48
 *   - `.kalori-dashboard-hero-row`    1fr → 2-col at >=768
 *   - `.kalori-meals-bulletin-grid`   1fr → 2-col at >=768 → 5-col at >=1280
 *
 * The contract mirrors the existing `nav-shell-*` block at lines 663-686 of
 * `app/globals.css`: each class has a mobile default and escalates at the
 * canonical 768 / 1280 breakpoints (the same ones Tailwind v4 ships).
 *
 * String-assertion style follows the precedent set by
 * `tests/unit/design-tokens/ledger-tokens-full.test.ts` — read globals.css
 * once and assert the rule blocks are present and structurally correct. We
 * intentionally do NOT compute padding values via getComputedStyle: jsdom /
 * happy-dom both ship CSSOM impls that don't honour `@media (min-width: …)`
 * branches, so any test relying on getComputedStyle would silently pass
 * regardless of the actual rules. Asserting the source string is the
 * deterministic alternative.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * Helper — locate a CSS rule body by its selector and return the inner block
 * (between the first `{` and its matching `}`). Returns null if not found.
 */
function ruleBody(selector: string): string | null {
  // Find the selector at the start of a rule, optionally preceded by a media
  // query opening brace. Selectors must match exactly to avoid catching
  // `.kalori-page-main-wrapper` when looking for `.kalori-page-main`.
  const re = new RegExp(`(^|[\\s{])${selector.replace(/\./g, '\\.')}\\s*\\{`, 'm');
  const m = css.match(re);
  if (!m || m.index === undefined) return null;
  // Compute body start: position of `{` after the selector.
  const braceStart = css.indexOf('{', m.index + m[0].length - 1);
  if (braceStart === -1) return null;
  // Walk forward to matching close brace (rule bodies don't nest braces).
  let depth = 1;
  for (let i = braceStart + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  return null;
}

/**
 * Helper — extract the body of a `@media (min-width: Npx)` block as a single
 * string. Useful for asserting that a class declaration appears INSIDE the
 * 768/1280 media block (not in the mobile-default scope).
 */
function mediaBlockBody(minWidthPx: number): string | null {
  const re = new RegExp(`@media\\s*\\(\\s*min-width:\\s*${minWidthPx}px\\s*\\)\\s*\\{`, 'm');
  const m = css.match(re);
  if (!m || m.index === undefined) return null;
  const braceStart = css.indexOf('{', m.index + m[0].length - 1);
  if (braceStart === -1) return null;
  // Walk forward to matching close brace, allowing nested rule braces.
  let depth = 1;
  for (let i = braceStart + 1; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(braceStart + 1, i);
    }
  }
  return null;
}

describe('globals.css — responsive page classes (Bug #1)', () => {
  describe('.kalori-page-main', () => {
    it('declares mobile-default padding using --page-padding-mobile', () => {
      const body = ruleBody('.kalori-page-main');
      expect(body, '.kalori-page-main rule must exist').not.toBeNull();
      expect(body!).toMatch(/padding:\s*var\(--page-padding-mobile\)/);
    });

    it('escalates padding to --page-padding-desktop inside @media (min-width: 1280px)', () => {
      const desktop = mediaBlockBody(1280);
      expect(desktop, '@media (min-width: 1280px) block must exist').not.toBeNull();
      expect(desktop!).toMatch(
        /\.kalori-page-main\s*\{[^}]*padding:\s*var\(--page-padding-desktop\)[^}]*\}/,
      );
    });
  });

  describe('.kalori-dashboard-hero-row', () => {
    it('declares mobile-default single-column grid (1fr)', () => {
      const body = ruleBody('.kalori-dashboard-hero-row');
      expect(body, '.kalori-dashboard-hero-row rule must exist').not.toBeNull();
      expect(body!).toMatch(/display:\s*grid/);
      expect(body!).toMatch(/grid-template-columns:\s*1fr\b/);
      // Preserve the existing editorial gutter gap.
      expect(body!).toMatch(/gap:\s*var\(--spacing-gutter-editorial\)/);
    });

    it('escalates to two-column grid inside @media (min-width: 1280px)', () => {
      const desktop = mediaBlockBody(1280);
      expect(desktop).not.toBeNull();
      // Phase 7 regression fix (REG-2): 280px-floored columns demanded
      // 280+280+28-gap = 588px min-content, which blew the dashboard 124px
      // past the 768 viewport (sidebar+padding consumes 304, leaving 464).
      // Floored at 0 — chronometer + macros children self-cap via
      // `max-width: 280px` on their internal wrappers.
      expect(desktop!).toMatch(
        /\.kalori-dashboard-hero-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
      );
    });
  });

  describe('.kalori-meals-bulletin-grid', () => {
    it('declares mobile-default single-column grid (1fr)', () => {
      const body = ruleBody('.kalori-meals-bulletin-grid');
      expect(body, '.kalori-meals-bulletin-grid rule must exist').not.toBeNull();
      expect(body!).toMatch(/display:\s*grid/);
      expect(body!).toMatch(/grid-template-columns:\s*1fr\b/);
    });

    it('escalates to five-column grid inside @media (min-width: 1280px)', () => {
      const desktop = mediaBlockBody(1280);
      expect(desktop).not.toBeNull();
      expect(desktop!).toMatch(
        /\.kalori-meals-bulletin-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
      );
    });
  });
});
