# Targeted Failure Worker B: nav-shell top bar kicker

## Failure
`tests/components/nav/nav-shell.test.tsx` previously expected the top bar text for `/dashboard` and other known routes to include route-specific kicker copy. In the current UI, the rendered top bar text is the stable brand strip, e.g. `Kalori`, with the decorative mark hidden from assistive text.

## Diagnosis
This was a stale test expectation, not a source regression. `components/nav/top-app-bar.tsx` currently renders the Kalori brand and profile menu; it accepts the legacy `sectionKicker` prop through `NavShell`, but no longer displays the route kicker. The directly focused `<TopAppBar />` test also asserts the brand contract.

## Fix
Updated the nav-shell assertion to verify the stable brand top bar across primary destinations, `/log`, and unknown fallback routes instead of expecting route-specific kicker text.

## Changed Paths
- `tests/components/nav/nav-shell.test.tsx`
- `planning/.tmp/bugfix-2026-05-17-dashboard-food-fixes/outputs/test-fix-navshell.md`

## Verification
- `pnpm vitest run tests/components/nav/nav-shell.test.tsx` passed: 30 tests.
- `pnpm vitest run tests/components/nav/top-app-bar.test.tsx tests/components/nav/bottom-tab-bar.test.tsx tests/components/nav/sidebar.test.tsx tests/components/nav/nav-shell.test.tsx` passed: 55 tests.
- `pnpm vitest run tests/integration/dashboard-a11y.test.tsx` passed: 15 tests.
