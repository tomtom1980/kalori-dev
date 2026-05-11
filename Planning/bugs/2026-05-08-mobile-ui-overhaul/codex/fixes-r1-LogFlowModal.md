# Codex R1 Fix — C1 (LogFlowModal centering)

## Finding addressed
C1: Framer y-animation overwrites `translate(-50%, -50%)` centering

> **C1 — LogFlowModal.tsx:114-115** Framer `m.div` animating `y` overwrites
> `.kalori-log-content` `transform: translate(-50%, -50%)` centering — modal
> anchors at viewport corner instead of centered.

## Investigation

Confirmed the finding is real. The pre-fix structure was:

```jsx
<Dialog.Content asChild>
  <m.div
    className="kalori-log-modal kalori-log-content"
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    ...
  >
```

`Dialog.Content asChild` makes the m.div the dialog node. The m.div has the
`.kalori-log-content` class which provides:

```css
.kalori-log-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  ...
}
```

When framer-motion processes `animate={{ y: 0 }}` (or `initial={{ y: 16 }}`)
it writes `style="transform: translateY(...)"` directly on the m.div's inline
style. Inline styles win over class styles, and CSS `transform` is **not**
additive — Framer's `translateY(16px)` fully replaces the class-level
`translate(-50%, -50%)`. Net result on first frame: modal anchored at top-left
corner of the viewport, then animates `y → 0` while still missing the
horizontal `-50%` centering and vertical `-50%` half-of-self centering.

The pre-fix code comment claimed Framer "composes y after the centering
transform via its own transform string" — this is **incorrect**. Framer
composes its OWN internal transform parts (e.g. `x`, `y`, `scale`, `rotate`)
into a single `transform` string, but it does not read or merge external CSS
transforms. The bug-3 self-flagged Concern #3 in `outputs/bug-3.md` line 60
was the right hunch; this fix closes that loop.

Reproducer test (in `tests/unit/app/log/LogFlowModal-motion.test.tsx`)
confirmed the failure mode: jsdom recorded `style.transform === 'translateY(16px)'`
on the centering element, with no merged `translate(-50%, -50%)`.

## Fix Pattern Chosen

**Option A — Wrapper / animator split.** Split the dialog node from the
animator node:

- **Outer node** is the `Dialog.Content` itself (no `asChild`). It owns:
  - Radix-injected `role=dialog` / `aria-*` / `data-state` / refs / focus-trap
  - The `kalori-log-modal kalori-log-content` classes — i.e. centering,
    sizing, scroll, padding (purely CSS, no inline transform ever)
  - The `data-testid="log-flow-modal"` testid (preserves all upstream tests)
- **Inner m.div** owns:
  - `data-testid="log-flow-modal-animator"` (new, for the new test contract)
  - `className="kalori-log-modal-animator"` (no CSS rule needed yet — kept
    purely as a hook in case future styling wants to target it)
  - The `initial` / `animate` / `transition` props — Framer's inline
    transform writes here, where there is no centering rule to clobber

Rationale for choosing A over B/C:
- **B (CSS-var composition)** would have required re-authoring
  `.kalori-log-content { transform: translate(-50%, calc(-50% + var(--y))) }`
  AND four `@media` `@keyframes` variants, plus a custom-properties fallback
  branch. More CSS surface, more risk of regression in other consumers
  (the keyframe families `kalori-log-{enter,exit}-{mobile,desktop}` still
  reference the old `translate(-50%, -50%)` form).
- **C (animate scale/opacity only)** would have removed the slide-in feel
  that bug-3 explicitly preserves ("Spring slide+scale gives the surface
  real mobile-app feel" — `LogFlowModal.tsx:23`). Bug-3's contract is to
  keep `y` slide; we are constrained from removing it.
- **A** is the cleanest separation of concerns, requires zero CSS edits,
  zero design-token additions, and zero changes outside the file the bug
  was reported in. It is the canonical Framer-Motion pattern for
  "animated content inside a positioned wrapper."

## Files Touched

- `app/(app)/log/_components/LogFlowModal.tsx` — split `Dialog.Content asChild → m.div`
  into `Dialog.Content (centering + role + testid) > m.div (animator)`. Updated
  the inline comment block to document the split + the underlying CSS-transform
  composition rule that motivated it. Net diff: ~14 lines structural change,
  ~12 lines new comment, ~10 lines old comment removed.
- `tests/unit/app/log/LogFlowModal-motion.test.tsx` — appended two new test
  cases that capture the C1 contract:
  1. The element bearing `.kalori-log-content` MUST have empty
     `style.transform` (proves no inline transform leaks onto the centering
     node).
  2. The animator (testid `log-flow-modal-animator`) MUST be a strict
     descendant of the centering element AND MUST NOT carry the
     `kalori-log-content` class (proves the structural split).
- `app/globals.css` — **NOT touched.** No CSS edit was required by Option A.

## Test Run Result

- **New failing-then-green test:** `Codex C1 — centering element has no inline
  transform (Framer y does not overwrite translate(-50%, -50%))`. Pre-fix:
  `expected 'translateY(16px)' to be ''` (failure proves the bug). Post-fix:
  green. A second structural test (`Codex C1 — animated m.div is a descendant
  of (not the same node as) the centering element`) covers the layout
  contract.
- **LogFlowModal sweep + reduced-motion audit:** 14 files / **88 / 88 passed**
  (`tests/components/log-flow/` + `tests/unit/app/log/` +
  `tests/integration/reduced-motion-audit.test.ts`).
- **Wider unit + components + integration sweep:** 165 files / 1200 passed,
  1 unrelated pre-existing failure in `tests/components/primitives/MobileWheelPicker.test.tsx`
  (Codex R1 I1, separate finding under a separate auto-fix sub-agent — NOT
  caused by this fix, confirmed via `git diff --name-only` showing
  MobileWheelPicker is not in my touched-files set).
- **TypeScript:** `pnpm typecheck` clean (no errors).
- **Reduced-motion guard:** Bug-3's reduced-motion gate still applies — the
  `useReducedMotion` hook's `reducedMotion` flag still drops `initial.y` to
  zero and forces `transition.duration = 0`. Audit test #4 ("renders without
  throwing under reduced motion") continues to pass.

## False-positive Check

Not a false positive. Codex's finding was confirmed by:
- jsdom inline-style assertion (`style.transform === 'translateY(16px)'`)
- The pre-fix CSS-Working-Group rule (CSS `transform` is **not** an additive
  property — `transform: translateY(16px)` fully replaces `translate(-50%,
  -50%)` per CSS Transforms Level 1 §3)
- Bug-3's own self-flagged concern #3 in `outputs/bug-3.md` line 60 — the
  implementation author already suspected this exact failure mode but was
  unable to verify under jsdom (visual regression deferred). Codex caught
  what jsdom-only tests had missed.

## Open Concerns for Round 2

1. **Visual baselines may need re-capture.** The DOM structure now has an
   extra wrapper element. Most Playwright screenshot specs target by testid
   or computed bounding box, neither of which should drift, but
   `tests/screenshots/user-stories/US-3.*` baselines that capture the open
   modal surface should be re-verified during the orchestrator's Phase 6/7
   visual regression pass. Round 2 Codex should NOT flag the absence of new
   screenshots; per `outputs/bug-3.md` line 56, this is deferred.

2. **`.kalori-log-modal-animator` class has no CSS rule yet.** I left it as a
   forward-looking hook (consistent with the `.kalori-log-modal-*` family
   naming), but Round 2 Codex may flag it as "dead class." If preferred, it
   can be removed without functional impact — the m.div needs no styling, only
   inline `style` from Framer.

3. **Dialog.Content sizing assumptions — addressed in-fix.** The CSS rules
   on `.kalori-log-content` include `display: flex; flex-direction: column;
   gap: var(--spacing-4); overflow-y: auto`. With the wrapper split, the
   m.div is the OUTER's single flex child, which would have collapsed the
   `gap` between `<header>` and `<LogFlowTabs />` (gap requires ≥2 siblings).
   I mirrored `display: flex; flex-direction: column; gap: var(--spacing-4)`
   onto the m.div via inline `style` (plus `width: 100%; flex: 1 1 auto;
   minHeight: 0` so it fills the outer wrapper's content area and respects
   the outer's `overflow-y: auto`). The original sibling-gap is preserved.
   Re-ran the LogFlowModal sweep + reduced-motion audit after this addition:
   88/88 still passed. Round 2 Codex should sanity-check that the inline
   `style` block on the m.div is acceptable (it does not introduce a new
   CSS class or design token — purely an inline mirror of the outer's flex
   rules — staying within the "no new design tokens, no new CSS rules"
   spirit of the fix). If preferred, those rules could be moved into a new
   `.kalori-log-modal-animator { display: flex; ... }` block in
   `globals.css` — but that would touch a second file unnecessarily.
