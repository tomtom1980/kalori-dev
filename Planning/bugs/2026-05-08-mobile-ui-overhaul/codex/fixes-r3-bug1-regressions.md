# Phase 7 Regression Fix — Bug #1 Loopback (REG-1 / REG-2 / REG-3)

## REG-1 root cause (`/progress` @ 375px → scrollWidth 526, overflow 151px)

The progress page surfaced **three** independent overflow contributors that
Bug #1's responsive contract did not cover:

1. **Flex-column `min-width: auto`** in the nav-shell — the unnamed flex
   wrapper around the top app bar + main content
   (`<div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>` at
   `nav-shell.tsx:120`) inherits the default `min-width: auto`. With any
   descendant whose intrinsic min-content exceeds the viewport, the flex
   item refuses to shrink and pushes the whole page horizontally.
2. **Progress page outer grid** uses `gridTemplateColumns: 'repeat(12, 1fr)'`
   = `repeat(12, minmax(auto, 1fr))`. Grid items default `min-width: auto`,
   so chart cards with intrinsic content wider than the column track widen
   the track and overflow the page.
3. **Three fixed-width descendants** that the Bug #1 fix never touched:
   - `MicronutrientHeatmap` table (~488px natural width with 8 columns)
   - `LoggingConsistencyCalendar` `<figure>` (`repeat(7, 56px)` = 404px @ W
     range)
   - `ProgressRangeToolbar` flex bar (kicker + 3 chips + window-label =
     ~412px min-content)

Of these the **toolbar** was the residual offender after the structural
fixes — `flex-wrap: nowrap` (default) prevented graceful wrapping at narrow
viewports.

## REG-2 root cause (`/dashboard` @ 768px → scrollWidth 892, overflow 124px)

At 768px viewport the sidebar (~240px) + `kalori-page-main` padding (32+32)
consumes 304px, leaving 464px for content. The Bug #1 hero-row rule
`grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr)` demanded
`280 + 28 (gap) + 280 = 588px` of guaranteed min-content — **124px wider**
than the available 464px. Combined with `min-width: auto` on the flex
wrapper above, the main column expanded to 588+64=652px → 892px right edge.

Secondary contributor: `ChronometerRing.tsx:160` hard-coded `width: 280;
height: 280` on the ring wrapper (and the SVG itself), which prevented
shrinking even after the grid track was relaxed.

## REG-3 root cause (`/progress` @ 768px → scrollWidth 798, overflow 30px)

Same module class as REG-1 (heatmap + lcc-grid + toolbar) but at tablet,
where sidebar consumes 240px → 528 budget − 64 padding = 464 content. The
masthead H1 + heatmap intrinsic content combined to 30px of residual
overflow once the dashboard hero fix landed. Resolved by the same
`min-width: 0` cascade + heatmap-scroll constraint that REG-1 fix applies.

## Fix Applied

### 1. `app/globals.css` (responsive utility extension)

- `.kalori-page-main { min-width: 0 }` — let the main shrink inside its
  flex parent.
- `.kalori-dashboard-hero-row { min-width: 0 }` + `> * { min-width: 0 }` —
  grid items can shrink below min-content.
- `@media (min-width: 768px) .kalori-dashboard-hero-row` track changed
  from `minmax(280px, 1fr) minmax(280px, 1fr)` → `minmax(0, 1fr)
  minmax(0, 1fr)` (children self-cap via `max-width: 280px`).
- New `.kalori-progress-main { min-width: 0; width: 100% }` for the
  `/progress` `<main>`.
- New `.kalori-progress-charts-grid` (replaces inline `repeat(12, 1fr)`):
  uses `repeat(12, minmax(0, 1fr))` with `min-width: 0` cascade.
- New `.kalori-progress-charts-row` (replaces inline `auto-fit, minmax(min(100%,
  320px), 1fr)`): single column at mobile, 2-col `minmax(0, 1fr)` at
  ≥768px.
- `.kalori-meals-bulletin-grid { min-width: 0 }` — defensive; aligns with
  the rest of the cascade.

### 2. `components/nav/nav-shell.tsx`

- Added `minWidth: 0` to the unnamed `<div style={{flex: 1, display:
  'flex', flexDirection: 'column'}}>` wrapper around top-app-bar + main.

### 3. `app/(app)/progress/page.tsx`

- Added `className="kalori-progress-main"` to the `<main data-testid=
  "page-progress">` shell.
- Replaced inline outer-grid `style={{gridTemplateColumns: 'repeat(12,
  1fr)', ...}}` with `className="kalori-progress-charts-grid"`.
- Replaced two inline inner-grid `style={{gridTemplateColumns: 'repeat(
  auto-fit, minmax(320px, 1fr))', ...}}` with `className="kalori-progress
  -charts-row"`.

### 4. `components/charts/MicronutrientHeatmap.tsx`

- Heatmap-scroll wrapper gained `maxWidth: '100%'` + `minWidth: 0`
  alongside its existing `overflowX: 'auto'`. Now actually engages
  scroll instead of expanding the page.

### 5. `components/charts/LoggingConsistencyCalendar.tsx`

- Wrapped the `<figure data-testid="lcc-grid">` in a new scroll
  container `<div data-testid="lcc-grid-scroll" style={{overflowX:
  'auto', maxWidth: '100%', minWidth: 0}}>` — the figure's fixed
  `repeat(${cols}, ${cellSize}px)` grid (404px @ W range) now scrolls
  horizontally inside its constrained chart card.

### 6. `components/charts/ChartCard.tsx`

- Added `minWidth: 0` to the `<section>` style — chart cards can shrink
  to track width.

### 7. `components/charts/ChronometerRing.tsx`

- Outer wrapper changed from `display:flex; alignItems:center` (no width
  constraint) to add `width: '100%'; minWidth: 0`.
- Inner ring wrapper changed from `width: 280; height: 280` →
  `width: '100%'; maxWidth: 280; aspectRatio: '1 / 1'`.
- SVG `width={280} height={280}` → `width="100%" height="100%"` — the
  `viewBox` already preserves aspect ratio + numeral positions.

### 8. `app/(app)/progress/_components/ProgressRangeToolbar.tsx`

- `<nav>` gained `flexWrap: 'wrap'` + `minWidth: 0` so the kicker + chips
  + window-label row breaks gracefully at narrow viewports instead of
  pushing the page wider. No structural change to chips themselves.

### 9. `tests/unit/design-tokens/responsive-page-classes.test.ts`

- Updated the assertion for `.kalori-dashboard-hero-row` 768 escalation
  from `minmax(280px, 1fr) minmax(280px, 1fr)` → `minmax(0, 1fr)
  minmax(0, 1fr)` to match the relaxed grid track. Comment captures the
  rationale (REG-2 root cause).

## Files Touched

- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\nav-shell.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\page.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\MicronutrientHeatmap.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\LoggingConsistencyCalendar.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\ChartCard.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\ChronometerRing.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\ProgressRangeToolbar.tsx
- C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\design-tokens\responsive-page-classes.test.ts

## Test Run Result

- **3 specific assertions (REG-1/REG-2/REG-3):** RED → GREEN
  - `/progress @ mobile-375`: was 526px / overflow 151 → now ≤376
  - `/dashboard @ tablet-768`: was 892px / overflow 124 → now ≤769
  - `/progress @ tablet-768`: was 798px / overflow 30 → now ≤769
- **Full `responsive-overflow.spec.ts`:** **12/12 PASS** (was 9/12)
- **Bug #1 unit tests** (`responsive-page-classes`, `MealsBulletin
  .responsive`, `dashboard-page-responsive`): **15/15 PASS** (was 12/15
  briefly while the 280px expectation was stale; updated 1 assertion to
  match the relaxed `minmax(0, 1fr)` track + Phase 7 rationale comment).
- **Regression sweep** (`tests/components/dashboard`, `tests/components/
  charts`, `tests/components/progress`, `tests/unit/components/dashboard`,
  `tests/unit/design-tokens`, `tests/unit/app`): **201/201 PASS**, zero
  regressions across 28 test files.

## Open Concerns

1. **Visual baselines still pending user approval** — the 5 mobile baseline
   PNGs (`dashboard`, `library`, `progress`, `log-confirmation`, `weight`)
   flagged in Phase 7 e2e-results were NOT auto-accepted (per bugfix-tomi
   guard). Phase 7 fix definitely changes mobile geometry further (the
   chronometer scales fluidly now, the toolbar wraps), so the dashboard +
   progress baselines will diff again. User must approve before Phase 8.
2. **`auto-fit` removal at progress charts row** — the previous `auto-fit,
   minmax(min(100%, 320px), 1fr)` was a single-pass responsive idiom; the
   new explicit `1fr` → `1fr 1fr @768` is more predictable but slightly
   less elegant. Aligned with the established `nav-shell-*` named-class +
   media-query pattern Bug #1 chose, so consistent with the spec.
3. **`flex-wrap: wrap` on ProgressRangeToolbar** — at 360-374px viewports
   the kicker + chips will wrap to two lines and the window-label drops
   to a third. Visually fine (kept The Ledger aesthetic intact, just
   stacked) but worth a designer eye on the next visual pass.
4. **No new visual baselines accepted** — `responsive-overflow.spec.ts`
   uses overflow assertion only; produces zero PNGs (matches Bug #1
   contract).
5. **REG-3 secondary culprits** at `/progress @ 768`: post-fix the page
   reports a few weekly-review-island descendants with `right > viewport`
   (e.g. ARTICLE article-66 at right=82) — these are within tolerance
   (`scrollWidth ≤ innerWidth + 1`), do not trigger the assertion, and
   appear to be transient Suspense fallback positioning. Not in scope.
