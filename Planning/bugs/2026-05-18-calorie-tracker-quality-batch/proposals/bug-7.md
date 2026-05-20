# Bug 7: New food log date/time must not allow future date/time
## Classification
known_fix

## Root Cause
The backend already rejects `logged_at` more than 5 minutes in the future, but the agreed contract is stricter: save should reject future timestamps with only tiny backend clock-skew tolerance if needed. On the client, `TimeEditor` currently sets `max` to mount-time now and silently ignores future `onChange` values, so users can get no red validation text when they attempt a future timestamp. Existing i18n already includes `confirmationFutureTimeError`, but the TimeEditor hint uses only the generic 30-day `outsideWindow` copy.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\Confirmation\TimeEditor.tsx`
  - Track/select a specific future-time validation state instead of silently returning without user feedback.
  - Render `t.log.confirmationFutureTimeError` as red helper text when the chosen local datetime is after the current max.
  - Keep the existing 30-day past-window message for too-old timestamps.
  - Consider refreshing `max` at validation time or recomputing on render so the input does not become stale during a longer modal session.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
  - Add a save guard that refuses to submit when `state.loggedAt` is in the future beyond the same tiny client tolerance and dispatches the future-time error.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts`
  - Reduce `FUTURE_SKEW_MS` from 5 minutes to a tiny tolerance, or zero if product wants no tolerance. Keep the guard before idempotency SELECT as currently documented.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
  - Add/adjust UI tests for red future validation text and no save request.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts`
  - Update API tolerance coverage from 5 minutes to the new tiny skew contract.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\Confirmation\TimeEditor.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts`

## TDD Required
yes - validation and API rejection behavior must be pinned.

## Test Approach
- Component test: selecting/typing a future datetime shows `Choose a time that is not in the future.`, marks the input invalid, and does not call `/api/entries/save` when Save is clicked.
- Component test: valid current/past timestamps still save.
- API test: `Date.now() + tiny_tolerance + 1ms` returns `400 { error: 'logged_at_future' }` with no insert.
- API test: `Date.now() + tiny_tolerance - 1ms` remains accepted only if a nonzero tolerance is retained.

## Risk Assessment
medium - touches client validation and the server idempotent writer; the main risk is rejecting legitimate retries if tolerance/guard placement is changed incorrectly.

## Regression Sweep Needed
- ConfirmationScreen save flow.
- Copy-yesterday pending log date path.
- Existing `logged_at_too_old` backfill tests.
- Duplicate log detection, because it consumes `logged_at`.

## UI Touching
true - `Confirmation/TimeEditor` validation state and save blocking.

## Open Questions
Confirm the exact backend tolerance before implementation. Recommendation: 30 seconds maximum; the current 5 minutes is too loose for the stated agreement.
