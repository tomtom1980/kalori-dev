# Bug 9 Output: Progress canonical micronutrient ranking and expanded view

## Files Changed
- `lib/aggregations/progress.ts`
- `components/charts/MicronutrientHeatmap.tsx`
- `components/charts/HeatmapInteractive.tsx`
- `tests/unit/lib/aggregations/progress.test.ts`
- `tests/components/progress/MicronutrientHeatmap.test.tsx`

## Tests Added/Modified
- `tests/unit/lib/aggregations/progress.test.ts`
  - Added canonical `DEFAULT_MICROS_LIST` coverage beyond the legacy five rows.
  - Added filtering assertions for zero and `<1% DV` nutrients.
  - Added sodium/upper-limit exclusion coverage for the default top-four deficiency ranking.
- `tests/components/progress/MicronutrientHeatmap.test.tsx`
  - Added default four-row rendering coverage.
  - Added expand-to-all eligible rows coverage with scroll behavior.
  - Added data-table coverage for all eligible nutrients, including sodium.

## Commands Run
- FAIL (expected RED): `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx`
  - Failed on bug 9 because `allNutrients` was absent, the heatmap still used the legacy five-row contract, and the expanded/table interactions did not exist.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx`
  - `4 passed`, `84 passed`.
- PASS: `pnpm exec eslint ...`
  - Targeted lint on the bug 7/9 touched files passed.
- PASS: `pnpm typecheck`

## Implementation Notes
- Replaced the fixed heatmap nutrient set with canonical `DEFAULT_MICROS_LIST` codes and RDA targets.
- Canonicalized incoming micro keys through the existing closed-allowlist helper before aggregation.
- Added `allNutrients` for all eligible rows and kept `nutrients` as the default chart rows.
- Eligibility hides zero and raw `<1% DV` nutrients from chart/table output.
- Default ranking picks the four lowest average `% DV` nutrients after excluding upper-limit-style nutrients (`sodium`, `chloride`).
- Expanded mode renders all eligible rows in the existing heatmap with vertical scroll. Table view summarizes all eligible nutrients.
- Tooltip/ARIA text now uses canonical display names and units.

## Residual Risk
- Upper-limit exclusion is currently a local set for `sodium` and `chloride`; if the canonical table later marks more nutrients as upper-limit-style, this set should move into the nutrition metadata.
