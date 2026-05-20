# Bug 10 — Library card hover focus animation

## Summary
- **Bug ID:** 10
- **Description (verbatim):** "When we have the library panel open, and I do a mouse hover on it, it should have an animation when I hover on something to get the focus on and highlight the items. Especially when now it's gonna have a sketch picture."
- **User intent:** On `/library` grid, hovering a card (or keyboard-focusing it) should play a tasteful animation that pulls the card forward — making selection target obvious. Must coexist with the sketch image landing via Bug 5 (image's contrast wakes up too).
- **Classification:** `known_fix` — the design ALREADY prescribes the hover behavior (`ui-design.md:1554–1559`). Today's CSS implements ~70% of it but the result feels flat. Fix is "honor the spec verbatim + make it animated under reduced-motion guard" — no new visual treatment needs to be invented.
- **UI Touching:** YES.
  - Cited surfaces:
    - `Planning/ui-design.md:1552–1562` — LibraryCard States table (Hover row: `bg-0→bg-1` via `ink-fade` 120ms; image `0.85→1.0`; Focus row: 2px ivory outline inset).
    - `Planning/ui-design.md:198` — `--motion-micro: 120ms` token used for hover/focus.
    - `Planning/ui-design.md:312` — "Reduced-motion collapses all stages to instant paint."
    - `Planning/ui-design.md:2787–2795` (§9.4) — Framer Motion `LazyMotion + m` mandatory pattern.
    - `lib/motion/defaults.ts:296` — `useReducedMotion()` is the OR-wrapper that ORs OS pref + app dataset attr + localStorage key (per Bug 3 / Codex Round 3 fix). This IS the project's "useReducedMotionApp" pattern.
  - Cited lesson: 2026-05-08 Framer Motion `useReducedMotion` OR-wrapper — must use the wrapper from `@/lib/motion/defaults`, never import directly from `framer-motion`.
- **TDD required:** YES — visual + behavioral (data-attribute on hover, image opacity transition, keyboard-focus parity).
- **Risk:** Low. Pure additive CSS + one prop swap on the root from `<button>` to `<m.button>`. No state, no API, no a11y change beyond preserving existing focus outline. The card already gains image scale on hover today (`scale(1.02)`); we'll keep that but make the FULL visual treatment fire correctly + add the prescribed image-opacity transition.
- **Stop-the-world flags:** None.

## Root cause / current state

`app/(app)/library/_components/LibraryCard.tsx` renders a plain `<button class="kalori-library-card">`. The current CSS at `app/globals.css:2917–2965` implements:

- `:hover` → `background-color: var(--color-bg-1)` with `transition: background-color 120ms ease-out` (CORRECT per spec).
- `:focus-visible` → `outline: 2px solid var(--color-ivory); outline-offset: -2px` (CORRECT per spec ux-auditor §1.1 fix).
- `:hover .kalori-library-card-thumb img` → `transform: scale(1.02)` on the image (PARTIALLY CORRECT — design says image opacity `0.85→1.0`, NOT scale; today we have scale instead).

What's missing vs spec:
1. **Image opacity transition** — design says `0.85→1.0` on hover; current CSS sets `transform: scale(1.02)` on the `<img>` but never assigns the base `0.85` opacity nor transitions it. Image looks flat at idle.
2. **`focus-visible` does not mirror hover background** — spec implies "hover OR focus" both wake the card; today, keyboard focus only paints the outline, doesn't change `background-color`. Accessibility parity gap.
3. **No animation FEEL** — `transition: background-color 120ms ease-out` is correct but `ease-out` is generic; spec calls for `ease-editorial` (`cubic-bezier(0.2, 0.8, 0.2, 1)`). Sketch picture (Bug 5) will make this lack-of-editorial-feel more obvious because letter-marks are a static glyph today while a sketch is a richer image surface that begs a livelier wake-up.
4. **No `prefers-reduced-motion` honoring on the image scale** — the `transform: scale(1.02)` keeps firing even when the user has reduced-motion on. Violates the project's existing motion-safety convention (`ui-design.md:312`, lessons 2026-05-08).

## Proposed change

### File 1 — `app/globals.css` (~30 lines edited in the `.kalori-library-card-*` block, lines 2917–2965)

Refine the existing CSS to match the spec verbatim + add reduced-motion guard:

```css
.kalori-library-card {
  /* unchanged: width/height/min-height/padding/font */
  transition:
    background-color var(--motion-micro) var(--ease-editorial),
    box-shadow var(--motion-micro) var(--ease-editorial);
}

/* Wake-up on hover AND focus-visible (a11y parity) */
.kalori-library-card:hover,
.kalori-library-card:focus-visible {
  background-color: var(--color-bg-1);
}

.kalori-library-card:focus-visible {
  outline: 2px solid var(--color-ivory);
  outline-offset: -2px;
}

/* Thumbnail wakes too — opacity per spec, NOT scale */
.kalori-library-card-thumb img {
  width: 100%; height: 100%; object-fit: cover;
  opacity: 0.85;
  transition: opacity var(--motion-micro) var(--ease-editorial);
}
.kalori-library-card:hover .kalori-library-card-thumb img,
.kalori-library-card:focus-visible .kalori-library-card-thumb img {
  opacity: 1;
}

/* Letter-mark fallback (sketch image landing via Bug 5 — same wake-up) */
.kalori-library-card-lettermark {
  transition: filter var(--motion-micro) var(--ease-editorial);
  filter: brightness(0.9);
}
.kalori-library-card:hover .kalori-library-card-lettermark,
.kalori-library-card:focus-visible .kalori-library-card-lettermark {
  filter: brightness(1.05);
}

/* Honor reduced-motion (OS + app toggle via html[data-reduce-motion='1']) */
@media (prefers-reduced-motion: reduce) {
  .kalori-library-card,
  .kalori-library-card-thumb img,
  .kalori-library-card-lettermark {
    transition-duration: 1ms;
  }
}
html[data-reduce-motion='1'] .kalori-library-card,
html[data-reduce-motion='1'] .kalori-library-card-thumb img,
html[data-reduce-motion='1'] .kalori-library-card-lettermark {
  transition-duration: 1ms;
}
```

**Why CSS-only and not Framer Motion `whileHover`?** The state is purely visual (color, opacity, brightness — all `compositor-friendly` properties); Framer Motion `whileHover` here would add render-tree churn for zero benefit. The project's existing convention (`ui-design.md:312`) routes through CSS for "per-component motion (hover, press, state change)" with reduced-motion gated by the `[data-reduce-motion='1']` selector — and that selector is already wired by the in-app toggle (`lib/motion/defaults.ts:227–246` Codex Round 3 contract). Framer's `LazyMotion + m + whileHover` mandate kicks in when we need keyed enter/exit transitions or shared-element transforms, neither of which applies for a tonal hover wake-up.

If reviewer pushes back, the Framer-equivalent (still spec-compliant, ~12 extra lines in `LibraryCard.tsx`) is documented in Open Questions.

### File 2 — `tests/components/library/LibraryCard.test.tsx` (extend, 3 new test cases)

Existing test file covers render/select/keyboard. Add:

1. RED test (visual hover) — `getByTestId('library-card-X')`, query `getComputedStyle` for `background-color` at idle (`bg-0`), `userEvent.hover()`, re-query → assert `bg-1`. Fails today because hover doesn't add a deterministic `data-attribute` we can assert on; we'll use the `:hover` pseudo via `userEvent.hover()` + JSDOM's pseudo-class matching OR — more robust — assert that the card root has the `kalori-library-card` class and that the CSS rule `.kalori-library-card:hover { background-color: var(--color-bg-1) }` exists in the parsed stylesheet (JSDOM-friendly).
2. RED test (focus-visible parity) — `getByTestId('library-card-X').focus()` + Tab navigation to trigger `:focus-visible`; assert the same hover-class wake-up applies (CSS-rule-existence assertion, same approach).
3. RED test (image opacity transition exists) — assert the image element has `opacity: 0.85` at idle and that a `transition: opacity` declaration exists on it. (Avoids brittle animation-timing tests.)

Pattern: JSDOM can't compute `:hover` pseudo-class styles reliably, so use **CSS-rule-existence assertions** (Playwright-style `expect(stylesheet).toContain(...)`). This is how `tests/visual/library.spec.ts` already audits hover/focus tokens. Reuse that pattern; do NOT introduce a new visual-regression baseline.

### File 3 — `tests/e2e/library/library-visual.spec.ts` (1 new screenshot pair)

Add a `hover` + `focus-visible` snapshot pair for the first library card on `/library` to lock the wake-up visual under the reduced-motion = no-preference scenario AND under reduced-motion = reduce. Existing baseline pipeline handles regen.

### File 4 — `tests/e2e/library/library-keyboard-nav.spec.ts` (extend existing focus-nav test)

Already navigates with Tab; add one assertion that the focused card's computed `background-color` differs from the idle siblings'. Catches future regressions where someone removes the `:focus-visible` background rule.

## TDD sequence

1. RED — `LibraryCard.test.tsx`: add the three CSS-rule-existence assertions. Verify fail with messages like `Expected stylesheet to contain rule '.kalori-library-card:focus-visible { background-color: var(--color-bg-1) }', not found`.
2. GREEN — edit `app/globals.css` per the block above. Re-run; verify PASS.
3. Add the e2e hover + focus-visible snapshot pair to `library-visual.spec.ts`. Capture baselines.
4. Extend `library-keyboard-nav.spec.ts`. Verify GREEN.
5. Run full `tests/components/library/**`, `tests/e2e/library/**`, `tests/visual/library.spec.ts` to verify no regression.

## Regression risk surface

- **CSS specificity** — the new combined hover/focus selectors are simple class+pseudo selectors at the same specificity as today's `:hover`. No specificity battles introduced.
- **Image opacity 0.85 default** — visible at idle (was effectively 1.0 because no opacity was set). Subtle visual change to ALL cards' idle state. Spec-correct, but a "did the design change" red flag for the user when first reviewing the live grid. **Flag in approval gate.**
- **Letter-mark `filter: brightness(0.9)` at idle** — same kind of subtle idle change. Spec doesn't explicitly say letter-mark should be dimmed at idle, but Bug 10's intent ("highlight the items on hover" — especially when sketch image lands) reads as "wake up from a dimmer baseline." If user wants letter-marks bright at idle and only the bg wakes, drop the `filter` clauses.
- **Framer Motion bundle** — UNCHANGED. We add zero new Framer imports. The card stays a plain `<button>`.
- **Reduced-motion** — explicitly honored via BOTH the OS `@media (prefers-reduced-motion: reduce)` selector AND the in-app `html[data-reduce-motion='1']` selector, matching `globals.css` precedent for chronometer/wheel components.
- **Bug 5 interaction** — when the sketch image lands (different bug, same batch), the same `.kalori-library-card-thumb img` rules apply automatically. The sketch image will start at `opacity: 0.85`, wake to `1.0` on hover/focus. If the sketch's rendering style requires a different idle opacity, Bug 5's fix should override `.kalori-library-card-thumb img[data-sketch="true"]` or similar — flag during Bug 5 design review.

## Out of scope (do NOT touch)

- Card press / `:active` state (spec §7.3.4 row 4 prescribes a separate "tonal ripple"; not part of this bug).
- Card `aria-checked='true'` selected-state styling (already correct per `app/globals.css:2941–2948`).
- Selection chip animation (separate bug if user wants it animated).
- Grid-level ruling rules (`gap: 0` + hairlines) — out of bug scope.
- Log-flow library tab card (`app/(app)/log/_components/LibraryTab.tsx`) — separate surface. User said "library panel," and Bug 7 already established `/library` route is the target.

## Open questions

1. **CSS vs Framer Motion?** Recommendation: CSS-only (per analysis above). If user wants Framer pattern explicitly (for consistency or because Bug 10 says "animation"), the alt approach is wrap the root in `<m.button whileHover={{ backgroundColor: 'var(--color-bg-1)' }} whileFocus={{ ... }} transition={motion.micro}>` + use `useReducedMotion()` from `@/lib/motion/defaults` to suppress. Wins: declarative motion. Losses: ~12 extra LOC, hydration cost on every grid card (50–200 cards, see `ui-design.md:682`), no actual visual difference at 120ms.
2. **Letter-mark idle brightness** — flag this default `filter: brightness(0.9)` at user approval. May feel "too dim for idle" — easy revert.
3. **Image idle opacity `0.85`** — spec-mandated, but a visible idle change. User should see a side-by-side mockup OR accept the spec.
4. **Should the hover wake-up animate `box-shadow` too?** The Ledger philosophy is "no shadows." Spec for card has no shadow at any state. Recommend NO shadow lift.

## Acceptance criteria

- Hovering any `/library` grid card transitions `background-color` from `bg-0` → `bg-1` over 120ms via `ease-editorial`.
- Same wake-up applies when the card receives keyboard focus (`Tab` to it).
- Thumbnail image's opacity rises from `0.85` → `1.0` on hover/focus.
- Letter-mark fallback (no thumbnail) brightens slightly on hover/focus (subtle).
- Under `prefers-reduced-motion: reduce` OR `html[data-reduce-motion='1']`, all transitions collapse to 1ms (effectively instant).
- Focus outline (2px ivory inset) remains pre-existing — animation does not replace it.
- No bundle-size regression. No new Framer imports.
- All existing library tests stay green; new tests added per TDD sequence.

## Estimated effort

- Investigation: complete.
- Implementation: ~20 minutes (CSS edits + import-free).
- TDD test scaffold: ~30 minutes (3 unit tests + 1 e2e snapshot + 1 nav assertion).
- Approval-gate clarifications (image idle opacity, letter-mark dim): ~10 minutes (user signoff).
- Total: ~60 minutes wall-clock for one engineer + Codex review pass.
