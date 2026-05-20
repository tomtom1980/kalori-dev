# Bug 1: Calendar button on dashboard doesn't open date picker on iOS

## Classification
known_fix

## Root Cause

`components/dashboard/DashboardDateControl.tsx` renders the native `<input type="date">` with `position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none` (lines 115–121) and opens it programmatically via `input.showPicker()` from a button `onClick` handler (lines 59–68, button at lines 87–105). iOS Safari (WebKit) refuses to open a programmatically-invoked `showPicker()` — and any `focus()` + `click()` fallback — on a date input that is effectively invisible / non-interactive (zero-size, `opacity:0`, or `pointer-events:none`). WebKit's gesture-attribution heuristic also requires the actual `<input>` element to be hit-tested by the user's tap; the calendar `<button>` adjacent to it is a different element, so iOS does not treat the call as user-initiated for the hidden input. Result: `showPicker()` either silently no-ops or throws a `SecurityError`/`NotAllowedError`, which the current code does not catch, and the picker never appears. The `WeightQuickAdd` date input (components/dashboard/WeightQuickAdd.tsx lines 658–678) confirms the working pattern: it renders `<input type="date">` directly with `width: 100%`, real `padding`, and `minHeight: 44` — no proxy button, no hidden-input shim — and it works on iOS because the user taps the input itself, which iOS opens natively.

Additionally, `Planning/ui-design.md` §10.6.1 line 2990 explicitly states: "`<input type="time">` and `<input type="date">` ALREADY render an OS-level wheel on iOS/Android — do NOT shim them." The current DashboardDateControl implementation violates that authoritative rule by shimming the input behind a programmatic-open button.

## Proposed Change (Diff Outline)

**`components/dashboard/DashboardDateControl.tsx`** — restructure the calendar trigger to be the `<input type="date">` itself, with the icon and visible chrome overlaid on top.

- Remove the `openPicker()` function and the `inputRef` (lines 33, 59–68).
- Remove the `<button onClick={openPicker}>` wrapper around the `CalendarDays` icon (lines 87–105).
- Restructure to a single 44×44 wrapper `<label>` (or `<span>` with the input as its sibling) where:
  - The `<input type="date">` fills the 44×44 box (`width: 100%; height: 100%; minWidth: 44; minHeight: 44`).
  - The `<input>` is opacity 0 BUT keeps `pointer-events: auto` and is positioned to receive the tap on the visible area (e.g., `position: absolute; inset: 0; opacity: 0; cursor: pointer; minHeight: 44; minWidth: 44`).
  - The `CalendarDays` icon is rendered visually on top with `pointer-events: none` and `aria-hidden="true"`.
  - The wrapper carries the Ledger frame styling (1px rule-strong border, bg-1 background, oxblood focus halo via `:focus-within`).
- Keep the `aria-label` on the `<input>` (it's already labelled `t.dashboard.date.pickerA11y` at line 113) so the calendar button retains accessibility — screen readers will announce "Pick viewed date" on focus.
- Preserve the `value`, `max`, `disabled`, `data-testid`, and `onChange` props on the input.
- Preserve the `isLoading` opacity/cursor styling on the wrapper.
- Preserve the "Return to today" button, loading spinner, transition shield, and aria-live message regions unchanged.
- Add a `:focus-within` outline rule to the wrapper so keyboard users get the same focus ring as the rest of the Ledger system (CSS in `app/globals.css` or inline `outline` via `:focus-within` since we cannot conditionally style via inline styles — accept that a tiny CSS class is the right path here).

**`app/globals.css`** — add a `kalori-dashboard-date-trigger` class (or similar) with `:focus-within` outline so keyboard focus is visible on the wrapper when the hidden input is focused. Match the existing `:focus-visible` ring tokens used elsewhere.

**`tests/unit/components/dashboard/DashboardDateControl.test.tsx`** — update tests:
- Remove tests that depend on the proxy button (none currently; the existing tests already drive `data-testid="dashboard-date-input"` via `fireEvent.change`, which keeps working).
- Add a test asserting that the input element itself is the interactive target: `expect(screen.getByTestId('dashboard-date-input')).not.toHaveStyle('pointer-events: none')`.
- Add a test asserting the input has accessible label and is reachable via keyboard tab order: `expect(screen.getByLabelText(/pick.*date/i)).toBe(screen.getByTestId('dashboard-date-input'))`.
- Add a regression test that verifies `showPicker` is NOT called from the component (smoke check that the new pattern does not regress to the old shim path).

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\DashboardDateControl.tsx`
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css` (small addition for `:focus-within` ring on the new wrapper)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\DashboardDateControl.test.tsx`

Three files total — well within the 5-file ceiling.

## TDD Required

yes — this is logic-and-DOM-structure-touching. The behavior change ("tapping the calendar button opens the OS date picker on iOS") cannot be unit-tested directly against iOS Safari, but we CAN test:
1. The input is the interactive target (not a sibling button).
2. The input is NOT styled with `pointer-events: none`, NOT `opacity: 0` AT zero-size (or: occupies ≥44×44 hit area).
3. The aria-label is present and matches the design tokens.
4. The legacy `showPicker` path is gone (negative assertion).
5. Existing tests for the loading state, transition shield, and "return to today" still pass.

iOS-specific behavior should be verified at the E2E layer (Playwright Mobile Safari device emulation — `webkit` browser, `iPhone 13` device descriptor) — the bugfix-tomi skill's E2E phase should pick this up automatically because the bug touches dashboard interactive UI.

## Test Approach

**Unit (vitest + React Testing Library, jsdom):**
- Use the existing `fireEvent.change(input, { target: { value: 'YYYY-MM-DD' } })` pattern — that path is independent of how the picker opens; it tests the `onChange` → `router.push` wiring. All four existing tests should keep passing.
- Add `expect(input).toHaveAttribute('type', 'date')` to lock in the native-input invariant.
- Add a DOM-structure assertion: the `data-testid="dashboard-date-input"` element should be the keyboard-focus target — `await user.tab()` lands on the input, not on a separate button.
- Add a CSS-pointer-events assertion via `window.getComputedStyle(input).pointerEvents` — must be `'auto'` (or unset / inherit, NOT `'none'`).

**E2E (Playwright):**
- Add a test under `tests/e2e/dashboard/` (or modify an existing dashboard test) that uses Playwright's `chromium`/`webkit` projects with the `iPhone 13` device descriptor:
  - Navigate to /dashboard.
  - `page.locator('[data-testid="dashboard-date-control"]').screenshot()` for visual baseline.
  - `page.locator('[data-testid="dashboard-date-input"]').tap()` (NOT `.click()` — Playwright distinguishes tap from click for touch emulation).
  - Assert no console errors (`page.on('console', ...)`).
  - Note: WebKit's date picker is OS-rendered chrome and cannot be asserted against directly. The assertion is "no exception thrown, no console error, and the input has focus". This catches the bug — the current code throws/no-ops silently on real iOS, but the regression test is "the input remains tappable as an `<input>` element, not a shimmed button."
- For an actual picker-open assertion, the only ground truth is manual QA on a real iOS device or BrowserStack. Document this in the test plan.

## Risk Assessment

low — the fix replaces a known-broken shim with the platform-native invocation that already works in WeightQuickAdd (precedent in same codebase). It removes code, doesn't add it. The change does not touch state management, network calls, RLS, or any cross-component contract. Existing tests already drive the input via `data-testid` so the test surface is preserved.

## Regression Sweep Needed

- **`components/dashboard/DashboardDateControl.tsx` consumers** — only `app/(app)/dashboard/page.tsx` (line 35 import, line 105 viewedDay prop). Single consumer; visual regression test on /dashboard top section is sufficient.
- **Dashboard interaction lock** — `DashboardInteractionLock` reads from the same `useDashboardDateTransitionStore`. Untouched by this fix. Existing test (`tests/unit/components/dashboard/DashboardDateControl.test.tsx` line 60+) still applies.
- **Keyboard navigation** — TAB order through the dashboard header. Verify Masthead → DateControl input → Return-to-today button (when present) → next section. The new wrapper-with-input pattern preserves tab reachability since the `<input>` is focusable by default.
- **A11y baseline** — Task D.1's accessibility audit results (mem observation 7662) should be re-checked for DashboardDateControl. The new pattern is MORE a11y-friendly than the proxy-button pattern because there is no longer a button that doesn't activate the labelled control.
- **Reduced-motion** — `.kalori-dashboard-date-spinner` rule in globals.css lines 1221, 1232, 1239 is untouched.
- **iOS PWA standalone mode** — iOS PWA installed-to-homescreen runs in WebKit; same date-picker pattern applies. No standalone-specific carve-out needed.

## UI Touching

true (DashboardDateControl is a dashboard interactive component — calendar trigger, loading affordance, transition shield).

## Library Prescription Check

`Planning/ui-design.md` has NO explicit Library Prescriptions row naming "DashboardDateControl" (verified via grep — only the Masthead, MealCategorySelector, and TimeEditor have explicit prescriptions). The authoritative rule that DOES apply is §10.6.1 line 2990:

> "**No-op exceptions:** `<input type="time">` and `<input type="date">` ALREADY render an OS-level wheel on iOS/Android — do NOT shim them."

This is the binding constraint. The current implementation violates it by shimming a date input behind a proxy button + `showPicker()`. The fix realigns with the prescription: use the native input directly, do not wrap it in a programmatic-open trigger.

Sibling precedent in same module: `WeightQuickAdd.tsx` (components/dashboard/WeightQuickAdd.tsx lines 658–678) and `TimeEditor.tsx` (app/(app)/log/_components/Confirmation/TimeEditor.tsx lines 129–155) both use `<input type="date">` / `<input type="datetime-local">` directly with no shim — both are documented as working on iOS via the OS-native picker.

The MobileWheelPicker / MobileWheelSheet path is NOT prescribed for date selection on this surface (per §10.6.1's explicit no-op exception). It is prescribed only for high-cardinality non-native pickers (portion picker, time HH:MM split, weight wheel).

## Open Questions

1. Should the visible calendar-icon chrome stay 44×44 fixed, or grow to a wider "label + icon" pill on tablet+ for a more discoverable touch target? **My recommendation: keep 44×44 fixed for now**, since the surrounding label text (`"VIEWING — PAST DAY"` + the date string) is already visually adjacent and the visible icon is sufficient.
2. The current `showPicker` removal also removes the keyboard-driven open path. iOS doesn't have a keyboard, but desktop users currently get the picker on Enter via the button. Once the input is the trigger, browsers handle Space/Enter on the focused input to open the picker natively — so no functionality loss. Confirm this behavior in the unit test.
3. Should we add a thin keyboard hint ("Press Enter to open calendar") for desktop users? **My recommendation: no.** The Ledger style guide does not include this affordance on any other date input, and the focus ring + cursor change already communicate interactivity.

## Recommended Fix Direction (pick ONE)

**A) Make the existing `<input type="date">` iOS-reachable by overlaying it on the calendar-icon button** (opacity 0 but pointer-events auto, real hit area ≥44×44, let iOS open it natively via real tap).

Why A:
- Matches the authoritative `ui-design.md` §10.6.1 line 2990 prescription verbatim ("do NOT shim them").
- Matches the working precedent in `WeightQuickAdd.tsx` (visible native input, no shim).
- Matches `TimeEditor.tsx` (native datetime-local input, no shim).
- Smallest possible change: removes shim code, doesn't add a parallel path.
- Same code path for iOS, Android, desktop — no UA branching, no `useIsMobile` dependency added.
- iOS, Android, and desktop all render their respective native pickers (wheel on iOS, dialog on Android, dropdown on Chrome/Firefox/Edge desktop).
- Preserves all existing tests by keeping the `data-testid="dashboard-date-input"` as the target.

NOT B (MobileWheelPicker swap):
- Violates §10.6.1's explicit no-op exception for `<input type="date">`.
- Doubles the surface area: now there are two pickers (mobile wheel + native input) that have to stay in sync on min/max/value.
- Requires a UA/breakpoint branch (`useIsMobile`) which adds a hydration-cost concern (already mitigated by `useIsMobile`'s `useSyncExternalStore` but still nontrivial).
- The MobileWheelPicker is built for high-cardinality selection (50 items max) — a date picker spanning months/years needs date-grid affordances the wheel does not provide. Calendar grid > vertical wheel for date selection UX.
- More code, more test surface, more failure modes.

NOT C (hybrid): all of B's downsides without B's benefits.

## Codex-Anticipation Notes

What an adversarial reviewer would flag:

1. **Risk: opacity-0 input is still discoverable to screen readers but invisible to sighted users — accidental tap on the wrong area might open the picker.** Mitigation: constrain the overlay to exactly the 44×44 calendar button surface using `position: absolute; inset: 0` within a `position: relative` wrapper. Do NOT let the input span more than the visible chrome.

2. **Risk: removing `showPicker` removes the desktop Enter-to-open-from-button shortcut.** Verification: native `<input type="date">` opens its picker on click and on Space/Enter while focused — confirmed in WebKit/Blink/Gecko. The visible "calendar button" wrapping the input still feels button-like to keyboard users because `:focus-within` provides the focus ring. No regression.

3. **Risk: the `disabled` attribute on the input must still prevent interaction during loading.** Verification: native `<input disabled>` is unfocusable and uninteractive. The wrapper should also reflect `cursor: wait; opacity: 0.72` (already in current code at lines 100–101) so the visible chrome communicates the busy state. Keep the existing inline-style branch.

4. **Risk: cursor on the wrapper.** With `pointer-events: auto` on the input and `pointer-events: none` on the icon overlay, the cursor will be `text` (default for `<input>`). Override on the input with `cursor: pointer` for clarity; OR put the cursor on the wrapper and let it bleed through. Verify in real Safari/Chrome.

5. **Risk: iOS PWA standalone mode.** Once installed to homescreen, iOS PWA still uses WebKit — the same native picker should appear. Confirm via real-device QA, not Playwright (Playwright Mobile Safari emulates the UA but not the standalone PWA chrome).

6. **Risk: iOS Safari < 16.4 might not respect `showPicker` at all, but the new pattern does not call it — it relies on direct tap. So the fix is forward-compatible with older iOS as well as newer. Document this in the JSDoc comment for the component.**

7. **Risk: the `value` prop on `<input type="date">` is the ISO `YYYY-MM-DD` string. On some browsers the picker's locale formatting renders the displayed value differently than the underlying value. We rely on the `formatDay()` function (lines 15–25) for the user-facing display — the visible "Tue, May 16, 2026" caption above the input is separate from the input's value. The input's chrome is hidden behind opacity 0 so the locale rendering does not affect what the user sees.**

8. **Risk: the new wrapper might break the existing flex layout at line 86–104.** The current button is a 44×44 grid item inside a flex row. The new wrapper should be `position: relative; width: 44px; height: 44px; flex: 0 0 auto` — equivalent layout footprint. Verify no shift via screenshot diff.
