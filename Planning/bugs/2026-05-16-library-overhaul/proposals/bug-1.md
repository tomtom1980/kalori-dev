# Bug 1: Library item detail view appears dim/washed because scrim + sheet share the same near-black background

## Classification
known_fix

## Root Cause
The detail view is rendered as a route page (`/library/[id]/page.tsx`) — NOT as an overlay on top of `/library`. But `FoodDetail.tsx` still renders the legacy modal pattern: a fixed `kalori-fd-scrim` (`rgb(14 10 8 / 0.6)`, z=60) on top of the body, plus a right-anchored `kalori-fd-sheet` (z=61, `background-color: var(--color-bg-0)` = `#0E0A08`). Because the route swap removes the library grid, the scrim is darkening the bare body which is ALREADY `bg-0` (#0E0A08). The user sees: (a) a black void on the left half of the viewport (scrim over nothing), and (b) a 640px panel whose background is the SAME `bg-0` as the void, so the sheet "blends" into the scrim and reads as faded/low-contrast. ui-design.md §7.3.6 line 1614 prescribes the scrim on the assumption that the library grid lives BEHIND it ("grid dimmed via `bg-0/60%` scrim") — that prescription is incompatible with the current route-based implementation.

## Proposed Change (Diff Outline)
- `app/(app)/library/_components/FoodDetail/FoodDetail.tsx`
  - Remove the `<div className="kalori-fd-scrim" />` element — no host page to dim on a dedicated route; scrim is pure noise on `/library/[id]`.
  - Remove the `aside`'s `role="dialog" aria-modal="true"` — this is a navigated page, not a dialog. Keep `aria-labelledby` and the focus management as a `<section>` landmark instead (preserves the existing focus-trap + ESC handler purpose as page-scoped focus management, but ESC handler should be replaced by `onBack` since there is no parent surface to return to). Confirm with user (Open Question 2).
- `app/globals.css`
  - Lift `.kalori-fd-sheet` surface contrast: change `background-color: var(--color-bg-0)` to `var(--color-bg-1)` (#15100D) — gives the sheet a perceptibly lighter tier vs the page void and matches §7.3.6's intent that the sheet reads as a content surface, not a continuation of the void.
  - Change `.kalori-fd-sheet-wrap` from `position: fixed; display: flex; justify-content: flex-end` to a centered/full-width content container (the route IS the page — it should fill the route's main area, not float over it). Recommend `max-width: 640px; margin-inline: auto;` on desktop, `width: 100%` on mobile, removing `position: fixed`. This eliminates the "letterbox void" on the left half.
  - Remove or repurpose the `kalori-fd-sheet-in-right` / `kalori-fd-sheet-in-up` slide-in keyframes — slide animations belong to modal overlays, not navigated pages. Replace with `page-settle` (320ms opacity 0→1, already a project token at line 216 / 2736) for the route-arrival feel.
  - Remove `.kalori-fd-scrim` declarations OR gate them under a future "modal route group" use case; for now they're dead.
- Leave `FoodDetailThumbnail.tsx`, `FoodDetailName.tsx`, `FoodDetailMacros.tsx`, `FoodDetailHistory.tsx`, `FoodDetailActions.tsx` untouched — internal typography is already on the ivory/sand/dust token stack at the correct contrast tiers.

## Files Affected
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetail.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css

## TDD Required
yes — this is a visual/contrast fix but the change touches a11y semantics (dialog role removal) and the existing test suite asserts dialog role + scrim presence + slide-in animation. Tests must be updated RED-first to characterise the new contract before the CSS/JSX change lands.

## Test Approach
1. `tests/components/library/FoodDetail.a11y.test.tsx` — update RED-first: assert `getByRole('region')` or section landmark (NOT `role="dialog"`), assert NO scrim element (`queryByTestId('food-detail-scrim')` returns null OR scrim element is absent), assert `aria-labelledby` still wires `food-detail-name`.
2. New unit/contract test `tests/components/library/FoodDetail.surface-contrast.test.tsx` — render the sheet and assert its computed `background-color` resolves to `var(--color-bg-1)` (#15100D) rather than `var(--color-bg-0)`. Reference lesson line 11 (axe "wall-behind-wall" anti-pattern — text-token grep) to ensure no text inside the sheet relies on the OLD bg-0 to clear AA after the surface lifts to bg-1.
3. Existing E2E `tests/e2e/library/library-visual.spec.ts` + `tests/visual/library.spec.ts` — refresh baselines for `/library/[id]` after the fix; expect the screenshot to show a single full-width content surface, no half-viewport black scrim.
4. Existing E2E `tests/e2e/library/library-keyboard-nav.spec.ts` — verify ESC behaviour now navigates back to `/library` (router.push) rather than "closes the modal" (currently same effect, but the semantic changes — confirm test wording).
5. Re-run `tests/integration/reduce-motion-effective.test.tsx` — the slide-in keyframes removal must be reflected; reduced-motion suppression block in `app/globals.css` line 614–619 + 650–653 also references `.kalori-fd-sheet` animations and should be re-validated.

## Risk Assessment
medium — touches a heavily-tested compound (6 component tests, 9 E2E specs, axe a11y test, visual regression). Removing `role="dialog"` semantically reclassifies the surface and could break test selectors that depend on the dialog role (lesson line 10 — "false-green tests that assert presence without behavior"). The contrast lift from bg-0 to bg-1 also risks WCAG regressions on any nested element whose contrast was tuned against bg-0 specifically (lesson line 7 — `oxblood-soft` accent-only rule). Grep `--color-oxblood-soft` and `--color-dust-2` usages inside `kalori-fd-*` selectors and verify text-vs-bg-1 contrast before commit.

## Regression Sweep Needed
- All `tests/components/library/FoodDetail*` (6 component tests)
- All `tests/e2e/library/library-*` (9 E2E specs — visual baselines need refresh)
- `tests/integration/reduce-motion-effective.test.tsx` (kalori-fd-sheet animation references)
- `tests/unit/library/food-detail-error-contrast.test.ts` (asserts text contrast — re-verify against bg-1)
- `lib/motion/reduced-motion-audit.ts` (audits `kalori-fd-sheet` motion contract)
- `app/(app)/log/_components/LibraryTab.tsx` (also references `kalori-fd-` classes — confirm whether LibraryTab is a modal context where the scrim IS still valid; if so, gate the scrim removal to `/library/[id]` only)

## UI Touching
true

## Component Affected
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetail.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css (`.kalori-fd-sheet`, `.kalori-fd-sheet-wrap`, `.kalori-fd-scrim`)

## Library/Token Citation
- ui-design.md §7.3.6 line 1614 ("Desktop 1280+: right-side overlay sheet 640px wide; **grid dimmed via `bg-0/60%` scrim**") — this prescription is the SOURCE of the drift: it described a modal overlay over the grid, but the implementation routes to a dedicated page where the grid doesn't exist. The proposal honors §7.3.6's surface intent (a content surface with hairline framing) but adapts to the route-page reality.
- ui-design.md §9 / line 216 "page-settle" 320ms opacity 0→1 — replacement for the slide-in animation (route arrival feel).
- ui-design.md tokens (architecture.md §1): `--color-bg-0` page void / `--color-bg-1` cards-editor-sidebar — the bg-1 lift is the canonical content-surface tier per the design system.
- Lesson line 7 (oxblood-soft accent-only on dark surfaces) — must re-grep inside `kalori-fd-*` after the bg lift.
- Lesson line 11 (axe wall-behind-wall pattern) — token shift requires sibling-cluster grep before declaring victory.

## Open Questions
1. Confirm scope: the `kalori-fd-` class family is also referenced by `app/(app)/log/_components/LibraryTab.tsx` (per Grep result). Is the LibraryTab a modal-overlay context where the scrim IS legitimate? If yes, the scrim removal should be scoped to `/library/[id]` only (e.g. a `data-context="route"` attribute on the wrap, or a separate CSS class). Suggest splitting `.kalori-fd-sheet` into two surface variants if both contexts coexist.
2. Confirm a11y intent: should `/library/[id]` be a navigated page (Section landmark, ESC = router.back()) or remain a "modal opened by deep-linking" (Dialog landmark, ESC = close + return)? The current implementation is ambiguous — `role="dialog"` says modal, but the page-level routing says navigated. The proposal picks Section landmark; please confirm.
3. Should the slide-in animation be preserved at all (e.g. for the LibraryTab modal-overlay context) or fully retired? Removing it from BOTH contexts is simpler; keeping it for LibraryTab requires the surface-variant split in Q1.
