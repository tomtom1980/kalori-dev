/**
 * @vitest-environment node
 *
 * Task 5.1.6 — AC1 reduced-motion audit.
 *
 * Codex Round 1 (I-1 + I-2) refactor:
 *   - Test imports `auditReducedMotionCoverage()` from
 *     `lib/motion/reduced-motion-audit.ts` (single source of truth — no
 *     duplicate keyframe list maintained alongside the helper).
 *   - File-level guard match is now AST-aware-enough: the helper strips
 *     line / block comments before checking for the
 *     `prefers-reduced-motion` / `motion-reduce:` literals, so a
 *     comment-only mention does NOT pass the audit.
 *
 * AC1 enforcement: every motion-affecting `transition:` literal in the
 * union of `components/`, `app/`, and `lib/` source must be paired
 * with a non-comment guard. Pure-color transitions are EXEMPT.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  auditReducedMotionCoverage,
  enumerateKeyframesFromCss,
  fileHasNonCommentReducedMotionGuard,
} from '@/lib/motion/reduced-motion-audit';

const REPO_ROOT = process.cwd();

describe('Task 5.1.6 AC1 — reduced-motion audit', () => {
  it('every JSX inline `transition:` that affects motion is paired with a non-comment reduced-motion guard', () => {
    const report = auditReducedMotionCoverage({ repoRoot: REPO_ROOT });
    expect(report.inlineMotionFindings.length).toBeGreaterThan(0);

    const ungated: string[] = [];
    for (const f of report.inlineMotionFindings) {
      if (f.isColorOnly) continue;
      if (!fileHasNonCommentReducedMotionGuard(f.file)) {
        ungated.push(`${relative(REPO_ROOT, f.file)}:${f.line} -> ${f.match}`);
      }
    }
    expect(
      ungated,
      `Files have motion-affecting inline transitions without a non-comment reduced-motion guard:\n  ${ungated.join('\n  ')}`,
    ).toEqual([]);
  });

  it('width-animated bars use transform: scaleX (not transition: width)', () => {
    const macroBarsSrc = readFileSync(
      join(REPO_ROOT, 'components', 'dashboard', 'MacroBars.tsx'),
      'utf8',
    );
    const microsSrc = readFileSync(
      join(REPO_ROOT, 'components', 'dashboard', 'MicrosOverflowToggle.tsx'),
      'utf8',
    );
    expect(
      macroBarsSrc,
      'MacroBars must NOT use `transition: width ...` - refactor to transform: scaleX',
    ).not.toMatch(/transition\s*:\s*['"`][^'"`]*\bwidth\b/);
    expect(
      microsSrc,
      'MicrosOverflowToggle must NOT use `transition: width ...` - refactor to transform: scaleX',
    ).not.toMatch(/transition\s*:\s*['"`][^'"`]*\bwidth\b/);
    expect(macroBarsSrc, 'MacroBars must drive bar fill via scaleX transform').toMatch(/scaleX\(/);
    expect(microsSrc, 'MicrosOverflowToggle must drive bar fill via scaleX transform').toMatch(
      /scaleX\(/,
    );
  });

  it('every keyframe defined in any .css file is suppressed under prefers-reduced-motion: reduce (Round 2 I2-1)', () => {
    // Codex Round 2 (I2-1): the audit no longer maintains a curated
    // keyframe list. The helper enumerates keyframes from EVERY .css
    // file under the repo (excluding build / vendor paths) and verifies
    // each one is suppressed under reduced-motion either via the
    // global `*` blanket or via an explicit `animation: none` rule that
    // names the keyframe / a consuming class.
    const report = auditReducedMotionCoverage({ repoRoot: REPO_ROOT });
    expect(
      report.keyframesMissingExplicitReducedMotion,
      `Keyframes lacking reduced-motion suppression: ${report.keyframesMissingExplicitReducedMotion.join(', ')}`,
    ).toEqual([]);
    // Sanity: the dynamic enumeration must surface a non-empty list.
    expect(report.allDefinedKeyframes.length).toBeGreaterThan(0);
    // Sanity: rowFadeIn (which the round-1 curated list missed) must
    // appear in the dynamic enumeration.
    expect(report.allDefinedKeyframes).toContain('rowFadeIn');
  });

  it('enumerateKeyframesFromCss returns the @keyframes identifiers verbatim', () => {
    const probe = `
      @keyframes alpha { from { opacity: 0; } to { opacity: 1; } }
      @keyframes  beta-2  { 0% { transform: scale(0); } }
      not-a-keyframe { color: red; }
    `;
    const found = enumerateKeyframesFromCss(probe);
    expect(found).toContain('alpha');
    expect(found).toContain('beta-2');
    expect(found).not.toContain('not-a-keyframe');
  });

  it('app/globals.css declares the html[data-reduce-motion=\"1\"] mirror block (Codex Round 1 C-1)', () => {
    const report = auditReducedMotionCoverage({ repoRoot: REPO_ROOT });
    expect(
      report.hasDataAttrMirrorBlock,
      'globals.css must declare a wildcard-selector block keyed on html[data-reduce-motion="1"] mirroring the OS @media reduced-motion contract',
    ).toBe(true);
  });

  it('no JS motion library is imported from a TSX file without a reduced-motion guard', () => {
    // Forward-looking: we ship Tailwind-only today, but if a future
    // file adds framer-motion / motion-one, the audit fails unless
    // that file ALSO declares a non-comment reduced-motion guard.
    const report = auditReducedMotionCoverage({ repoRoot: REPO_ROOT });
    const offenders: string[] = [];
    for (const { file, pattern } of report.motionLibraryImports) {
      if (!fileHasNonCommentReducedMotionGuard(file)) {
        offenders.push(`${relative(REPO_ROOT, file)} imports ${pattern} without a guard`);
      }
    }
    expect(
      offenders,
      `Motion-library imports without a non-comment reduced-motion guard:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
