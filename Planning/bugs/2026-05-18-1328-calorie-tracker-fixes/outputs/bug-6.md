# Bug 6 Output: Remove egg-specific edit dropdown units

## Files Changed
- `app/(app)/library/_components/FoodDetail/FoodDetailName.tsx`
- `tests/components/library/FoodDetail.mode-edit-query.test.tsx`

## Tests Added / Modified
- `tests/components/library/FoodDetail.mode-edit-query.test.tsx`

## Commands Run
- RED: targeted Vitest command failed as expected. Bug 6 failures showed egg-specific options still present and the legacy selected `large egg` option not disabled.
- PASS: targeted Vitest command -> 11 files / 165 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 40 pre-existing warnings, 0 errors.

## Implementation Notes
- Removed `egg`, `small egg`, `medium egg`, and `large egg` from normal edit dropdown options.
- Existing legacy saved egg-specific units remain displayed as the selected value via a disabled option, so changing the unit requires selecting from the cleaned list.

## Residual Risk
- Native select behavior for disabled selected options is browser-standard but visually browser-dependent.
