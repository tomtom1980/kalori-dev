# Bug 2: Mobile manual fallback editor is cramped and underpowered

## Classification
known_fix

## Root Cause
The broken mobile surface is `ManualEntryFallback`, not the shared confirmation editor. `SnapTab` sets `failureMode` when vision fails, mounts `ManualEntryFallback` inline, then `LogFlowTabs` converts that payload into a single manual `ParsedItemT`. The fallback form is a separate three-field layout with inline styles, grams-only copy, no unit selector, no portion presets, no macro options, and only a retry link plus submit button; on a phone this feels like a raw recovery form instead of the existing log-flow editor.

This also drifts from the project UI prescription. `Planning/ui-design.md` says the log modal is full-screen on mobile, Snap failures must keep the photo and offer manual recovery, and mobile portion editing should use the existing `MobileWheelPicker` / `MobileWheelSheet` pattern with 44px+ touch targets and explicit DONE semantics. The web guide Quick-Pick table points dynamic form/list surfaces toward existing accessible primitives; this fix should reuse the existing Radix-backed wheel sheet and native labeled form controls, not add a new dependency.

## Proposed Change (Diff Outline)
- `app/(app)/log/_components/ManualEntryFallback.tsx`
  - Replace the raw inline recovery block with a mobile-safe fallback card using CSS classes, stable vertical spacing, and the retained photo thumbnail at a predictable size.
  - Add a short needs-review message for snap failures: the photo was kept, AI could not confidently extract food data, and the user can retry or file manually.
  - Split manual food data into clear groups:
    - food name text input;
    - serving quantity input plus serving unit segmented/radio control (`g`, `serving`, `piece`, `bowl`, `cup`);
    - quick portion chips/presets (`50g`, `100g`, `150g`, `250g` when unit is grams; `1`, `2`, `3` for count-style units);
    - required calories;
    - optional macro fields behind an existing accessible disclosure/collapsible: protein, carbs, fat, fiber.
  - On mobile, use `MobileWheelSheet` + `MobileWheelPicker` for the primary portion picker where practical; desktop can keep direct inputs.
  - Keep retry and manual-save actions clear and separated: `TRY PHOTO AGAIN` secondary, `SAVE MANUALLY` primary.
  - Preserve validation behavior: inline errors, `aria-invalid`, `aria-errormessage`, summary alert, and focus to the first invalid field.
- `app/(app)/log/_components/LogFlowTabs.tsx`
  - Expand `ManualSubmitPayload` mapping so manual items preserve `unit`, optional macros, and a `confidence`/needs-review signal instead of always forcing `unit: 'g'` and zero macros.
  - Keep the existing confirmation takeover after manual submit; the confirmation screen remains the final review/save step.
- `lib/i18n/en.ts`
  - Add copy for snap needs-review, unit labels, portion presets, optional macros, and revised button labels.
  - Avoid changing unrelated log-flow strings.
- `app/globals.css`
  - Add scoped `kalori-manual-fallback-*` classes for the fallback shell, photo preview, grouped fields, segmented unit controls, preset chips, optional macro grid, and action row.
  - Mobile rules should force one-column layout, 44px minimum controls, no horizontal overflow, and safe spacing inside the log modal.
- `tests/components/log-flow/ManualEntryFallback.test.tsx`
  - Extend current tests to cover the richer fallback controls and payload without adding a new test file.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ManualEntryFallback.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\LogFlowTabs.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\ManualEntryFallback.test.tsx`

## TDD Required
yes — this changes form validation, payload shape, responsive UI behavior, and the manual-submit path into confirmation.

## Test Approach
- Update `ManualEntryFallback.test.tsx` to assert snap fallback renders the retained photo plus needs-review messaging.
- Add tests that unit selection and preset chips update the submitted payload.
- Add tests that optional macros are hidden by default, can be opened with an accessible control, and are included when entered.
- Add validation tests for missing name, invalid quantity, invalid calories, and focus movement to the first invalid control.
- Add a mobile-mode test by mocking `useIsMobile()` to verify the portion wheel trigger/sheet path appears and the raw controls do not overlap.
- Keep existing LogFlowTabs/manual submit behavior covered by asserting the manual payload still enters confirmation with the expected name, portion, unit, kcal, and optional macros.

## Risk Assessment
medium — the fix is scoped to the fallback/manual path, but it changes a shared payload type and the confirmation seed data for manual entries.

## Regression Sweep Needed
- Snap failure fallback after Gemini returns `{ fallback: true }`.
- Snap failure fallback after network/Zod/timeout errors.
- Type-tab manual fallback, because the same component is reused there.
- Manual submit into `ConfirmationScreen`.
- Confirmation save for `source: 'manual'`.
- Mobile viewport layout at 375px and 430px widths.
- Keyboard and screen-reader form navigation.

## UI Touching
true — `ManualEntryFallback` inside the log-flow modal on mobile. The proposal follows `Planning/ui-design.md` log-flow rules: mobile full-screen modal, Snap fallback recovery with retained thumbnail, existing `MobileWheelPicker` / `MobileWheelSheet` for mobile portion selection, and 44px+ touch targets.

## Open Questions
None blocking. I would keep calories required for this bugfix so the downstream save path remains unchanged, and make macros optional so users can add better data without being forced into a full nutrition editor.
