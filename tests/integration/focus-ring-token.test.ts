/**
 * @vitest-environment node
 *
 * Task 5.1.6 — AC2 focus ring standardization.
 *
 * Asserts the canonical 2px ivory + 2px offset focus ring rule lives at
 * the top of `app/globals.css`'s global `:focus-visible` selector AND
 * that no Phase-5 surface (5.1.4 OfflineBar / 5.1.5 ReplayStatusBadge /
 * ReplayDrawer / GoalWeightConflictModal / PWAInstallPrompt) inlines a
 * conflicting focus token (oxblood / oxblood-soft) for `:focus-visible`.
 *
 * Pre-existing component-local `:focus-visible` overrides that ALSO use
 * `2px ivory + 2px offset` (per `app/globals.css` §4 line 287-292
 * canonical pattern) are exempt — they reinforce the rule.
 *
 * RED-state failure mode: at task start the global rule already lives
 * at globals.css L289-291 (verified during Step A briefing read), so
 * the structural test passes immediately. The semantic test ensures
 * 5.1.4 / 5.1.5 surfaces have no inline focus-visible override that
 * uses a non-ivory token. Most surfaces inherit the global rule;
 * the test guards against future regressions.
 *
 * (This test pairs with the AC4 contrast test which checks the
 * Phase-5 success-state badge text color — separate axis.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

function getGlobalsCss(): string {
  return readFileSync(join(REPO_ROOT, 'app', 'globals.css'), 'utf8');
}

describe('Task 5.1.6 AC2 — focus ring standardization', () => {
  it('global :focus-visible rule uses 2px ivory + 2px offset', () => {
    const css = getGlobalsCss();
    // Match a top-level `:focus-visible { outline: 2px solid var(--color-ivory); outline-offset: 2px; }`
    // rule (NOT scoped to a class). Use a permissive regex that allows
    // whitespace/newlines but enforces the three required declarations.
    const pattern =
      /(?:^|\n)\s*:focus-visible\s*\{[^}]*outline\s*:\s*2px\s+solid\s+var\(--color-ivory\)\s*;[^}]*outline-offset\s*:\s*2px\s*;[^}]*\}/;
    expect(
      css,
      'globals.css must declare a top-level :focus-visible { outline: 2px solid var(--color-ivory); outline-offset: 2px } rule',
    ).toMatch(pattern);
  });

  it('Phase 5 PWA / offline surfaces do not override focus-visible with a non-ivory token', () => {
    const filesToCheck = [
      'components/offline/OfflineBar.tsx',
      'components/pwa/ReplayStatusBadge.tsx',
      'components/pwa/ReplayDrawer.tsx',
      'components/pwa/GoalWeightConflictModal.tsx',
      'components/pwa/PWAInstallPrompt.tsx',
      'app/offline/retry-button.tsx',
    ];
    const offenders: string[] = [];
    for (const rel of filesToCheck) {
      const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
      // Look for `:focus-visible` followed by an outline token that is
      // anything OTHER than `var(--color-ivory)`. We allow the file to
      // contain `:focus-visible` strings (they're CSS-class names in
      // global utilities or Tailwind variants), but no inline
      // `outline: ... oxblood ...` override paired with `:focus-visible`.
      // Heuristic: scan for `outline: ... var(--color-oxblood` or
      // `outline: ... var(--color-oxblood-soft` literals — those are
      // the two failing tokens called out by ux-auditor §1.
      const oxbloodOutlineRe = /outline\s*:[^;]*var\(--color-oxblood(?:-soft)?\)/g;
      if (oxbloodOutlineRe.test(src)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Phase 5 surfaces must NOT override the global focus ring with oxblood / oxblood-soft (both fail WCAG 1.4.11):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  /**
   * Codex Round 2 — C2-5 broadened sweep.
   *
   * The Round 1 sweep scoped the scan to `app/` and `styles/`. That
   * missed `Design/tokens.css` (an orphan legacy token file) which
   * shipped `outline: 2px solid var(--line-focus)` (lime) on
   * `.btn:focus-visible`. The Round 2 contract: scan ALL `.css` files
   * from the repo root, EXCLUDING the well-known build / vendor / fixture
   * directories. No focus-visible override survives unless its outline
   * uses the canonical `var(--color-ivory)` token (or `none` / `0` /
   * `inherit`). Any other token is an AC2 violation.
   */
  it('no .css file anywhere in the repo overrides :focus-visible outline with a non-ivory token', () => {
    // Exclusions: build outputs, vendored dependencies, generated reports,
    // and screenshot fixtures (the latter contain CSS strings inside
    // generated HTML reports).
    const excludedDirs = new Set([
      'node_modules',
      '.next',
      'dist',
      'build',
      'coverage',
      'playwright-report',
      'test-results',
      '.turbo',
      '.git',
    ]);
    // Path-suffix exclusions for nested screenshot fixtures.
    const excludedPathSuffixes = ['tests/screenshots', 'tests\\screenshots'];

    const offenders: string[] = [];
    const cssFiles: string[] = [];

    function walk(dir: string): void {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (excludedDirs.has(entry)) continue;
        const full = join(dir, entry);
        // Skip nested screenshot directories.
        if (excludedPathSuffixes.some((s) => full.includes(s))) continue;
        let stat;
        try {
          stat = statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && full.endsWith('.css')) {
          cssFiles.push(full);
        }
      }
    }

    walk(REPO_ROOT);
    // Sanity: the orphan `Design/tokens.css` MUST be in the scan list —
    // it was the surface that motivated the Round 2 broadening.
    const designTokens = cssFiles.find((f) => f.replace(/\\/g, '/').endsWith('Design/tokens.css'));
    expect(
      designTokens,
      'Round 2 sweep MUST include Design/tokens.css (the file that motivated C2-5)',
    ).toBeTruthy();

    for (const file of cssFiles) {
      const src = readFileSync(file, 'utf8');
      const blockRe = /:focus-visible[^{]*?\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(src)) !== null) {
        const body = m[1] ?? '';
        const outlineRe = /outline(?:-color)?\s*:\s*([^;]+);/g;
        let om: RegExpExecArray | null;
        while ((om = outlineRe.exec(body)) !== null) {
          const decl = (om[1] ?? '').trim();
          if (decl === 'none' || decl === '0' || decl === 'inherit') continue;
          if (!/var\(--color-ivory\)/.test(decl)) {
            offenders.push(`${relative(REPO_ROOT, file)} :focus-visible -> ${decl}`);
          }
        }
      }
    }

    expect(
      offenders,
      `:focus-visible outlines outside the canonical 2px ivory token (AC2 violation):\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
