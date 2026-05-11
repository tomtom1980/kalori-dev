/**
 * Task 5.3 Codex Round 1 I2 — Reduced-motion settings-toggle gap.
 *
 * 4 OS-only `@media (prefers-reduced-motion: reduce)` blocks at globals.css
 * lines ~1497, ~1760, ~1851, ~3635 contain TIGHTER selectors than the
 * blanket `*` mirror at L571-588 (the Settings-toggle path):
 *   - `.kalori-confirmation-switch-knob` (transition: none)
 *   - `.kalori-why-caret` (transition-duration: 1ms)
 *   - `.kalori-undo-toast` + `.kalori-undo-bullet` (animation-duration: 1ms)
 *   - `.kalori-weight-ember-pulse` + `.kalori-softFadeIn` + 7×:active rules
 *
 * Users who enable Settings → Reduce Motion (instead of relying on OS pref)
 * get a WEAKER motion-suppression contract than OS-pref users — these
 * narrow rules never fire under `html[data-reduce-motion='1']`.
 *
 * The fix mirrors each `@media` block as a sibling
 * `html[data-reduce-motion='1']` rule containing the SAME selector list and
 * SAME declarations.
 *
 * Approach: parse globals.css as text, identify each
 * `@media (prefers-reduced-motion: reduce)` block at the file positions
 * above, and assert that an `html[data-reduce-motion='1']` selector with
 * the same class names appears within ±200 lines (i.e. as a paired sibling
 * mirror block).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const CSS_PATH = resolve(process.cwd(), 'app/globals.css');

interface Pairing {
  /** Selector that lives inside the @media block — must also appear under `html[data-reduce-motion='1']` */
  selector: string;
  /** The CSS class the test treats as the canary (substring search). */
  canary: string;
}

// One canary per @media block we need mirrored. Selecting one class per block
// is enough — if the mirror block exists, every selector listed in its source
// block was carried over per the surgical fix's literal copy contract.
const PAIRINGS: readonly Pairing[] = [
  { selector: '.kalori-confirmation-switch-knob', canary: 'kalori-confirmation-switch-knob' },
  { selector: '.kalori-why-caret', canary: 'kalori-why-caret' },
  { selector: '.kalori-undo-toast', canary: 'kalori-undo-toast' },
  { selector: '.kalori-weight-ember-pulse', canary: 'kalori-weight-ember-pulse' },
];

describe('Codex R1 I2 — reduced-motion settings-toggle gap mirrors', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  for (const pairing of PAIRINGS) {
    it(`mirrors ${pairing.canary} under html[data-reduce-motion='1']`, () => {
      // The canary must appear at least once paired with the
      // `html[data-reduce-motion='1']` selector — either as a combined
      // selector list (`html[data-reduce-motion='1'] .canary { ... }`) or
      // as a sibling block. Substring-only is sufficient because the
      // fix's contract is literal-copy of the @media block's selector
      // list under the attribute selector.
      //
      // We require both the canary class AND the data-reduce-motion
      // attribute selector to co-occur within a 4000-char window so a
      // distant unrelated reference does not satisfy the assertion.
      const reduceMotionSelector = "html[data-reduce-motion='1']";
      let satisfied = false;
      let searchStart = 0;
      while (searchStart < css.length) {
        const idx = css.indexOf(reduceMotionSelector, searchStart);
        if (idx === -1) break;
        const window = css.slice(idx, idx + 4000);
        if (window.includes(pairing.canary)) {
          satisfied = true;
          break;
        }
        searchStart = idx + reduceMotionSelector.length;
      }
      expect(
        satisfied,
        `Expected an \`html[data-reduce-motion='1']\` rule that targets \`${pairing.canary}\` to mirror the @media (prefers-reduced-motion) block, but found none within app/globals.css.`,
      ).toBe(true);
    });
  }
});
