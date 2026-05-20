# Bug Bundle Manifest — 2026-05-16-ios-calendar-fix

**Batch ID:** 2026-05-16-ios-calendar-fix
**Started:** 2026-05-15T18:15:52Z
**Closed:** 2026-05-15T19:01:00Z
**Branch:** main
**Starting SHA:** 17a13b3cce41b2b4b843394601f5ba8688117364
**Closing SHA:** def254302b9d3584cc4f854f6d2699adcadccb1d
**Bugs in batch:** 1 (1 fixed, 0 dropped)

## Bug 1 — iOS calendar button doesn't open date picker on iPhone/iPad

- **Classification:** known_fix
- **Source:** bug item #33 in `bugs/bugsandimprovements.txt`
- **Files touched:**
  - `components/dashboard/DashboardDateControl.tsx` — restructured the calendar trigger so the native `<input type="date">` is the interactive tap target. Removed `inputRef`, removed the `openPicker()` function (and its `showPicker()` call chain), removed the proxy `<button>`. Native input now sits inside a 44×44 `<span class="kalori-dashboard-date-trigger">` wrapper with `position: absolute; inset: 0; opacity: 0; pointer-events: auto; cursor: pointer; background: transparent; border: none; outline: none; font: inherit; color: transparent`. Calendar icon is wrapped in a decorative `<span data-testid="dashboard-date-icon" aria-hidden="true" style="pointer-events: none">`. Preserves: `value`, `max`, `disabled`, `data-testid="dashboard-date-input"`, `aria-label`, `aria-busy`, `onChange` → `goToDay()` → `router.push`, the loading spinner, the transition shield, the "Return to today" button, and the `aria-live` message region. Removed unused `useRef` import.
  - `tests/unit/components/dashboard/DashboardDateControl.test.tsx` — added a `describe('iOS-reachable date picker (Bug #1)')` block with six new tests covering the new contract. Existing five tests preserved unchanged.
  - `tests/e2e/ios-calendar-trigger.spec.ts` (new) — three tests against the `webkit-ios` Playwright project covering elementFromPoint hit-test + tap focus + accessible label + max attribute on iPhone 15 Pro and iPad Pro 11 viewports.
  - `playwright.config.ts` — added a new `webkit-ios` project (Mobile Safari engine, default iPhone 15 Pro descriptor). Picks up `tests/e2e/ios-calendar-trigger.spec.ts` exclusively; the existing `chromium` project is `testIgnore`d for the new spec to prevent double execution.
  - `app/globals.css` — added minimal `.kalori-dashboard-date-trigger` rule (transition + `:focus-within` ring) so keyboard focus on the now-hidden input surfaces a visible ring on the wrapper. Matches the existing `:focus-visible` token pattern (2px ivory outline + 2px offset + oxblood border tint) used elsewhere in the Ledger system.
- **Tests added:**
  - Vitest unit (6 new in `describe('iOS-reachable date picker (Bug #1)')`):
    1. `keeps the date input as a real pointer-receiving tap target`
    2. `preserves the accessible label on the date input itself`
    3. `renders the calendar icon as decorative (pointer-events: none, aria-hidden)`
    4. `does not call HTMLInputElement.showPicker during a wrapper click`
    5. `disables the date input while a day is loading (regression: loading state)`
    6. `preserves the max attribute so future dates cannot be selected`
  - Plus a 7th test (test geometry guard) auto-added during Codex R1 auto-fix.
  - Playwright webkit-ios E2E (3 new in `tests/e2e/ios-calendar-trigger.spec.ts`):
    1. iPhone 15 Pro — elementFromPoint at the calendar centre returns the date input
    2. iPad Pro 11 — elementFromPoint at the calendar centre returns the date input
    3. date input carries the accessible label and the max boundary attribute
- **Root cause:** `components/dashboard/DashboardDateControl.tsx` rendered the native `<input type="date">` with `position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none` and opened it programmatically via `input.showPicker()` from a sibling button `onClick` handler. iOS Safari (WebKit) refuses to open a programmatically-invoked `showPicker()` — and any `focus()` + `click()` fallback — on a date input that is effectively invisible / non-interactive (zero-size, `opacity:0`, or `pointer-events:none`). WebKit's gesture-attribution heuristic also requires the actual `<input>` element to be hit-tested by the user's tap; the calendar `<button>` adjacent to it is a different element, so iOS did not treat the call as user-initiated for the hidden input. Result: `showPicker()` either silently no-oped or threw a `SecurityError`/`NotAllowedError`, which the old code did not catch, and the picker never appeared. Authoritative rule violated: `Planning/ui-design.md` §10.6.1 line 2990 — "`<input type="time">` and `<input type="date">` ALREADY render an OS-level wheel on iOS/Android — do NOT shim them." Sibling precedent: `WeightQuickAdd.tsx` and `Confirmation/TimeEditor.tsx` both render native date/datetime-local inputs directly with no shim and work on iOS.
- **Fix:** Restructured the calendar trigger so the native `<input type="date">` itself is the interactive tap target. Removed the `openPicker()` function + `inputRef` + the proxy `<button>` shim. The input now sits inside a 44×44 `<span class="kalori-dashboard-date-trigger">` wrapper with `position: absolute; inset: 0; opacity: 0; pointer-events: auto; cursor: pointer; background: transparent; border: none; outline: none; font: inherit; color: transparent`. The `<CalendarDays>` icon is wrapped in a decorative `<span data-testid="dashboard-date-icon" aria-hidden="true">` with `pointer-events: none` so it cannot steal the tap. Preserves `value`, `max`, `disabled`, `data-testid="dashboard-date-input"`, `aria-label`, `aria-busy`, `onChange` → `goToDay()` → `router.push`, the loading spinner, the transition shield, the "Return to today" button, and the `aria-live` message region. Added a `.kalori-dashboard-date-trigger:focus-within` rule in `app/globals.css` so keyboard users still see a visible focus ring even though the input itself is opacity 0. One code path for iOS / Android / desktop — no UA branching.
- **Risk:** low
- **UI touching:** true
- **TDD required:** yes
- **Library prescription:** `Planning/ui-design.md` §10.6.1 line 2990 ("do NOT shim `<input type='date'>`")
- **Codex R1:** 0 Critical, 1 Improvement (auto-fixed: test geometry guard), 0 Minor
- **Codex R2:** BLOCKED (OpenAI quota exhaustion at 2026-05-16T18:15:52Z); deferred via project precedent (F-IOS-CAL-CODEX-R2-DEFERRED)
- **Security review:** 0 Critical / 0 High / 0 Medium / 2 Informational (CSS hygiene only) — approved
- **E2E:** spec written (Playwright webkit-ios project, iPhone 15 Pro + iPad Pro 11 viewports); locally blocked by F-TEST-4 #1 auth fixture (legacy service-role JWT not in `.env.local` by design); CI authoritative

## Pending followups

- **F-IOS-CAL-CODEX-R2-DEFERRED** (LOW) — Codex round-2 adversarial review was blocked by OpenAI usage-limit at 2026-05-16T18:15:52Z. Round 1 was clean except for a single Improvement (test geometry guard) which was auto-fixed before round 2 was attempted. No production code changed between round 1 and the blocked round 2. Re-run when quota refreshes.
- **SEC-INFO-1** — inline `outline: 'none'` on the input is currently intentional (focus surfaces via wrapper `:focus-within`). If a future refactor decouples the wrapper, this would silently regress.
- **SEC-INFO-2** — inline `cursor: 'wait'` on opacity-0 input is dead CSS because the wrapper's cursor wins. Cosmetic only.
