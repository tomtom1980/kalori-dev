# Bug 2: Missing loading states for high-confidence async user actions

## Classification
needs_debug_shallow

## Root Cause
Most expensive actions already expose loading states: export modal, account delete, AI text parse, photo analyze/compress, confirmation save, water add/edit, weight quick-add, sketch backfill, library detail save/delete/log-now, and bulk delete all have pending state, disabled gates, `aria-busy`, labels, or skeleton/status cues. The remaining high-confidence gaps are narrower: some actions already track pending state but do not surface it visibly or semantically, and progress range navigation uses App Router replacement without a transition cue. The web-ui-guide Quick-Pick/performance guidance supports CSS-first micro-interactions and loading cues for this level of UI; use existing CSS/Tailwind/Radix patterns, `aria-busy`, text swaps, and `motion-reduce:`/reduced-motion-compatible CSS rather than new animation libraries.

STOP FLAG: proposed implementation touches more than five files once tests are included. This is a broad audit bug by design; implementation should be approved as a small batch, or split into sub-bugs by surface.

## Proposed Change (Diff Outline)
- `app/(app)/progress/_components/ProgressRangeToolbar.tsx`
  - Wrap `router.replace` calls in `useTransition`.
  - Track the pending range target and expose a pending cue on the active/target chip with `aria-busy`, `aria-disabled`, `data-pending`, and a subtle CSS-first opacity/text cue.
  - Keep anchor href fallback and `scroll: false`.
- `app/(app)/log/copy-yesterday/_components/CopyYesterdayModal.tsx`
  - The component already has `submitting`; extend it to visible and semantic feedback.
  - Add `aria-busy` to the confirm button or form region, prevent click activation during submit, disable or ignore selection changes while submitting, and swap the CTA label to an existing loading/saving string or a new specific copy string.
- `app/(app)/library/_components/BulkActionsBar.tsx`
  - Accept a `bulkLogInFlight`/`busy` prop.
  - Mark the bar or LOG button busy while selected items are being logged, disable conflicting LOG/DELETE/CANCEL buttons, and expose a text swap such as logging.
- `app/(app)/library/_components/LibraryClient.tsx`
  - Pass bulk-log in-flight state into `BulkActionsBar`.
  - Disable/mark the bulk-log meal picker buttons while `bulkLogInFlight` is true.
  - Add `aria-busy` and a real loading label to `QuickLogMealDialog` while `quickLogInFlight` is true; it currently disables buttons but gives no busy semantics.
  - Add `aria-busy`/label swap to the Add Item quota check button while `addQuotaChecking` is true; it currently disables the button but keeps static text.
- `lib/i18n/en.ts`
  - Add only missing copy keys needed for specific loading labels if no existing string fits. Prefer reusing existing strings where suitable.
- CSS location used by existing components, likely `app/globals.css`
  - Add minimal CSS-first pending styles only if current classes cannot express the cue. Use opacity/text indicator and existing spinner class conventions; ensure reduced-motion mode does not rely on continuous animation.

Explicitly not proposed:
- Do not redesign loading UI globally.
- Do not add loading states to speculative/non-processing interactions like opening local menus, sorting/filtering client lists, or selecting checkboxes unless they are disabled only while an actual submit is pending.
- Do not change already-covered export/account-delete/AI/photo/weight/water/confirmation-save flows except if a test exposes a regression.
- Import flows were not found as a live user-triggered import surface in the relevant app files; no import loading fix is proposed unless a hidden import route/component is identified.

## Files Affected
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\ProgressRangeToolbar.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\copy-yesterday\_components\CopyYesterdayModal.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\BulkActionsBar.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryClient.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\CopyYesterdayModal.test.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\LibraryClient.quick-actions.test.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\BulkActionsBar.test.tsx`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx`

## TDD Required
yes - this touches async control flow, disabled gates, router transitions, and accessibility semantics.

## Test Approach
- Add or extend component tests before implementation:
  - `ProgressRangeToolbar`: clicking a different range sets a pending cue and calls `router.replace` with the correct URL.
  - `CopyYesterdayModal`: with `authPost` unresolved, confirm shows busy/loading text, exposes `aria-busy`, and cannot double-submit.
  - `BulkActionsBar`/`LibraryClient`: bulk log in-flight disables LOG/DELETE/CANCEL or meal choices as applicable and exposes busy semantics.
  - `LibraryClient.quick-actions`: quick-log dialog meal buttons expose busy/loading state while the log request is unresolved; duplicate-confirm path still works.
  - Add Item quota check: unresolved quota request disables and marks the add button busy.
- Run focused Vitest component suites for the affected files.
- Run a reduced-motion or CSS assertion only if new animation classes are added.

## Risk Assessment
medium - the individual changes are small, but the audit spans multiple interactive surfaces and could affect keyboard flow if disabling is applied too broadly.

## Regression Sweep Needed
- Progress page D/W/M range changes, including keyboard arrow activation.
- Copy Yesterday selection, cancel/discard, submit success/failure.
- Library Add Item quota path and opening log flow.
- Library bulk log, bulk delete, cancel selection mode, duplicate-log confirm.
- Library card quick-log success, duplicate confirm, failure toast.
- Existing loading-state flows to ensure no duplicate spinners/regressions: export modal, account delete, AI parse, photo snap, water, weight, confirmation save.

## UI Touching
true - progress range chips, copy-yesterday submit CTA, library bulk actions, library add button, and quick-log dialog. Use CSS-first reduced-motion-compatible cues; no new animation dependency.

## Open Questions
- Should the broader loading-state implementation be split into separate sub-bugs to avoid the bugfix-tomi `>5 files` stop condition?
- Which copy should be used for new labels: reuse existing generic saving/loading strings, or add explicit labels such as `Logging...`, `Checking...`, and `Copying...`?
