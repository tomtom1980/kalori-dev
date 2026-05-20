# Bug 2: Replace native duplicate-food confirmation with in-app popup
## Classification
known_fix

## Root Cause
The duplicate-food server checks are already in place, but the client confirmation paths still call `window.confirm()` after receiving `duplicate_food_entry`/duplicate log errors. This appears in the log confirmation save flow, library card quick-log flow, and food detail quick-log flow, so the user sees a browser-native prompt instead of Kalori's Ledger-styled modal surface. This drifts from the existing UI prescription: `planning/ui-design.md` specifies modal confirmations as Radix-backed, zero-radius Ledger cards with `bg-0`/`rule-strong`, safe default focus on cancel, and 180ms modal open/close motion; the web UI guide recommends Radix/shadcn-style primitives as the app foundation rather than browser-native blocking UI.

## Proposed Change (Diff Outline)
- Add a small shared duplicate-log confirmation dialog component/hook that uses `@radix-ui/react-alert-dialog`, the existing `kalori-library-dialog-*`, `kalori-library-btn-ghost`, and `kalori-library-pill` classes, and no new CSS.
- In `ConfirmationScreen.tsx`, replace the synchronous `window.confirm()` branch with the shared in-app confirmation request; on confirm, retry the same `/api/entries/save` request with `allow_duplicate: true`; on cancel, keep the existing cancelled save message behavior.
- In `LibraryClient.tsx`, replace the quick-log duplicate `window.confirm()` branch with the same dialog; on confirm, retry `/api/library/[id]/log-now` with the original payload plus `allow_duplicate: true`; on cancel, close or clear the pending quick-log state as it does today.
- In `FoodDetail.tsx`, replace the food-detail duplicate `window.confirm()` branch with the same dialog; preserve the existing `pendingClientIdRef` behavior so the confirmed retry uses the same semantic log attempt plus `allow_duplicate: true`.
- Add one focused component/integration test file that asserts the duplicate dialog renders in-app, `window.confirm` is not called, cancel does not retry, and confirm retries with `allow_duplicate: true`.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\DuplicateLogConfirmDialog.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryClient.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\FoodDetail\FoodDetail.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\duplicate-log-confirmation.test.tsx`

## TDD Required
yes - this changes async duplicate-save control flow, not only presentation. Tests should lock the cancel/confirm branches and ensure the browser-native confirm is gone.

## Test Approach
- Add a failing test for the log confirmation save path: mock the first save response as `409 { error: "duplicate_food_entry" }`, assert an in-app alert dialog appears, assert `window.confirm` is not called, click confirm, and assert the second request includes `allow_duplicate: true`.
- Add a failing test for the library quick-log duplicate path: mock `authPost` to reject with the duplicate payload/error shape, assert the duplicate dialog appears after selecting a meal, cancel once with no retry, then confirm in a second run and assert retry payload includes `allow_duplicate: true`.
- Add a failing test for the food detail quick-log duplicate path with the same cancel/confirm assertions, including preservation of the original `client_id` on the confirmed retry.
- Run the targeted component tests plus the existing log-flow and library component suites covering these files.

## Risk Assessment
medium - the server behavior is unchanged, but the fix spans three user-entry surfaces and must preserve each surface's pending/error state and idempotency key handling.

## Regression Sweep Needed
- Log flow confirmation save from text/photo/library tabs.
- Library card quick-log meal picker.
- Food detail `LOG THIS NOW` meal picker.
- Duplicate-log API handling for `/api/entries/save` and `/api/library/[id]/log-now`.
- Keyboard/focus behavior for nested dialogs inside the log modal and library/food-detail surfaces.

## UI Touching
true - duplicate-food confirmation dialog/popup across `ConfirmationScreen`, `LibraryClient` quick-log, and `FoodDetail` quick-log. The proposed UI uses existing Radix alert-dialog/modal conventions and Ledger modal classes.

## Open Questions
None.
