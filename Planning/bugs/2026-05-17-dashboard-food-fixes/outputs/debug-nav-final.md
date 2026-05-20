# Final Nav Robustness Debug

## Root Cause

The remaining full-suite-only failures in `tests/components/nav/nav-shell.test.tsx` were test isolation failures, not product behavior regressions. Earlier suites can leave async work, timer mode, Radix body globals, or queued mock state behind. The water-FAB tests queued one-shot `authPostMock` responses before the click and some assertions read the undo toast stack after fixed microtask drains, which let stale async work consume the queued response or leave the optimistic `"250 ml logged"` toast visible during the assertion.

## Changed Files

- `tests/components/nav/nav-shell.test.tsx`

## Fix

- Force real timers in the nav spec setup/teardown.
- Reset undo-toast timers and water mutation state before fragile water-FAB actions.
- Reset and reinstall the local `authFetch` wrapper immediately before water actions, then queue that action's desired `authPostMock` response.
- Wait for replacement toasts by description/content instead of depending on a fixed number of microtasks or `stack[0]` timing.

No product source files were changed.

## Verification

- `pnpm vitest run tests/components/nav/nav-shell.test.tsx --reporter=verbose`
  - Passed: 1 file, 30 tests.
- `pnpm test -- --reporter verbose`
  - Passed: full Vitest suite.

## Notes

The first full-suite attempt after the initial timing-only change still reproduced nav failures, confirming the issue was also queued mock leakage. After moving the mock reset/reinstall immediately before each water action and queuing the response after that reset, the full suite passed.
