# Bug 7: New food log date/time must not allow future date/time

## Status
implemented

## Files Touched
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx`
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/api/entries/save/route.ts`
- `app/api/library/[id]/log-now/route.ts`
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx`
- `tests/unit/api/entries-save.test.ts`
- `tests/integration/entries-save-30day-window.test.ts`
- `tests/integration/library-log-now-30day-window.test.ts`

## Tests Added/Updated
- `tests/unit/components/log-flow/ConfirmationScreen.test.tsx::blocks a future logged_at client-side with red validation text and no save request`
- `tests/unit/api/entries-save.test.ts::rejects logged_at beyond clock-skew tolerance of now`
- Updated API tolerance coverage enforces the approved 30-second max skew contract.
- `tests/unit/log/confirmation-time-editor.test.tsx::clamps max to now and blocks forced future changes`
- `tests/integration/entries-save-30day-window.test.ts::future-skew-over-30-seconds-still-rejected`
- `tests/integration/entries-save-30day-window.test.ts::within-30-second-future-skew still accepted`
- `tests/integration/library-log-now-30day-window.test.ts::future-skew-over-30-seconds-still-rejected`

## Verification
- `pnpm vitest run --pool threads --maxWorkers 1 tests/components/log-flow/SnapTab.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/api/entries-save.test.ts tests/unit/ai/portion-sanity.test.ts tests/unit/lib/ai/prompts-approx-grams.test.ts` passed.
- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/api/entries-save.test.ts tests/unit/log/confirmation-time-editor.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/integration/entries-save-30day-window.test.ts tests/integration/library-log-now-30day-window.test.ts`
  - `5 passed`, `111 passed`.
- PASS: `pnpm typecheck`
- PASS: `pnpm lint`
  - Existing warnings only: `42 warnings`, `0 errors`.

## Notes
Future datetime input now surfaces the existing red validation copy and save is blocked client-side. The save route and library log-now parity route reject timestamps beyond the approved 30-second clock-skew tolerance.

## Phase 7 regression note
- `Confirmation.TimeEditor` now ignores forced future input changes instead of dispatching them into confirmation state.
- Corrective worker note: the Phase 7 regression fix restored the old 5-minute tolerance in error. The approved Bug 7 contract is max 30 seconds, now enforced in `app/api/entries/save/route.ts` and the parity `app/api/library/[id]/log-now/route.ts`.

## Recovery Review-Fix Addendum - 2026-05-18T23:05:35+07:00

- Confirmed the stale `TimeEditor` comment now references the approved 30-second grace buffer, not the old 2-minute buffer.
- Focused verification passed: `pnpm test tests/unit/log/confirmation-time-editor.test.tsx -- --reporter=verbose`.
