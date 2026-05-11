# Codex R3 Fix — C-R2-1 (MobileWheelPicker boundary scroll math)

## Finding addressed

C-R2-1 (Critical) — Wheel scroll math could not select boundary rows by touch. With no padding spacers, `scrollTop=0` placed the FIRST option at the viewport top (not center) and the derive-index formula returned `floor(visibleRows/2) = 2` instead of `0`. Touch users physically could not reach index 0..1 or last-1..last because `scrollTop` clamps at `0` and `scrollHeight - clientHeight`. Visual-vs-scroll desync also broke the controlled-value contract: opening with `value=options[0]` rendered the active indicator at index 0 but `scrollTop=0` mapped back to index 2.

## Investigation

Confirmed Codex R2 root cause:

- 5-row viewport (`clientHeight = 5 * itemHeight = 220`) with no spacer padding.
- Old formula: `derivedIdx = round((scrollTop + clientHeight/2 - itemHeight/2) / itemHeight)`. For `scrollTop = 0`: `derivedIdx = round((0 + 110 - 22) / 44) = round(2) = 2` ❌.
- Old centering: `desiredScrollTop = N*itemHeight + itemHeight/2 - clientHeight/2 = N*44 - 88`. For N=0: `desiredScrollTop = -88`, clamped to `0` → row 2 visually centered, not row 0 → desync.
- The old formula's range had a half-viewport offset baked in that was unreachable below scrollTop=0 and above `(options.length - visibleRows) * itemHeight`.

## Fix Approach

1. Added top + bottom spacer padding `(containerHeight - itemHeight) / 2` to the listbox via `paddingTop` / `paddingBottom` + `boxSizing: 'border-box'` so the visible footprint stays at `containerHeight`. Padding creates blank scroll-room above row 0 and below row last so they CAN be centered.
2. Updated `handleScroll` formula to the simpler equivalent under the new padding: `derivedIdx = round(scrollTop / itemHeight)`. With spacer padding, `scrollTop = N * itemHeight` exactly centers row N.
3. Updated centering `useEffect` to compute `desiredScrollTop = activeIndex * itemHeight` directly. This both matches the new geometry and removes the dependency on `target.offsetTop` (which jsdom does not populate, and which is now padding-shifted in real browsers anyway).

## Files Touched

- `components/primitives/MobileWheelPicker.tsx` — production fix (spacer padding + new formulas)
- `tests/components/primitives/MobileWheelPicker.test.tsx` — added 5 boundary tests; updated 3 R1 I1 tests' offsetTop/scrollTop stubs to match the new geometry

## Test Run Result

- 5 new C-R2-1 tests written FIRST → confirmed RED for the right reasons (wrong-index errors caused by missing padding) → after fix all GREEN.
- All 24 wheel picker tests pass (16 baseline + 3 R1 I1 updated for new geometry + 5 new C-R2-1).
- Consumer integration tests: 7/7 pass (`tests/integration/mobile-wheel-picker-consumers.test.tsx`).
- Direct consumer unit tests (LibraryTab + ConfirmationScreen): 33/33 pass.
- TypeScript compilation clean for the modified file.

### Test list (24 total)

R1 I1 (3 — stubs updated for new padding-aware offsetTop / new scrollTop convention):
- `touch-scroll fires onChange when the snapped row crosses an option boundary (Codex R1 I1)` — scrollTop=176 (= 4 × itemHeight) maps to index 4 ✓
- `programmatic scroll from value-prop change does NOT re-fire onChange` — scrollTop=264 (= 6 × itemHeight) for value=7 ✓
- `touch-scroll that settles back on the current value does NOT fire onChange` — scrollTop=88 (= 2 × itemHeight) for value=3 ✓

R3 C-R2-1 (5 new):
- `C-R2-1: scrollTop=0 selects the first option (boundary at index 0)` ✓
- `C-R2-1: rendering with value=options[0] sets scrollTop=0 (centering useEffect)` ✓
- `C-R2-1: scrollTop=(N-1)*itemHeight selects the last option (boundary at last index)` ✓
- `C-R2-1: rounding behavior — half-row threshold lands on the nearer row` ✓
- `C-R2-1: visual-vs-scroll sync — value=options[0] renders aria-selected at index 0 AND scroll math agrees` ✓

## Math Verification

Geometry after fix (clientHeight = visibleRows × itemHeight, paddingTop = paddingBottom = (clientHeight − itemHeight) / 2):

- Row N's content-Y center = `paddingTop + N*itemHeight + itemHeight/2`
- For row N centered, viewport center (= `scrollTop + clientHeight/2`) must equal row N's center →
  `scrollTop = paddingTop + N*itemHeight + itemHeight/2 − clientHeight/2`
  `         = (clientHeight − itemHeight)/2 + N*itemHeight + itemHeight/2 − clientHeight/2`
  `         = N*itemHeight` ✓
- Inverse: `derivedIdx = round((scrollTop + clientHeight/2 − paddingTop − itemHeight/2) / itemHeight) = round(scrollTop / itemHeight)` ✓

Boundary checks:
- `scrollTop = 0` → `derivedIdx = round(0 / 44) = 0` ✓ (first option selectable)
- `scrollTop = (options.length − 1) × itemHeight` → `derivedIdx = options.length − 1` ✓ (last option selectable)
- Max scrollTop = scrollHeight − clientHeight = (paddingTop + options.length×itemHeight + paddingBottom) − clientHeight = options.length×itemHeight − itemHeight = (options.length − 1) × itemHeight ✓ (last index reachable)
- Half-row threshold: `scrollTop = N × itemHeight + itemHeight/2 − 1` → rounds to N; `scrollTop = N × itemHeight + itemHeight/2 + 1` → rounds to N+1 ✓
- Visual-vs-scroll sync: `value=options[0]` → centering useEffect sets `scrollTop = 0 × itemHeight = 0` → handleScroll derives index 0 → no spurious onChange ✓

## Open Concerns

- The 1px hairline borders top/bottom of the listbox subtract 2px from `clientHeight` in real browsers (218 instead of 220). The formula uses `scrollTop / itemHeight` and is independent of `clientHeight` so this is unaffected. Centering also uses `activeIndex × itemHeight` directly, also independent.
- CSS `scroll-snap-type: y mandatory` continues to handle visual snapping; spacer padding does NOT interfere because the snap targets are the `<li>` elements (which carry `scrollSnapAlign: 'center'`), and the snap algorithm uses each item's snap-align position relative to the scrollport center — same calculation that makes our scroll formula work.
- Consumers (`ConfirmationScreen`, `LibraryTab`, `MobileWheelSheet`) drive the wheel via the controlled `value` prop and keyboard navigation in their integration tests; they don't directly probe scrollTop, so the geometry change is transparent to them. All consumer tests green.
