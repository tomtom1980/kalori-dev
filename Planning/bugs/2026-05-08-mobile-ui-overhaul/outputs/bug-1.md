# Bug 1 — Implementation Output

## Files Touched

- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\dashboard\page.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\MealsBulletin.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx

(Stayed strictly within the proposal's `Files Affected` list. No scope growth.)

## Tests Added/Modified

- `tests/unit/design-tokens/responsive-page-classes.test.ts` — string-assertion test for the three new responsive utility blocks in globals.css (`.kalori-page-main`, `.kalori-dashboard-hero-row`, `.kalori-meals-bulletin-grid`); 8 cases, mobile default + 768/1280 escalation per class.
- `tests/unit/components/dashboard/MealsBulletin.responsive.test.tsx` — render contract: 5 columns at every viewport, grid container carries `.kalori-meals-bulletin-grid`, no legacy inline `gridTemplateColumns: 'repeat(5, ...)'`; 3 cases.
- `tests/unit/app/dashboard-page-responsive.test.ts` — string-assertion contract on dashboard `page.tsx` (two `.kalori-dashboard-hero-row` usages, no legacy two-col inline grid) and `nav-shell.tsx` (`<main className="kalori-page-main">`, no legacy mobile-only padding inline); 4 cases.
- `tests/visual/responsive-overflow.spec.ts` — Playwright horizontal-overflow assertion at 375/768/1280 across `/dashboard`, `/library`, `/progress`, `/settings`. **Snapshot-free** — uses `documentElement.scrollWidth <= innerWidth + 1` rather than `toHaveScreenshot()`, so creates **zero new PNG baselines** (per bugfix-tomi guard: "do NOT auto-accept new baselines").

## Test Run Result

- **jsdom unit tests:** PASS — 15/15 new assertions across 3 new files.
- **Component render tests:** PASS — 9/9 (3 new + 6 existing on `MealsBulletin`).
- **Regression sweep** (`tests/unit/components`, `tests/unit/design-tokens`, `tests/unit/app`): **226/226 PASS** — zero regressions.
- **Playwright (parse-only):** spec compiles, lists 60 tests (5 projects × 4 routes × 3 viewports). **Not executed** — full Playwright suite is bugfix-tomi Phase 6 conditional E2E. No baselines generated.

## Deviations from Proposal

None. Implementation follows the proposal verbatim:

- 4 files modified (proposal said 4)
- Three new utility classes added in globals.css mirroring nav-shell-* pattern (lines 663-686)
- Canonical 768/1280 breakpoints (matches Tailwind v4 + nav-shell)
- `auto-fit` not used (proposal recommended named-class + media-query for predictability)
- Editorial gutter gap preserved
- 5 MealColumn children render unconditionally — no DOM swapping (preserves accessibility)

One small judgement call inside scope: in `nav-shell.tsx <main>` I kept the inline `paddingBottom` for the FAB/safe-area clearance and let `.kalori-page-main` own the rest of `padding`. The inline `paddingBottom` overrides the class's shorthand `padding-bottom` (inline > class CSS specificity) at all viewports — exactly the legacy behaviour. Documented inline in nav-shell.tsx.

## Status

implemented

## Open Concerns for Codex Round 1

1. **Visual-baseline drift (proposal-flagged, not introduced):** The proposal noted 65 modified PNGs from the previous session in `tests/screenshots/**`. This implementation does NOT touch those baselines or generate new ones — the new spec uses overflow assertion only. The existing visual baseline pipeline (`tests/visual/dashboard.spec.ts` family) will likely need regeneration as part of the Phase 6 E2E pass; that's separate and out of this bug's scope.

2. **`overflow: hidden` on `.kalori-meals-bulletin-grid`:** Preserved the legacy `overflow: hidden` from the inline style (was used "to remove trailing border on the last column for cleanliness"). At mobile widths with the column collapsed to 1fr, this also hides any over-spilling row content — likely fine, but worth a glance during Codex review for any edge case where MealColumn's children intend to overflow upward.

3. **Inline `paddingBottom` in `<main>`:** Kept for FAB/safe-area clearance. At ≥768px the bottom-tab-bar/FAB hide via the `nav-shell-*` rules, so this padding becomes essentially dead clearance on tablet/desktop (~120px of unused space at the bottom of the page). Pre-existing behaviour and out-of-scope for this bug, but flagged for visibility — could be wrapped in `@media (max-width: 767px)` in a follow-up.

4. **Tablet MealsBulletin layout:** Per proposal Open Question #1, the JSDoc previously hinted at "drink spans" merging columns at tablet. The proposal recommended the simpler uniform `repeat(2, 1fr)` and flagged for visual review post-implementation. Implemented uniform 2-col — the design-doc was silent, defaulted to simpler.
