# Round 1 fixes — components/dashboard/WaterTracker.tsx

## I2 — Save disabled until interaction
- Option chosen: **A** ("any interaction enables Save"), with a small additive
  primitive change to `MobileWheelSheet` so the mobile branch can honor the
  same disabled semantic.
- Change description:
  Added `hasUserInteracted` state in `WaterTracker.tsx`, reset to `false` on
  every popover/sheet open-edge (via the existing `prevEditOpen` discriminator).
  The desktop `<input>`'s `onChange` and the mobile `<MobileWheelPicker>`'s
  `onChange` flip the flag to `true`. The desktop Save button gets `disabled`
  + `aria-disabled` bound to `!hasUserInteracted`. For the mobile branch,
  added an optional `doneDisabled?: boolean` prop to `MobileWheelSheet`
  (defaults to `false`) which natively disables the Done button + sets
  `aria-disabled`. The mobile sheet's `onDone` and the wheel's `onCommit`
  are also short-circuited when not interacted, defending against keyboard
  Enter on a no-touch wheel.
- Tests added: 5 (`tests/unit/components/dashboard/WaterTracker.test.tsx`,
  new describe block `Codex round 1 I2 — Save disabled until user interaction`)
  - desktop off-step (4775) — Save disabled, click is no-op, no POST
  - desktop interaction enables Save — POSTs delta=25 (4800−4775)
  - desktop on-step (4800) — consistent semantic (also disabled)
  - desktop close+reopen — interaction flag resets
  - mobile off-step (4775) — Save disabled until wheel-row click
- Test results before/after: 5 RED → 32/32 GREEN

## Re-run results
- `npx vitest run tests/unit/components/dashboard/WaterTracker.test.tsx` → **32 passed**
- TypeScript: clean for changed files (`WaterTracker.tsx`, `MobileWheelSheet.tsx`,
  test file). Pre-existing TS errors in `tests/unit/api/water-log.test.ts` are
  from a parallel sub-agent's atomic-RPC work — not from this fix.
- ESLint: clean (exit 0)
- Sibling primitive consumers regression check: `ConfirmationScreen.test.tsx`
  → 22/22 passed (default `doneDisabled = false` keeps existing callers
  unchanged). `MobileWheelPicker.test.tsx` → 24/24 passed.

## a11y
- Desktop Save: `disabled` (HTML attribute) + explicit `aria-disabled`
  attribute toggling between `'true'` / `'false'`. Cursor switches to
  `not-allowed` and opacity drops to 0.55 for visual affordance.
- Mobile Save (Done button in `MobileWheelSheet`): same — native `disabled`
  + `aria-disabled` set explicitly so SR users get a deterministic state
  even before the Radix focus-trap settles. Cursor + opacity match.
- `aria-disabled` is set explicitly (`'true'`/`'false'` literal strings)
  rather than relying on the browser's implicit promotion of `disabled` →
  `aria-disabled`, because the Codex finding asks for an observable
  semantic.

## False positives
None — the I2 finding accurately describes the silent-write bug. The fix
is correct and surgical.

## Stop-the-world
None. The `MobileWheelSheet` `doneDisabled` addition is strictly additive
(default `false`) and existing callers (`ConfirmationScreen.tsx`) are
unaffected.
