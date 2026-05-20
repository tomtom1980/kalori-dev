# Bug 4: Data table view close button should match shared popup X style
## Classification
known_fix

## Root Cause
`DataTableDrawer` renders its Radix dialog close control as a full text button using `t.progress.dataTableClose`, while nearby popup surfaces such as `MicroBreakdownDialog` use the shared `kalori-log-close` icon-only button with a lucide `X`. This makes the chart/table dialog visually heavier than the shared popup chrome and inconsistent with the Ledger zero-radius popup pattern. UI guidance supports staying in the current Tailwind/Radix chart stack: web guide Quick-Pick lists dashboard charts as Tailwind + chart primitives, and `Planning/ui-design.md` prescribes charts/heatmap under the current progress stack with Radix-style primitives.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\DataTableDrawer.tsx`
  - Import `X` from `lucide-react`.
  - Replace the text `Dialog.Close` button with `Dialog.Close asChild` wrapping a native `button` using `className="kalori-log-close"`.
  - Keep `aria-label={t.progress.dataTableClose}` so screen-reader copy remains stable while the visible control becomes a small X.
  - Do not change table data behavior or chart callers.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`
  - Update or add a component assertion that the data-table dialog close control is icon-only by accessible name and does not visibly render the word `Close` inside the header.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\DataTableDrawer.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx`

## TDD Required
no - pure UI chrome alignment with existing popup style; a focused component regression assertion is still recommended.

## Test Approach
Add/adjust a React Testing Library test that opens the heatmap data-table dialog via `View heatmap as table`, finds the close button by accessible name, and verifies the dialog can close. For visual confidence, include the progress visual spec in the later UI sweep because the visible header chrome changes.

## Risk Assessment
low - isolated shared chart drawer chrome; all existing chart callers keep the same `DataTableDrawer` API.

## Regression Sweep Needed
- Progress heatmap data-table dialog.
- Other chart data-table dialogs that share `DataTableDrawer` (`ChronometerRing`, `CalorieAdherenceBar`, `LoggingConsistencyCalendar`, `MacroDistributionStackedArea`, `TrendSummary`).
- Progress visual baseline around chart dialogs if visual testing opens the table dialog.

## UI Touching
true - `DataTableDrawer` Radix dialog close control.

## Open Questions
None for Phase 2 approval. If implementation broadens beyond the close button into overlay/backdrop styling, confirm separately because that would affect every chart data-table dialog.
