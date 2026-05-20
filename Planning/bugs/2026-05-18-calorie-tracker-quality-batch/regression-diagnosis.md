# Phase 7 Regression Diagnosis - Full Vitest Failures

Appended: 2026-05-18T21:18:00+07:00

## Initial Failure Set

Full `pnpm test` completed with 14 failed files and 19 failed tests.

## Root Cause Classification

| Failed file | Failed tests | Root cause | Fix classification |
|---|---:|---|---|
| `tests/integration/reduced-motion-audit.test.ts` | 1 | New `DailyEditorsNote` and `NutritionSummaryReview` inline opacity transitions were added without a non-comment reduced-motion guard. | Batch regression in Bug 5 UI code. |
| `tests/integration/ai-accuracy-idempotency.test.ts` | 1 | Vision route now performs image quota count queries; legacy admin cache-miss mock did not implement the count-query chain. | Batch regression in test mock coverage from Bug 5/vision quota interaction. |
| `tests/integration/ai-accuracy-regression.test.ts` | 2 | Same quota count-query mock gap for photo fixtures through `/api/ai/vision`. | Batch regression in test mock coverage from Bug 5/vision quota interaction. |
| `tests/integration/dashboard-a11y.test.tsx` | 1 | `DailyEditorsNote` first render showed only an async skeleton, so the composed dashboard no longer contained the expected note surface. | Batch regression in Bug 5 UI behavior. |
| `tests/integration/entries-save-30day-window.test.ts` | 1 | Initial diagnosis was wrong: the approved Bug 7 contract is max 30 seconds, not the old 5-minute future-skew tolerance. | Corrective regression in Bug 7 server guard. |
| `tests/integration/ai-vision-refresh.test.ts` | 1 | Vision refresh mock did not implement quota count-query chain. | Batch regression in test mock coverage from Bug 5/vision quota interaction. |
| `tests/integration/log-flow-vision-refresh.test.ts` | 1 | Same quota count-query mock gap. | Batch regression in test mock coverage from Bug 5/vision quota interaction. |
| `tests/integration/ai-vn-fallback-runtime.test.ts` | 1 | Same quota count-query mock gap on the vision fallback-chain test. | Batch regression in test mock coverage from Bug 5/vision quota interaction. |
| `tests/unit/log/confirmation-time-editor.test.tsx` | 1 | TimeEditor dispatched forced future values into confirmation state, causing save to be blocked instead of preserving the prior valid timestamp. | Batch regression in Bug 7 client guard. |
| `tests/components/log-flow/SnapTab-thumbnail-upload.test.tsx` | 4 | Desktop SnapTab now intentionally exposes `snap-tab-upload-input`; thumbnail tests still targeted removed desktop camera input `snap-tab-file-input`. | Stale test selector caused by Bug 3 desktop upload behavior change. |
| `tests/unit/scripts/apply-prod-migrations-incremental.test.ts` | 1 | Dev dry-run test mocked applied migrations only through `0023`; batch added local migration `0024`. | Stale test fixture caused by Bug 5 migration. |
| `tests/components/nav/top-app-bar.test.tsx` | 2 | ProfileMenu now calls `useRouter`; TopAppBar test did not mock `next/navigation`. | Stale test setup caused by Bug 1 navigation implementation. |
| `tests/unit/components/dashboard/DailyEditorsNote.test.tsx` | 1 | Unit expectation still assumed deterministic fallback content could render on the first paint instead of the approved no-summary skeleton. | Stale deterministic expectation after Bug 5 behavior approval. |
| `tests/integration/schema-drift/generated-types-fresh.test.ts` | 1 | `lib/database.types.ts` marker/hash still referenced `0023` after adding migration `0024`. | Batch regression in Bug 5 generated-types marker. |

## Fixes Applied

- Corrected `app/api/entries/save/route.ts` and parity `app/api/library/[id]/log-now/route.ts` future skew to the approved 30-second maximum.
- Changed `Confirmation.TimeEditor` to ignore forced future changes instead of dispatching them into save state.
- Added reduced-motion guarded opacity transitions in `DailyEditorsNote` and `NutritionSummaryReview`.
- Restored `DailyEditorsNote` to the approved client-island behavior: first load shows a skeleton when no summary is available, refreshes keep the previous summary visible, and deterministic fallback is only installed after an active request fails.
- Extended affected AI route test admin mocks to support quota count chains with zero usage.
- Updated desktop SnapTab thumbnail tests to use `snap-tab-upload-input`.
- Added `next/navigation` router mock to `TopAppBar` tests.
- Updated the migration dry-run test to include migration `0024`.
- Refreshed `lib/database.types.ts` generated marker and migration content hash for `0024_nutrition_summary_call_type.sql`.

## Verification

- `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/api/entries-save.test.ts tests/unit/log/confirmation-time-editor.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/integration/entries-save-30day-window.test.ts tests/integration/library-log-now-30day-window.test.ts` - passed, 5 files / 111 tests.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed with existing warnings only, 42 warnings / 0 errors.
- `pnpm exec vitest run tests/integration/reduced-motion-audit.test.ts tests/integration/ai-accuracy-idempotency.test.ts tests/integration/ai-accuracy-regression.test.ts tests/integration/dashboard-a11y.test.tsx tests/integration/entries-save-30day-window.test.ts tests/integration/ai-vision-refresh.test.ts tests/integration/log-flow-vision-refresh.test.ts tests/integration/ai-vn-fallback-runtime.test.ts tests/unit/log/confirmation-time-editor.test.tsx tests/components/log-flow/SnapTab-thumbnail-upload.test.tsx tests/unit/scripts/apply-prod-migrations-incremental.test.ts tests/components/nav/top-app-bar.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/integration/schema-drift/generated-types-fresh.test.ts --pool threads --maxWorkers 1 --reporter verbose` - passed, 14 files / 135 tests.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed with existing warnings only, 42 warnings / 0 errors.

## Residual Notes

- The narrowed Vitest run emitted post-summary MSW/localhost connection noise but exited 0 with all targeted tests passed.
- Full `pnpm test` was not rerun after the targeted fixes because the request asked to rerun the failed files first; the failed-file subset is now green.

## Focused DailyEditorsNote Regression Fix

Appended: 2026-05-18T21:42:25+07:00

- Reproduced the remaining `tests/components/dashboard/DailyEditorsNote.test.tsx` failures: first-load skeleton was missing, and the previous AI summary disappeared during a day refresh.
- Root cause: `components/dashboard/DailyEditorsNote.tsx` selected deterministic fallback content whenever the stored summary key did not match the active request key. That bypassed the approved no-summary skeleton and replaced the previous visible summary during refresh.
- Fix: `DailyEditorsNote` now renders `daily-editors-note-skeleton` only when no summary exists, retains `state.summary` while a new request is busy, and still installs deterministic fallback only from the request error path.
- Updated the older unit component expectation to assert the first-load skeleton instead of stale deterministic first-paint copy.
- Verification: `pnpm test tests/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` passed, 1 file / 2 tests.
- Verification: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` passed, 1 file / 3 tests.
- Verification: `pnpm typecheck` passed.
- Verification: `pnpm lint` passed with 42 warnings / 0 errors.

## Focused DailyEditorsNote Accessibility Fix

Appended: 2026-05-18T22:00:16+07:00

### Failure
- Command: `pnpm test tests/integration/dashboard-a11y.test.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose`
- Initial result: failed in `tests/integration/dashboard-a11y.test.tsx` at line 480.
- Assertion: composed dashboard expected `[data-testid="daily-editors-note"]`, but the query returned `null`.

### Root Cause
- `DailyEditorsNote` renders `DailyEditorsNoteSkeleton` while the first AI summary request is unresolved.
- The skeleton branch only exposed `data-testid="daily-editors-note-skeleton"`.
- The loaded branch exposes `data-testid="daily-editors-note"` via `EditorsNote`, so the dashboard summary surface disappeared from the DOM during first load.

### Fix
- Kept first-load skeleton behavior.
- Added a stable accessible skeleton shell with `data-testid="daily-editors-note"`, `role="status"`, `aria-busy="true"`, and an `aria-label`.
- Moved the existing skeleton marker to an inner wrapper so existing skeleton assertions still work.
- Added a unit regression assertion that first load exposes the stable daily note container.

### Verification
- RED: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` failed because `daily-editors-note` was missing in the skeleton branch.
- PASS: `pnpm test tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose`.
- PASS: `pnpm test tests/integration/dashboard-a11y.test.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose` (3 files / 20 tests).
- PASS: `pnpm typecheck`.
- PASS: `pnpm exec eslint components/dashboard/DailyEditorsNote.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/integration/dashboard-a11y.test.tsx`.

### Notes
- Vitest still printed MSW interceptor `socket hang up` messages after the passing three-file run, but the process exited with code 0 and all tests passed.
