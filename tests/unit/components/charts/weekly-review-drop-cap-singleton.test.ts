/**
 * Enforces the briefing §5 T6 invariant: the 82px ember drop-cap
 * appears EXACTLY ONCE in the application (in `WeeklyReviewCore.tsx`,
 * variant=full). This guards against a future component silently
 * introducing a second 82px drop cap and stealing the visual
 * signature.
 *
 * Codex Round 1 M-1 (2026-04-24): ensure the invariant check is
 * precise. `fontSize: 82,` is the load-bearing TSX literal — it should
 * only appear once in the non-test, non-mockup codebase. The earlier
 * "drop-cap" grep matched comments + CSS class names in globals.css,
 * which are legitimate (the reduced-motion override + the keyframe
 * animation hook). Those are NOT the render site and don't violate the
 * singleton rule. This test narrows the check to the exact render-site
 * literal so the singleton invariant is unambiguously enforced.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function countMatches(pattern: RegExp, filePath: string): number {
  try {
    const src = readFileSync(resolve(ROOT, filePath), 'utf-8');
    const matches = src.match(pattern);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(resolve(ROOT, dir));
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const rel = join(dir, entry);
    const abs = resolve(ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(rel, acc);
    } else if (/\.(tsx?|jsx?)$/u.test(entry)) {
      acc.push(rel);
    }
  }
  return acc;
}

describe('drop-cap singleton invariant (briefing §5 T6, Codex R1 M-1)', () => {
  it('fontSize: 82 literal appears exactly once in WeeklyReviewCore.tsx', () => {
    // Exact JSX literal — `fontSize: 82,` (no space variation; the code
    // style is enforced by Prettier).
    const count = countMatches(/fontSize:\s*82\b/g, 'components/charts/WeeklyReviewCore.tsx');
    expect(count).toBe(1);
  });

  it('fontSize: 82 literal does NOT appear in any other src component', () => {
    // Scan components/ + app/ for any fontSize: 82 match. Exclude the
    // canonical render site (WeeklyReviewCore.tsx) and test files.
    const dirs = ['components', 'app'];
    const offenders: string[] = [];
    for (const dir of dirs) {
      const files = walk(dir);
      for (const f of files) {
        const normalized = f.replace(/\\/g, '/');
        if (normalized.endsWith('components/charts/WeeklyReviewCore.tsx')) continue;
        const count = countMatches(/fontSize:\s*82\b/g, f);
        if (count > 0) offenders.push(`${normalized} (${count})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('drop-cap CSS class (.weekly-review-drop-cap) is defined once in globals.css', () => {
    // The CSS class is allowed to appear more than once in the stylesheet
    // (selector + reduced-motion override). This test asserts the class
    // DEFINITION selector appears once — a weaker but still useful guard.
    const count = countMatches(/^\.weekly-review-drop-cap\s*\{/gm, 'app/globals.css');
    expect(count).toBe(1);
  });
});
