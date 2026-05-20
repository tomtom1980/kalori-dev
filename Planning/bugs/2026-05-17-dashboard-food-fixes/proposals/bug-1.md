# Bug 1: Dashboard data table still renders as dropdown
## Classification
known_fix

## Root Cause
`ChronometerRing` still uses the original `<details><summary>View as data table</summary>` fallback below the dashboard calorie ring, so the dashboard opens a browser disclosure/dropdown instead of the professional modal now used by progress charts. The progress surface already has the correct local pattern in `components/charts/DataTableDrawer.tsx`, built on Radix Dialog with a structured table. UI guidance aligns with this: the web Quick-Pick table points dashboard/data-heavy surfaces toward dashboard/table primitives, and `Planning/ui-design.md` requires modal surfaces to use `role="dialog" aria-modal="true"` with focus handling instead of ad hoc disclosure UI.

## Proposed Change (Diff Outline)
- `components/charts/ChronometerRing.tsx`
  - Import and render `DataTableDrawer` in place of the current `<details data-testid="chrono-data-table">` block.
  - Keep the same trigger label from `t.dashboard.ring.dataTableSummary`.
  - Use a dashboard-specific caption derived from the existing `ariaLabel` or a short i18n caption.
  - Keep the current metric/value rows: consumed kcal, target kcal, percent, fiber, entries, and last logged.
  - Preserve the existing `role="img"` sibling structure so the previous nested-interactive axe fix remains intact.
- `tests/unit/components/charts/ChronometerRing.test.tsx`
  - Replace the legacy `<details>` assertion with a modal assertion: trigger is a button named "View as data table"; clicking it opens a dialog containing a table and the expected calorie/entry rows.
  - Assert no native `<details>` remains for `chrono-data-table`.
- `tests/integration/dashboard-a11y.test.tsx`
  - No required structural change expected, but rerun the existing Chronometer/dashboard axe tests because Radix Dialog introduces portal content after interaction.

## Files Affected
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\ChronometerRing.tsx
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\DataTableDrawer.tsx
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\charts\ChronometerRing.test.tsx
C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\dashboard-a11y.test.tsx

## TDD Required
yes - this is a UI behavior regression, and the current test only checks that the legacy disclosure text exists.

## Test Approach
- Add/update a unit test that renders `ChronometerRing`, clicks the "View as data table" trigger with `userEvent`, and asserts a Radix dialog opens with table headers and expected rows.
- Assert the dashboard no longer renders a native `<details>` fallback for the calorie table.
- Run the focused Chronometer unit test plus the existing dashboard axe integration sweep.

## Risk Assessment
low - the change should be confined to swapping one dashboard disclosure fallback to an existing shared progress modal component with the same row data.

## Regression Sweep Needed
- Dashboard chronometer populated, empty, and over-target states.
- Dashboard composed axe test to catch portal/focus/ARIA regressions.
- Progress chart data-table modals, only to ensure shared `DataTableDrawer` remains unchanged.

## UI Touching
true - `components/charts/ChronometerRing.tsx` dashboard data-table trigger and modal surface.

## Open Questions
None. The existing progress `DataTableDrawer` is the clear local pattern to reuse.
