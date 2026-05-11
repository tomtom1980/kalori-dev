# Codex R1 Fix — I1 (Touch-scroll onChange)

## Finding addressed
I1: Touch-scroll never fires onChange — wheel primitive's core purpose defeated. User scrolls + taps Done → commits stale draft.

## Investigation
Codex was correct. The component used native CSS `scroll-snap-type: y mandatory` for pointer/touch scrolling but had **no `onScroll` handler whatsoever**. The keyboard path (`handleKeyDown` → `moveTo` → `onChange`) and click path (`onClick={() => moveTo(idx)}`) both fired `onChange`, but a touch-drag/scroll only updated browser-internal `scrollTop` — `onChange` was never reached, so the controlled `value` never advanced. Tapping Done committed the stale `value` the parent originally passed in. Bug confirmed by reading `components/primitives/MobileWheelPicker.tsx:228-289` (no `onScroll` prop on the `<ul>`) and the existing test file (16 tests cover keyboard/click/aria but zero exercise scroll-snap commit).

## Fix Approach
Wired an `onScroll` handler on the `<ul>` that derives the active index from `scrollTop + clientHeight/2` rounded to the nearest row, then fires `onChange(options[derivedIdx].value)` only when the derived index differs from the current `activeIndex` (and the option is enabled).

No "this-was-a-programmatic-scroll" flag is needed: when the existing `useEffect` programmatically scrolls to center `activeIndex`, the resulting scrollTop maps back to the *same* `activeIndex` via the rounding math, so the equality short-circuit (`clamped === activeIndex`) rejects every programmatic scroll event for free. Only USER touch-scrolls land at a different row index, so only they fire `onChange`. This makes the handler immune to React 18 strict-mode double-effect-invocation and to smooth-scroll multi-frame timing.

## Files Touched
- `components/primitives/MobileWheelPicker.tsx` — added `UIEvent` import; new `handleScroll(ev)` function (~15 lines); `onScroll={handleScroll}` wired on the `<ul>`.
- `tests/components/primitives/MobileWheelPicker.test.tsx` — added 3 tests covering: I1-direct (touch-scroll → onChange), feedback-loop guard (programmatic scroll from value-prop change does NOT re-fire), no-op guard (settle-on-current-row does NOT fire).

## Test Run Result
- New failing-then-green test: `touch-scroll fires onChange when the snapped row crosses an option boundary (Codex R1 I1)` — assertion `expect(onChange).toHaveBeenCalledWith(5)` after simulated scroll to row index 4. Verified RED before fix (0 calls), GREEN after fix.
- MobileWheelPicker sweep: **19 / 19 passing** (was 16 before, now 16 baseline + 3 new = 19; no regressions).
- Consumer integration test (`tests/integration/mobile-wheel-picker-consumers.test.tsx`): **7 / 7 passing** — no regression on ConfirmationScreen / LibraryTab consumers.

## False-positive Check
Not a false positive. Codex's claim was specific and correct: the only `onChange` call sites in the pre-fix file were inside `moveTo()` (called from keyboard `handleKeyDown` and option `onClick`). Reading the `<ul>` JSX confirmed zero scroll-related event handlers; the implementation comment at line 32-37 explicitly noted scroll-snap was "free" but never wired the listener that closes the loop.

## Reduced-motion Verification
- The fix is reduced-motion neutral. The existing reduced-motion path (line 217: `scrollBehavior: reducedMotion ? 'auto' : 'smooth'`) is unchanged. Under reduced motion the browser still produces native scroll events when the user drags; `handleScroll` still derives the index and fires `onChange` on row crossings. The pre-existing `data-reduced-motion="true"` test continues to pass.
- Verified via: existing tests `renders the static end-state under reduced motion (no inertial transition class)` + `default (no reduced motion) does not declare data-reduced-motion="true"` (both pass post-fix).

## Open Concerns for Round 2
1. **Scroll event firing rate.** During a finger-drag the browser fires scroll events at frame rate (~60Hz). Most events return early via the `clamped === activeIndex` short-circuit (very cheap — three arithmetic ops + two compares). Only boundary-crossing events call `onChange`, which causes one parent re-render per row crossed. For a 0.25–10 portion picker (40 rows), a fast flick from 0.25 → 10 produces ~40 re-renders — acceptable for portion picker scope, but worth flagging if a future consumer wires this to a 200-row list. No throttling added; the equality short-circuit is the throttle.
2. **iOS momentum scroll past-end overshoot.** On iOS Safari, momentum scroll can briefly overshoot the snap target before snapping back. Each overshoot frame may trigger an `onChange(boundary-row-value)` then the snap-back trigger `onChange(true-target-value)`. The final committed value will be correct because the parent re-renders and the next render's `useEffect` re-centers, but consumers that log every `onChange` call (e.g., analytics) will see transient intermediate values. Acceptable for the wheel picker's use case (portion / time-of-day) but worth noting.
3. **Done button commit flow.** `onCommit` is unchanged (still keyboard-Enter only at the primitive level). The mobile bottom-sheet's Done button reads the parent state, which is now correctly synced via the new `onChange` firing. No change needed at the primitive — this concern is fully mitigated by the fix.
4. **Disabled-row landing.** If the user scrolls and the snap lands on a `disabled` option, the handler returns without firing `onChange`. The wheel will visually appear to land on the disabled row, but the parent's `value` won't update. The next ArrowUp/Down will bypass the disabled row via the existing `moveTo` clamp logic. Edge case with no current consumer exercising it (no consumers pass `disabled` rows today).
