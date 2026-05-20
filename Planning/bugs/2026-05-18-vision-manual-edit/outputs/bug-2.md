# Bug 2 Output: Mobile manual fallback UI/options

## Changed Files
- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `app/(app)/log/_components/LogFlowErrorBanner.tsx`
- `app/(app)/log/_components/LogFlowTabs.tsx`
- `lib/i18n/en.ts`
- `app/globals.css`
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
- `tests/components/log-flow/LogFlowErrorBanner.test.tsx`

## Implementation Summary
- Replaced the cramped inline fallback form with a tokenized recovery panel that keeps snap thumbnails visible and explains that the photo was retained.
- Added quantity editing with unit radio options (`g`, `serving`, `piece`, `bowl`, `cup`), preset amount chips, and a mobile `MobileWheelSheet` / `MobileWheelPicker` path for quantity selection.
- Added optional macro fields behind the existing Radix Collapsible pattern and included entered macros in the manual payload.
- Updated manual fallback submission so confirmation receives the selected unit, quantity, optional macros, and a lower confidence signal for manual recovery.
- Kept existing validation, inline errors, summary alert, and first-invalid focus behavior.
- Round 1 fixes: normalized mobile wheel values on unit changes/open/done so gram quantities cannot carry into count units; made retry copy mode-aware (`TRY PHOTO AGAIN` for snap, neutral `TRY AGAIN` for type/library); added field-level macro errors with `aria-errormessage` and first-invalid macro focus.
- Final nested-form fix: replaced the inner `ManualEntryFallback` `<form>` with a non-form manual-entry wrapper so it can mount inside the Type tab's parent `<form>` without invalid HTML or React `validateDOMNesting` warnings. The submit action is now an explicit button handler, and Enter on text inputs still runs the same validation/submission path.

## Tests Added / Updated
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
  - photo retention and needs-review copy
  - unit selection and preset behavior
  - optional macro disclosure and payload inclusion
  - mobile wheel-sheet rendering and commit behavior
  - gram-to-piece mobile wheel stale-value regression
  - type vs snap retry label regression
  - invalid optional macro field error text, ARIA association, and focus handling
  - no nested-form warning when mounted inside the Type tab form
  - Enter key submission still works without an inner form
  - retained existing validation, focus, retry, and client-id clearing coverage
- `tests/components/log-flow/LogFlowErrorBanner.test.tsx`
  - hoisted retry banner uses neutral copy for type failures and photo-specific copy for snap failures

## Commands / Results
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/ManualEntryFallback.test.tsx`
  - Result: passed, 11 tests.
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`
  - Result: passed, 3 tests.
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/ManualEntryFallback.test.tsx tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`
  - Result: passed, 14 tests.
- `pnpm exec eslint "app/(app)/log/_components/ManualEntryFallback.tsx" "app/(app)/log/_components/LogFlowTabs.tsx" "tests/components/log-flow/ManualEntryFallback.test.tsx"`
  - Result: passed, no warnings after ARIA adjustment.
- `pnpm typecheck` (initial Bug 2 implementation pass)
  - Result: passed.
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/ManualEntryFallback.test.tsx tests/components/log-flow/LogFlowErrorBanner.test.tsx`
  - Result: passed, 19 tests.
- `pnpm exec eslint "app/(app)/log/_components/ManualEntryFallback.tsx" "app/(app)/log/_components/LogFlowErrorBanner.tsx" "tests/components/log-flow/ManualEntryFallback.test.tsx" "tests/components/log-flow/LogFlowErrorBanner.test.tsx"`
  - Result: passed.
- `pnpm exec prettier --check "app/(app)/log/_components/ManualEntryFallback.tsx" "app/(app)/log/_components/LogFlowErrorBanner.tsx" "lib/i18n/en.ts" "tests/components/log-flow/ManualEntryFallback.test.tsx" "tests/components/log-flow/LogFlowErrorBanner.test.tsx"`
  - Result: passed.
- `pnpm typecheck`
  - Result: blocked by existing out-of-scope error in `tests/components/nav/nav-shell.test.tsx:356`; no errors were reported in the Round 1 manual fallback files.
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/ManualEntryFallback.test.tsx tests/components/log-flow/LogFlowErrorBanner.test.tsx`
  - Result: passed, 21 tests after the nested-form fix.
- `pnpm exec prettier --check "app/(app)/log/_components/ManualEntryFallback.tsx" "tests/components/log-flow/ManualEntryFallback.test.tsx"`
  - Result: passed after formatting the updated test.
- `pnpm exec eslint "app/(app)/log/_components/ManualEntryFallback.tsx" "tests/components/log-flow/ManualEntryFallback.test.tsx"`
  - Result: passed.
- `pnpm typecheck`
  - Result: passed after the nav test type blocker was resolved by the nav worker.

## Mobile / UI Verification
- Component-level mobile verification is covered by mocking `useIsMobile()` and asserting the wheel trigger, bottom sheet, wheel option selection, DONE commit, and submit payload.
- Static CSS uses one-column mobile layout, `min-width: 0`, `overflow-x: hidden`, wrapping chips, and 44px minimum controls to avoid phone-width overlap.

## Risks / Notes
- No Playwright browser screenshot was run in this worker pass; verification is component-level plus static responsive CSS review.
- Superseded: the earlier Round 1 follow-up `pnpm typecheck` blocker in `nav-shell.test.tsx` was resolved by the nav worker; the nested-form fix worker reran `pnpm typecheck` and it passed.
- Manual recovery now sends `confidence: 0.85` via `needsReview`; downstream confirmation already supports confidence values.
- Other worker-owned Bug 1 files were present in the working tree and were left untouched.
