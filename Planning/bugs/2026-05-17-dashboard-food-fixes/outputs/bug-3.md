# Bug 3 Output: Library Serving Defaults

## Status
Implemented.

## Files changed
- `lib/stores/useLogFlowStore.ts`
- `lib/library/to-log-library-item.ts`
- `app/(app)/log/page.tsx`
- `app/(app)/log/_components/LogPageClient.tsx`
- `app/(app)/log/_components/AddFoodTab/LibraryList.tsx`
- `tests/unit/library/to-log-library-item.test.ts`
- `tests/components/library-tab-continue-cta.test.tsx`
- `tests/components/log-flow/library-tab-preselect.test.tsx`
- `tests/integration/log-page-library-hydration.test.tsx`

## Tests added or modified
- Added mapper tests proving valid `default_portion` becomes `defaultPortion` and invalid/null values are omitted for legacy 1g behavior.
- Added library-tab tests proving a fried-egg-style item defaults to its saved serving and does not rescale nutrition at the default amount.
- Added library-tab scaling coverage proving 100g against a 50g saved serving scales nutrition by 2x.
- Added row-selection and log-page hydration tests so preselected/hydrated library items keep saved serving defaults when no explicit quantity is provided.

## Commands run
- `pnpm exec vitest run --pool threads --maxWorkers 1 tests/unit/components/DuplicateLogConfirmDialog.test.tsx tests/unit/library/to-log-library-item.test.ts tests/components/library-tab-continue-cta.test.tsx tests/components/log-flow/library-tab-preselect.test.tsx tests/integration/log-page-library-hydration.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/components/library/LibraryClient.quick-actions.test.tsx tests/components/library/FoodDetail-LogNow-Retry.test.tsx`
  - Pass: 8 files, 87 tests.
- `pnpm typecheck`
  - Pass.
- `pnpm lint`
  - Pass with warnings only. The remaining warning in `LibraryClient.tsx` is unrelated existing merge-dialog code.

## Result
`defaultPortion` now survives library-to-log hydration, deep-link preselection, and the log-flow store type. Selecting a saved library food defaults the quantity to the saved serving and scales nutrition by `quantity / defaultPortion`; legacy rows without a valid saved serving keep the previous `quantity = 1` behavior.

## Residual risks
- `LibraryList.tsx` is a shared file that also contains concurrent pagination/scroll work from another worker; this output only claims the default-serving behavior and tests.
- No database-backed browser E2E was run for this worker scope.
