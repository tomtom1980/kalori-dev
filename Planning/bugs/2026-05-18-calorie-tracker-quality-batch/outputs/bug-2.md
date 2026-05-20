# Bug 2: Missing loading states for high-confidence async user actions

## Status
implemented

## Audit Summary
- Already covered by existing implementation or other Phase 3 slices: settings export, account delete, AI text parse, photo analyze/compress, confirmation save, water add/edit, weight quick-add, sketch backfill, library detail save/delete/log-now, route-level library skeletons, and dashboard date loading.
- Added missing high-confidence pending feedback for: progress range navigation, Copy Yesterday submit, Library Add Item quota check, bulk library log, and card quick-log meal logging.
- Did not touch AI summary internals. Full typecheck is currently blocked by Bug 5 nutrition-summary files/imports that are in progress.

## Files Touched
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx`
- `app/(app)/log/copy-yesterday/_components/CopyYesterdayModal.tsx`
- `app/(app)/library/_components/BulkActionsBar.tsx`
- `app/(app)/library/_components/LibraryClient.tsx`
- `lib/i18n/en.ts`
- `tests/components/progress/ProgressRangeToolbar.test.tsx`
- `tests/unit/components/log-flow/CopyYesterdayModal.test.tsx`
- `tests/components/library/BulkActionsBar.test.tsx`
- `tests/components/library/LibraryClient.quick-actions.test.tsx`

## Implementation Notes
- Progress range chips now track the requested target and expose `aria-busy`, `aria-disabled`, `data-pending`, wait cursor, and opacity while `router.replace(..., { scroll: false })` is pending.
- Copy Yesterday now guards duplicate submit, disables conflicting selection/cancel actions during submit, and swaps the CTA to a spinner plus `COPYING {count} ENTRIES`.
- Bulk library log now passes a busy prop into `BulkActionsBar`, marks the region and LOG button busy, disables LOG/DELETE/CANCEL, and suppresses keyboard shortcuts while logging.
- Library Add Item quota check now marks the button busy, disables it, and shows `CHECKING` while `/api/library/quota` is unresolved.
- Card quick-log dialog now exposes `aria-busy`, disables meal buttons while `/api/library/[id]/log-now` is unresolved, and labels the selected meal as `LOGGING`.

## Tests Added / Updated
- `tests/components/progress/ProgressRangeToolbar.test.tsx::marks the requested range busy until the server-rendered active range catches up`
- `tests/unit/components/log-flow/CopyYesterdayModal.test.tsx::shows semantic busy feedback and prevents duplicate copy submits while pending`
- `tests/components/library/BulkActionsBar.test.tsx::marks the whole bulk bar busy and disables conflicting actions while bulk log is pending`
- `tests/components/library/LibraryClient.quick-actions.test.tsx::Add Item button exposes quota-check busy state while the quota request is pending`
- `tests/components/library/LibraryClient.quick-actions.test.tsx::quick-log meal dialog exposes busy state while the log request is pending`
- `tests/components/library/LibraryClient.quick-actions.test.tsx::bulk-log actions expose busy state while selected items are being logged`

## Verification
- RED confirmed: focused component suites failed on the six new loading-state assertions before implementation.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/components/progress/ProgressRangeToolbar.test.tsx tests/unit/components/log-flow/CopyYesterdayModal.test.tsx tests/components/library/BulkActionsBar.test.tsx tests/components/library/LibraryClient.quick-actions.test.tsx` -> 4 files passed, 43 tests passed.
- PASS with pre-existing warnings: `pnpm exec eslint ...Bug 2 files...` -> 0 errors; 6 warnings in `LibraryClient.tsx` for orphan merge symbols that predate this worker slice.
- BLOCKED: `pnpm typecheck` fails on Bug 5 AI nutrition-summary tests/imports (`summary-context`, `app/api/ai/nutrition-summary/route`, `v1_nutritionSummary`, `NutritionSummaryResult`), outside Bug 2 scope.

## Residual Gaps
- No E2E/browser visual sweep was run for this worker slice; component tests cover behavior and a11y semantics.
- Broad audit was static and targeted to high-confidence async user actions; speculative client-only UI actions such as local filter/sort/menu open were intentionally left unchanged.
- Full project typecheck should be rerun after Bug 5 lands its AI summary internals.

## Follow-Up: Library Quick-Action Edit Navigation

Old-batch notes copied into the active batch reported a focused Chromium failure where `tests/e2e/library/library-quick-action-menu.spec.ts` stayed on `/library` after selecting Edit instead of navigating to `/library/<id>?mode=edit`.

### Investigation Result

- Inspected `LibraryClient` quick-action wiring, `LibraryCardActionMenu`, the component coverage, and the Playwright spec.
- The current working tree already preserves the pending/loading states for Add Item, bulk log, quick log, and card navigation.
- No production code patch was applied because the failure did not reproduce in the current tree.

### Verification

- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/components/library/LibraryClient.quick-actions.test.tsx` -> 1 file / 11 tests passed.
- PASS: `pnpm exec playwright test --project=chromium tests/e2e/library/library-quick-action-menu.spec.ts --reporter=line` -> 2 tests passed.
- PASS: exact wider copied failing command -> 34 tests executed; 23 passed, 11 skipped, 0 failed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` -> 0 errors, 42 existing warnings.

### Status

- Non-visual E2E blocker is green in the current working tree.
- Visual baseline drift remains separate from Bug 2 loading-state behavior.
