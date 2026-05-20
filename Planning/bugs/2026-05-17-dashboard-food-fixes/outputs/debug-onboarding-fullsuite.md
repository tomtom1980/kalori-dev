# Debug Report: Onboarding Full-Suite Failure

Batch: `2026-05-17-dashboard-food-fixes`
Target: `tests/components/onboarding/WizardShell.phase3.test.tsx`

## Result

Fixed.

## Reproduction

Command:

```powershell
pnpm vitest run tests/components/onboarding/WizardShell.phase3.test.tsx --reporter=verbose
```

Observed failure:

- The test `moves focus to the next step first interactive element after Next advances` failed in isolation.
- The rendered DOM showed `currentStep === 2` with `STEP 02 · BIRTHDAY`, a `BIRTHDAY` label, and `#birthday-input`.
- The failing assertion searched for `t.onboarding.ageLabel` (`AGE`), which no longer exists as the Step 2 visible field.

Because the failure reproduced in isolation, this was not a full-suite order/global-state leak.

## Root Cause

Stale test expectation.

`WizardShell` still focuses the first interactive element after advancing to Step 2. The Step 2 component is now `StepAge`, but it renders a birthday date input and derives age from that birthday. The dedicated `StepAge` tests already assert `t.onboarding.birthdayLabel`; this phase-3 regression test still expected the old `AGE` input label.

Evidence checked:

- `app/(app)/onboarding/_components/WizardShell.tsx` maps Step 2 to `StepAge`.
- `app/(app)/onboarding/_components/StepAge.tsx` renders `t.onboarding.birthdayLabel`.
- `tests/components/onboarding/StepAge.test.tsx` expects `t.onboarding.birthdayLabel`.

## Fix

Updated only `tests/components/onboarding/WizardShell.phase3.test.tsx` so the focus-transfer assertion checks the current Step 2 first interactive control:

- Before: `screen.getByLabelText(t.onboarding.ageLabel)`
- After: `screen.getByLabelText(t.onboarding.birthdayLabel)`

No production code was changed.

## Verification

Passed:

```powershell
pnpm vitest run tests/components/onboarding/WizardShell.phase3.test.tsx --reporter=verbose
```

Result: 1 file, 4 tests passed.

Passed:

```powershell
pnpm vitest run tests/components/onboarding --reporter=verbose
```

Result: 13 files, 50 tests passed.

