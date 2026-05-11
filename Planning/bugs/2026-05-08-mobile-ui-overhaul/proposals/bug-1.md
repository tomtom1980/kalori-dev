# Bug 1: App-wide mobile-responsive layout drift

## Classification
known_fix

## Root Cause
Dashboard hero rows (and `MealsBulletin`) were authored desktop-first with hard-coded multi-column CSS grids and no mobile reflow, in defiance of the canonical spec that mandates mobile-first design at the 375 / 768 / 1280 breakpoints with 16px page padding. Specifically:

1. `app/(app)/dashboard/page.tsx` lines 150-156 and 168-175 set `gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)'` for the chronometer+macros and water+micros hero rows. At a 375px viewport with `--page-padding-mobile: 16px` (343px content width) plus `--spacing-gutter-editorial: 28px`, two 280px-min columns demand 588px — ~245px of guaranteed horizontal overflow, which clips content and forces page scrolling.
2. `components/dashboard/MealsBulletin.tsx` lines 120-128 ship a permanent `gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'` with the JSDoc itself admitting "Mobile: single-column accordion stack... cosmetic polish in a later visual pass" (lines 6-17). 5 columns at 343px content = 68.6px per meal column for the entire MealColumn (label + entries + totals) — illegible.
3. The infrastructure for the fix already exists and is correct: globals.css §nav-shell rules (lines 663-686) use the canonical breakpoints, `--page-padding-mobile/tablet/desktop` tokens are defined (16/32/48px), and the bottom-tab-bar / FAB / sidebar render unconditionally with CSS-only viewport gating (zero hydration flicker per `nav-shell.tsx`). The drift is page-body-grid-only.

The pattern is: nav chrome respected the responsive contract, page-body grids were stamped at desktop sizes and "polish later" was deferred indefinitely — so the dashboard, the most-visited surface, blows out at every mobile width.

## Proposed Change (Diff Outline)
- `app/(app)/dashboard/page.tsx` (line 150 hero row + line 168 second row): replace `gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)'` with `auto-fit` / `repeat(auto-fit, minmax(min(100%, 280px), 1fr))` OR (preferred for predictability) introduce a `.kalori-dashboard-hero-row` className whose default is `grid-template-columns: 1fr` and which jumps to `minmax(280px, 1fr) minmax(280px, 1fr)` at `@media (min-width: 768px)`. Preserve `--spacing-gutter-editorial` gap.
- `components/dashboard/MealsBulletin.tsx` (line 120-128): keep `repeat(5, ...)` only at `min-width: 1280px`; collapse to `repeat(2, minmax(0, 1fr))` at 768-1279, and `1fr` (single column accordion stack) below 768. Implement via a `.kalori-meals-bulletin-grid` className in globals.css matching the nav-shell media-query pattern.
- `app/globals.css`: add two new responsive utility blocks `.kalori-dashboard-hero-row` and `.kalori-meals-bulletin-grid` mirroring the existing nav-shell breakpoint block (lines 653-686). Use the canonical 768px / 1280px breakpoints already in the file.
- `app/globals.css`: add a tablet/desktop progression to `--page-padding`: an opt-in body wrapper class `.kalori-page` (or update the existing `<main>` style in `nav-shell.tsx` lines 127-137) that resolves `padding` from `--page-padding-mobile` → `--page-padding-tablet` (768+) → `--page-padding-desktop` (1280+). The tokens exist (lines 173-175); they're never escalated.
- `components/nav/nav-shell.tsx` line 132: replace inline `padding: 'var(--page-padding-mobile)'` with the new responsive `.kalori-page-main` className so all `(app)` routes inherit the breakpoint progression in one place — single source of truth for page padding.
- Out-of-scope confirmation only (no edits): bottom-tab-bar already correctly implements `repeat(4, 1fr)` (single-row, mobile-only via `.nav-shell-mobile`); LogFlowTabs `repeat(3, 1fr)` is inside a modal that's already mobile-full-sheet (globals.css 734-738) — both are fine as-is.

## Files Affected
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\dashboard\page.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\MealsBulletin.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx

## TDD Required
yes — viewport-snapshot tests for visual regression at the 3 canonical breakpoints; one assertion-level unit test on `.kalori-page-main` resolving `--page-padding-mobile` at <768px and `--page-padding-tablet` at ≥768px (jsdom + getComputedStyle on a stub element). MealsBulletin needs a render-test confirming the grid className receives the correct breakpoint utility and the markup remains accessible (5 MealColumn children regardless of viewport).

## Test Approach
- **Playwright visual-regression** (project already has `chromium-mobile`/`chromium-tablet`/`chromium-desktop` per the screenshot baselines under `tests/screenshots/`): capture dashboard, library, progress, settings at 375 / 768 / 1280 viewports; assert no horizontal overflow via `page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)`.
- **Unit (jest/vitest)**: `tests/unit/responsive-page-padding.test.ts` — mount a stub div with `.kalori-page-main`, set `window.innerWidth` to 375/768/1280 via matchMedia mock, assert computed padding equals 16/32/48px.
- **Touch-target audit**: extend the existing nav-shell tests to assert every `<a>`/`<button>` inside `<main>` reports `getBoundingClientRect()` ≥ 44×44 at 375px (catches collapsed grids that produce tiny tap targets).
- **MealsBulletin render**: assert 5 MealColumn children render at all breakpoints; assert grid `style.gridTemplateColumns` (or className) matches breakpoint contract.

## Risk Assessment
**low-medium** — the change is purely CSS layout (no logic, no data, no auth surface). Risk is concentrated on visual regression: 65 modified PNGs from the previous session indicate the visual baselines are already in flux from B.SWEEP, so the snapshot diff will be large. Mitigation: regenerate baselines as part of the fix commit and gate on horizontal-overflow assertion (objective) rather than pixel diff (subjective).

## Regression Sweep Needed
- All `(app)` pages × {375, 768, 1280} viewports (Playwright snapshot suite — extend existing `tests/screenshots/user-stories/`)
- Sidebar identity rendering at desktop ≥1280px (per recent commit `b6fe25f`) — must remain unchanged since fix only touches `<main>` padding and page-body grids, not the sidebar surface
- Bottom-tab-bar + FAB at 375-767px — must remain identical (Bug #2 / #5 separately)
- Existing visual baselines (65 modified PNGs from last session) — review which ones are dashboard/meals-related; expect to refresh them
- `kalori-library-main` page-settle animation must still fire (no className collisions on the library route)

## UI Touching
true — every fix is visual

## Quick-Pick Citation
None of the Quick-Pick rows apply directly — this is *layout responsiveness*, not animation/interaction. The relevant decision is from the **performance tier list** (web-ui-guide §12 "Performance Rules"): the fix must use only S-tier compositor properties for any motion (here: none — pure CSS grid + media queries, zero JS, zero animation). Confirms the prescribed approach: hand-rolled Tailwind v4 responsive variants + native CSS `@media`. No new library cost, aligns with `Planning/.tmp/.../project-context.md` library-prescriptions verdict ("Bottom-nav library: NONE — hand-built").

## Design-Doc Edits Required
none — bug aligns to existing spec. ui-design.md §6.6 explicitly mandates the breakpoints (375/768/1280) and `--page-padding-mobile: 16px`, and `MealsBulletin.tsx` JSDoc already documents the intended responsive variants (desktop 5-col / tablet 2-col / mobile single-column accordion) — the implementation simply never landed.

## Open Questions
1. **MealsBulletin tablet breakpoint** — JSDoc says "Tablet: 2-col grid (breakfast/lunch, dinner/snack, drink spans)". The "drink spans" note suggests a non-uniform 2-col grid where "drink" merges across both columns. ui-design.md doesn't disambiguate which 2 categories pair up. Defer to design-doc.md tiebreaker: if it's silent, ship the simpler `grid-template-columns: 1fr 1fr` with all 5 columns flowing equally. Flag for visual review post-implementation.
2. **`auto-fit` vs explicit breakpoint className** — `repeat(auto-fit, minmax(280px, 1fr))` would auto-collapse without media queries, but produces uneven columns at edge widths (320-559px). The named-class + media-query approach is more predictable and matches the established `nav-shell-*` pattern — recommend that one. No user-facing decision needed unless main agent prefers `auto-fit`.
3. **Page padding tokens at xl breakpoint** — design-doc.md / ui-design.md only define mobile / tablet / desktop padding tokens (16/32/48). For ≥1280px (canonical "desktop") the 48px value is already correct; no `--page-padding-xl` is needed. Confirmed against `lib/tokens.ts` references.
