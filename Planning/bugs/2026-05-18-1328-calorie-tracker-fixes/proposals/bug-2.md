# Bug 2: Food logging date/time selector allows future selections
## Classification
known_fix

## Root Cause
The food confirmation TimeEditor uses a native `datetime-local` input, but its UI `max` is computed as `nowAtMount + 5 minutes`, mirroring the server clock-skew tolerance instead of the user-facing rule. That makes the picker allow near-future date/time values even though the requested behavior is to prevent future date/time selection based on the current time. The server routes already reject timestamps farther than the 5-minute skew window with `logged_at_future`, but the confirmation save path currently surfaces generic `400` errors instead of a date/time-specific message if a crafted or stale client still submits a future value.

UI pattern alignment: `Planning/ui-design.md` prescribes native date/time controls for Confirmation TimeEditor (`datetime-local` on desktop/tablet; native date plus wheel-style time behavior on mobile guidance) and visible labeled inputs. The web UI guide Quick-Pick table does not require an animation library for native form validation; keep the existing native control and Ledger styling.

## Proposed Change (Diff Outline)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\Confirmation\TimeEditor.tsx`
  - Change the UI future bound from `nowAtMount + FUTURE_SKEW_MS` to current mount time (`nowAtMount`) for the input `max`.
  - Keep the 30-day minimum logic and server skew comments distinct: UI blocks future selection; server keeps tolerance for clock drift/crafted requests.
  - In `onChange`, ignore/revert parsed values greater than the current UI max so programmatic changes cannot push reducer state into the future.
  - Update helper text/error wording to mention both future and 30-day bounds.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
  - When `/api/entries/save` returns `{ error: 'logged_at_future' }`, show a specific date/time message instead of generic `400`.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
  - Add or reuse a concise user-facing string such as "Pick a time that is not in the future."
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`
  - Add focused component tests for the TimeEditor `max` and future-change guard.

No server route change is proposed because both `app/api/entries/save/route.ts` and `app/api/library/[id]/log-now/route.ts` already reject far-future `logged_at` with `logged_at_future`, and existing tests intentionally preserve the 5-minute server tolerance.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\Confirmation\TimeEditor.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx`

## TDD Required
yes - this is validation/control-flow logic around date/time bounds and error handling.

## Test Approach
- Add a RED component test that freezes time, renders `ConfirmationScreen`, and asserts `confirmation-time-editor-input.max` equals the current local minute rather than a future minute.
- Add a RED component test that tries to change the TimeEditor to a future local datetime and asserts the controlled input/reducer does not accept that future value.
- Add or extend a save-path test that mocks `/api/entries/save` returning `400 { error: 'logged_at_future' }` and asserts the confirmation error banner shows the date/time-specific message.
- Keep existing API tests that allow near-future timestamps within server clock-skew tolerance unchanged; they cover defense-in-depth, not picker behavior.

## Risk Assessment
low - scoped to the confirmation TimeEditor and save error text; server persistence rules already exist and remain unchanged.

## Regression Sweep Needed
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`
- `tests/integration/entries-save-30day-window.test.ts`
- `tests/integration/library-log-now-30day-window.test.ts`
- `tests/e2e/web/user-stories/US-STAB-C5.spec.ts` if Phase 7 UI/E2E is run for this batch

## UI Touching
true - `Confirmation.TimeEditor` in the food logging confirmation modal.

## Open Questions
None before implementation. The proposal assumes the product rule is strict at the UI layer (`max <= current time`) while preserving the server's existing 5-minute skew tolerance for clock drift and crafted requests.
