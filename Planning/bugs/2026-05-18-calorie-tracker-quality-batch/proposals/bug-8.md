# Bug 8: AI parsed details must show micronutrients
## Classification
known_fix

## Root Cause
AI parse responses already require `micros` and the schema fills canonical micronutrient keys, but the standard parsed-food confirmation view hides micronutrients. `ConfirmationItemMicros` exists only for `mode === 'library-only'`, so text/photo parsed-food review users cannot see the top micronutrient or expand the full list before saving. Existing helpers `DEFAULT_MICROS_LIST`, `formatMicroPercent`, and `sortAndFilterMicrosByRdaPct` already provide the required daily-target percentage ordering.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
  - Add a read-only parsed-food micronutrient surface for standard text/photo confirmation rows.
  - By default, show only the top 1 nonzero micronutrient ranked by daily-target percentage.
  - Add a toggle with exact copy `Show all micronutrients` / `Hide all micronutrients`.
  - When expanded, show all nonzero canonical micronutrients sorted by daily-target percentage; keep editable 30-input behavior only for `library-only` mode.
  - Do not show a micronutrient block when all canonical values are zero.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
  - Add exact toggle copy for parsed-food view.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
  - Add standard-mode parsed micronutrient tests.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationItemMicros.test.tsx`
  - Keep/edit library-only tests so editable all-30 behavior remains unchanged.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationItemMicros.test.tsx`

## TDD Required
yes - new visible data contract for parsed AI output.

## Test Approach
- Standard text/photo confirmation renders the top micronutrient by `% RDA` only by default.
- Toggle copy is exactly `Show all micronutrients` when closed and `Hide all micronutrients` when open.
- Expanded state renders all nonzero canonical micronutrients sorted by daily-target percentage.
- All-zero micros render no parsed-food micro block.
- Library-only mode still renders editable all-30 inputs and keeps existing toggle/collapsible tests passing.

## Risk Assessment
medium - shared `ConfirmationScreen` is large and already carries separate standard vs library-only behavior; the risk is conflating read-only parsed display with editable library creation.

## Regression Sweep Needed
- Text parse confirmation.
- Photo parse confirmation.
- Library-only add-food flow.
- Existing micronutrient sort/filter helper tests.

## UI Touching
true - parsed-food confirmation row adds a read-only micronutrient disclosure.

## Open Questions
None. The requested default and toggle copy are explicit.
