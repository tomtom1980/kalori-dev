# Codex Round 1 Auto-Fix — Test File

## Finding addressed
I-1: Test geometry assertion gap. Existing tests asserted `opacity:0`,
`pointer-events:auto`, and wrapper `min-width/min-height ≥ 44px`, but did NOT
assert that the input element itself geometrically covers the 44×44 trigger
area. A regression that re-shrunk the input to `width:1px; height:1px` (with
`pointer-events:auto` still set) would silently re-introduce the iOS bug while
passing every prior test.

## Test added
`it('input element geometrically covers the full 44x44 trigger area (iOS hit-test contract)', ...)`
at `tests/unit/components/dashboard/DashboardDateControl.test.tsx:124-150`
(inside the existing `describe('iOS-reachable date picker (Bug #1)', ...)`
block, immediately after the existing
`'keeps the date input as a real pointer-receiving tap target'` test as a
sibling hit-area guard).

The test asserts on the input's inline `style` attribute (the runtime source
of truth iOS reads), not on `window.getComputedStyle()`, because jsdom does
not run layout and cannot resolve `inset: 0` or `100%` against the parent
wrapper. Four assertions form the contract:

1. `input.style.position === 'absolute'` — layers over wrapper.
2. `input.style.inset` matches `/^0(px)?$/` — full coverage (regex accommodates
   CSSOM serializing the bare `0` shorthand without `px`).
3. `input.style.width === '100%'` and explicit `!== '1px'` — regression guard
   directly targeting the iOS bug shape.
4. `input.style.height === '100%'` and explicit `!== '1px'` — same guard for
   the height axis.

## TDD verification

| Phase | State | Test result | Notes |
|---|---|---|---|
| 1. Initial add (first assertion form: `expect(input.style.inset).toBe('0px')`) | RED | 1 failed | Discovered CSSOM serializes `inset: 0` as `'0'`, not `'0px'`. |
| 2. Assertion refined to `toMatch(/^0(px)?$/)` against unchanged production | GREEN | 11 passed | Test passes against the actual fix. |
| 3. Production component `width/height` swapped to `'1px'` (regression simulation) | RED | 1 failed: `expected '1px' to be '100%'` | Regression caught at the exact bug shape. Failure message is unambiguous. |
| 4. Production component reverted to `'100%'` | GREEN | 11 passed | Final state — production untouched, test added. |

Final pass count: **11/11**.

## Status
implemented

## Files touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\DashboardDateControl.test.tsx`

(Production component `components/dashboard/DashboardDateControl.tsx` was
temporarily edited for the regression-simulation step of TDD verification but
fully reverted — final diff against pre-auto-fix state is empty.)
