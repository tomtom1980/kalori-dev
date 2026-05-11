# Codex R1 Fix — C2 (LibraryTab wheel sheet rendering + false-green test)

## Finding addressed
**C2 — LibraryTab.tsx:524-528** Mobile `wheelOpenForId` state is set but never consumed — no `MobileWheelSheet` rendered → Library quantity editing was completely broken on mobile (desktop number input is hidden when `useIsMobile` is true). The pre-existing integration test only asserted the trigger `data-testid` existed; it never tapped the trigger or asserted the sheet/listbox rendered, so the regression went undetected.

## Investigation
Root cause: Bug 4's mobile wheel migration in `LibraryTab.tsx` introduced the `isMobile` branch + `wheelOpenForId` / `wheelDraft` state + `setQuantityNumber` + the trigger button — but never rendered the actual `<MobileWheelSheet>` consumer. `useState<string | null>(null)` was being toggled on tap, but no JSX was reading the state. Net effect on real mobile: tap quantity → state changes → nothing visible → quantity remains stuck at default 1, with no way to edit it (the desktop `<input type="number">` at lines 547-566 is gated behind `!isMobile`).

The canonical mobile-wheel consumer pattern was already in place in `ConfirmationScreen.tsx` (lines 670-731) — render `<MobileWheelSheet>` once, gated by an `open` state, with `onCommit` wired to the form-state mutator. LibraryTab just had to mirror that pattern using `wheelOpenForId !== null` as the open gate and `setQuantityNumber(activeItem.id, value)` as the commit path.

The pre-existing test was a textbook false-green: `expect(screen.getByTestId('library-quantity-wheel-trigger-a')).toBeInTheDocument()` — that's a presence assertion on a button that goes nowhere. Tapping the button produced no observable change anywhere in the DOM.

## Fix Approach
- Rendered `<MobileWheelSheet>` at the LibraryTab component root (after the list, before the sticky CTA), gated by `isMobile && wheelOpenForId !== null`. One sheet per component — only one wheel is open at a time; the row id selects the active selection entry.
- Wrapped in an IIFE so we can resolve `activeItem` from `wheelOpenForId` once and bail cleanly if the id no longer matches a hydrated item (race against deselect / store mutation).
- `onDone` calls `setQuantityNumber(activeItem.id, wheelDraft)` (existing mutator) then closes — matches Bug 4's `selection` shape exactly.
- `onCancel` (sheet outside-click + Cancel button + Escape) closes without committing — matches the §10.6.1 contract.
- Inner `<MobileWheelPicker>` `onCommit` mirrors `onDone` so Enter on the wheel commits without an extra DONE click.
- Added i18n key `libraryQuantityWheelLabel: 'Quantity'` so the sheet title and listbox `ariaLabel` follow the same labeling convention as `confirmationPortionStepperLabel`.

## Test Strengthening
**Old assertion (false-green):**
```ts
expect(screen.getByTestId('library-quantity-wheel-trigger-a')).toBeInTheDocument();
expect(screen.queryByTestId('library-quantity-a')).toBeNull();
```
That's `trigger exists, desktop input absent` — a no-op behaviorally.

**New assertions (end-to-end, two new tests):**
1. **Commit flow** — select card → assert no dialog yet → tap trigger → assert `getByRole('dialog')` and `getByRole('listbox')` (label matches `/quantity/i`) → focus listbox → ArrowDown ×3 → click DONE → assert dialog gone, assert `useLogFlowStore.getState().librarySelection === [{ itemId: 'a', quantity: 1.75 }]`, assert trigger label updated.
2. **Cancel flow** — select card → tap trigger → ArrowDown ×2 → click Cancel → assert dialog gone, assert quantity unchanged (still 1).

The `1 → 1.75` math: snapped initial wheel value = 1, options run 0.25–10 step 0.25, index of 1 = 3, +3 ArrowDowns = index 6 = value 1.75.

**Failing-then-green sequence verified:**
- BEFORE fix: 5 tests pass / 2 tests fail. Both new tests fail at `screen.findByRole('dialog')` — exactly the right reason (no Sheet rendered).
- AFTER fix: 7 tests pass / 0 fail.

## Files Touched
- `app/(app)/log/_components/LibraryTab.tsx` — added the `MobileWheelSheet` render block at component root.
- `tests/integration/mobile-wheel-picker-consumers.test.tsx` — added two strengthened tests (commit + cancel flows).
- `lib/i18n/en.ts` — added `libraryQuantityWheelLabel: 'Quantity'` (one new key alongside the existing library quantity strings).

## Test Run Result
- **Strengthened test (`mobile-wheel-picker-consumers.test.tsx`):** 7/7 passing after fix; 5/7 → 7/7 fail-then-green sequence verified.
- **LibraryTab regression sweep (9 files):** 75/75 passing.
  - `tests/components/log-flow/LibraryTab.test.tsx`
  - `tests/components/log-flow/library-tab-self-hydrate.test.tsx`
  - `tests/components/log-flow/library-tab-preselect.test.tsx`
  - `tests/components/library-tab-hydration.test.tsx`
  - `tests/components/library-tab-continue-cta.test.tsx`
  - `tests/integration/log-flow-fallback.test.tsx`
  - `tests/unit/api/library-list.test.ts`
  - `tests/unit/api/entries-save.test.ts` (validates downstream quantity-update payload contract)
  - `tests/unit/library/to-log-library-item.test.ts`
- **Type-check (`tsc --noEmit`):** clean.
- **Lint (`eslint` on touched files):** clean.

## False-positive Check
Not a false positive — Codex finding confirmed via test-driven reproduction. Before the fix, the new commit-flow test failed at `findByRole('dialog')` because no Sheet was being rendered. The user-visible regression is real: on a mobile viewport the desktop `<input type="number">` is hidden and the trigger button does nothing, leaving Library quantity locked at the default 1 with no path to edit it.

## Open Concerns for Round 2
None. The fix is consumer-side wiring only — no changes to `MobileWheelSheet` or `MobileWheelPicker` primitives. The `library_item_id` round-trip path that already passes `selection.quantity` through to the save endpoint (verified by `entries-save.test.ts` still green) was untouched. One stylistic note: the IIFE pattern (`{(() => { ... })()}`) was used for clarity in resolving `activeItem` from `wheelOpenForId`; could be extracted to a named helper if the pattern proliferates, but for a single sheet that's premature.
