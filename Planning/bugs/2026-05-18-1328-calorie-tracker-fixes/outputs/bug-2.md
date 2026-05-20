# Bug 2 Output: Future time selection blocked in confirmation

## Files Changed
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `lib/i18n/en.ts`

## Tests Added / Modified
- `tests/unit/log/confirmation-time-editor.test.tsx`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`

## Commands Run
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/log/confirmation-time-editor.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx` -> 2 files / 59 tests passed.
- PASS: full focused batch Vitest command -> 21 files / 314 tests passed.
- PASS: `pnpm typecheck`.
- PASS: focused `pnpm exec eslint ...`.

## Implementation Notes
- TimeEditor now sets the native `datetime-local` max to mount-time current time instead of server skew time.
- Forced future change events are ignored before dispatching `setLoggedAt`.
- `/api/entries/save` responses with `error: logged_at_future` now surface a specific confirmation error message.

## Residual Risk
- Server-side five-minute skew tolerance remains intact for request-level clock drift. The UI intentionally uses the stricter user-facing current-time bound.
