# Bug 11: Progress micronutrient table collapsed view should stay top 4 without scrollbars
## Classification
known_fix

## Root Cause
`MicronutrientHeatmap` already keeps the collapsed default to `data.nutrients`, and the existing tests confirm this is the top-4 ranked subset. The visual defect comes from the heatmap wrapper always setting `overflowX: 'auto'` and from the mobile M-range CSS forcing `overflow-y: auto`, so the collapsed four-row view can show scrollbars even before the user asks for all micronutrients. The toggle copy is also hardcoded as `Show all minor elements` / `Hide minor elements`, which no longer matches the agreed micronutrient wording.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\MicronutrientHeatmap.tsx`
  - Preserve `const chartNutrients = expanded ? data.allNutrients : data.nutrients` so collapsed default remains top 4.
  - Change the scroll wrapper so collapsed mode does not expose horizontal or vertical scrollbars, while expanded mode keeps the current scroll behavior and max height.
  - Replace hardcoded toggle copy with `Show all micronutrients` and `Hide all micronutrients`, preferably through `lib/i18n/en.ts` under `progress.heatmap` instead of inline strings.
  - Keep the existing `data-testid="heatmap-expanded-scroll"` or rename only if tests are updated consistently.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
  - Scope the mobile M-range overflow override so it only applies when the heatmap is expanded, or use a `data-expanded` attribute on `.heatmap-scroll` to prevent collapsed vertical scrollbar display.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
  - Add progress heatmap toggle labels for show/hide micronutrients.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`
  - Update toggle copy expectations.
  - Add an assertion that collapsed mode renders four row headers and the scroll wrapper has no horizontal/vertical scrollbar style.
  - Keep/adjust the expanded assertion that the all-nutrient view enables scrolling.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\MicronutrientHeatmap.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`

## TDD Required
yes - behavior/copy regression on a tested component; write the failing component assertions before changing the component and CSS.

## Test Approach
Extend `tests/components/progress/MicronutrientHeatmap.test.tsx` so `makeRankedData()` verifies: collapsed row headers remain exactly `Calcium`, `Magnesium`, `Vitamin C`, `Vitamin D`; the toggle is named `Show all micronutrients`; the wrapper is non-scrollbar in collapsed mode; clicking toggles to all rows, the button becomes `Hide all micronutrients`, and expanded mode restores the intended scroll containment. Include `tests/visual/progress.spec.ts` and `tests/visual/responsive-overflow.spec.ts` in the later UI sweep.

## Risk Assessment
medium - scroll containment is tied to prior responsive overflow fixes for the heatmap, so the implementation must not reintroduce page-level horizontal overflow.

## Regression Sweep Needed
- Progress page heatmap at mobile/tablet/desktop widths.
- D/W/M range heatmap layouts, especially the M-range mobile transpose rule.
- Existing responsive overflow visual spec.
- Axe/component tests for heatmap grid navigation.

## UI Touching
true - progress micronutrient heatmap/table wrapper and toggle text.

## Open Questions
None for Phase 2 approval. The implementation should treat “micronutrient table” as the progress heatmap grid/table surface, not the dashboard micros panel, because the top-4/default and expanded all-nutrient behavior lives in `MicronutrientHeatmap`.
