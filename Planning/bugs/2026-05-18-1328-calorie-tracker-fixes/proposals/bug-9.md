# Bug 9: Progress minor elements table/tooltips and under-target heatmap ranking

> STOP FLAG: classified as `actually_a_feature`. The current implementation is a fixed limited heatmap, and the requested top-four-under-target default plus expandable all-minor-elements view is a new interaction/data model rather than a narrow defect fix.

## Classification
actually_a_feature

## Root Cause
The progress heatmap data contract is intentionally limited today: `lib/aggregations/progress.ts` defines `HEATMAP_NUTRIENTS` as five hard-coded rows (`vitamin_a`, `vitamin_c`, `vitamin_d`, `iron`, `calcium`) and aggregates only those keys from entry micros. The component and client tooltip mirror that limitation with hard-coded `humanize()` branches and a data table built from the same limited `cells` array. `Planning/ui-design.md` planned a fixed seven-row heatmap, while this request asks for all canonical minor elements with ranking, details, and expand/collapse behavior, which is a product behavior expansion.

## Proposed Change (Diff Outline)
- Stop before implementation because this is feature work, not a known bug fix.
- If approved as a feature, revise the heatmap data contract to use `DEFAULT_MICROS_LIST`/RDA metadata instead of the five-row `HEATMAP_NUTRIENTS` constant.
- Add deterministic ranking that defaults the visible chart rows to the four nutrients most under target for the selected range.
- Add an expand/collapse control that reveals all minor elements in a vertically scrollable heatmap/table region without breaking the existing horizontal bucket scroll.
- Extend tooltip/table rows to show nutrient name, unit, actual intake, target/RDA, percent of target, and range/bucket context, matching the existing shared `ChartTooltip` pattern: bg-1 surface, 2px oxblood left rule, rule-strong border, compact mono/serif content.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\progress.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\nutrition\micros-rda.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\MicronutrientHeatmap.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\HeatmapInteractive.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\progress.test.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`

## TDD Required
yes - ranking, row visibility, table completeness, and tooltip detail formatting are behavior/data-shape changes, not cosmetic changes.

## Test Approach
- Add RED unit coverage in `tests/unit/lib/aggregations/progress.test.ts` asserting all canonical minor elements are aggregated from `DEFAULT_MICROS_LIST`, not just the current five keys.
- Add RED unit coverage for visible-rank behavior: given more than four nutrients with varying average `% target`, the default chart rows are the four lowest average percentages among nutrients with valid targets.
- Add RED component coverage in `tests/components/progress/MicronutrientHeatmap.test.tsx` asserting the default grid renders four nutrient rowheaders, the data-table drawer includes all minor elements, and expanding reveals all rows inside a scrollable region.
- Add tooltip coverage asserting a heatmap cell tooltip includes nutrient display name, unit-aware actual value, target/RDA, percent of target, and bucket/date context while preserving the existing `ChartTooltip` role/test pattern.
- Keep existing axe and keyboard navigation tests, updating row-count expectations from fixed five rows to default four rows and expanded all rows.

## Risk Assessment
medium - the change touches the progress aggregation contract and a keyboard-navigable grid; mistakes could regress accessibility, row/column navigation, or progress page overflow.

## Regression Sweep Needed
- Progress heatmap rendering across D/W/M ranges.
- Heatmap keyboard navigation and tooltip dismissal.
- Data-table drawer accessibility and scroll behavior.
- Progress visual overflow at mobile/tablet breakpoints.
- Trend summary micro-trend calculations if shared nutrient constants are changed.

## UI Touching
true - `MicronutrientHeatmap`, `HeatmapInteractive`, shared progress chart tooltip usage, and the heatmap data-table drawer. The UI-design web guide Quick-Pick table recommends Tremor for dashboard charts/KPIs, but this app already uses a bespoke table/grid heatmap and shared `ChartTooltip`; proposed work should align with that existing pattern rather than introduce a new chart library.

## Open Questions
- Should “all minor elements” mean the canonical 30-entry `DEFAULT_MICROS_LIST`, or the seven-row set from `Planning/ui-design.md` (`fibre`, `protein`, plus five micros)?
- Should ranking consider zero-intake nutrients as most under target, or should it rank only nutrients that appear in logged food data?
- Should sodium/chloride-style upper-guidance nutrients be treated as “under target is bad” the same way vitamins/minerals are, or should their ranking semantics differ?
- Since the diff outline exceeds five likely files and changes intentional heatmap behavior, this should be routed through planning/feature approval before implementation.

## User Decision
Bug #9 stays in this batch as a scoped progress-page enhancement. "All minor elements" should use the app's canonical `DEFAULT_MICROS_LIST`, not the smaller UI design doc set.
Do not rank or show zero-intake micronutrients. Only record/show micronutrients with some value, and exclude anything below 1% of daily value from the table and chart/ranking.
Upper-limit-style nutrients such as sodium should be excluded from the default top-four "most under target" ranking, but still included in the expanded/table view when they are >=1% DV.
