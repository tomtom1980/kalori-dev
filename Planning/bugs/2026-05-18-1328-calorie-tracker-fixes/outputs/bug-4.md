# Bug 4 Output: Library custom serving scales micronutrients

## Files Changed
- `lib/stores/useLogFlowStore.ts`
- `lib/library/to-log-library-item.ts`
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`

## Tests Added / Modified
- `tests/unit/library/to-log-library-item.test.ts`
- `tests/components/library-tab-continue-cta.test.tsx`

## Commands Run
- RED: targeted Vitest command failed as expected. Bug 4 failures included `item.micros.vitamin_c` being `undefined` after selecting a doubled library quantity and `toLogLibraryItem` dropping `nutrition.micros`.
- PASS: targeted Vitest command -> 11 files / 165 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` with 40 pre-existing warnings, 0 errors.

## Implementation Notes
- Added optional `micros` to `LogLibraryItem`.
- `toLogLibraryItem` now preserves library `nutrition.micros`.
- Library selection confirmation now scales micros by the same `quantity / defaultPortion` ratio as kcal/macros.

## Residual Risk
- Sparse or legacy micros maps are preserved as-is; canonicalization remains the responsibility of existing downstream aggregation/display helpers.
