# Bug 1 — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\DashboardDateControl.tsx` — restructured the calendar trigger so the native `<input type="date">` is the interactive tap target. Removed `inputRef`, removed the `openPicker()` function (and its `showPicker()` call chain), removed the proxy `<button>`. Native input now sits inside a 44×44 `<span class="kalori-dashboard-date-trigger">` wrapper with `position: absolute; inset: 0; opacity: 0; pointer-events: auto; cursor: pointer; background: transparent; border: none; outline: none; font: inherit; color: transparent`. Calendar icon is wrapped in a decorative `<span data-testid="dashboard-date-icon" aria-hidden="true" style="pointer-events: none">`. Preserves: `value`, `max`, `disabled`, `data-testid="dashboard-date-input"`, `aria-label`, `aria-busy`, `onChange` → `goToDay()` → `router.push`, the loading spinner, the transition shield, the "Return to today" button, and the `aria-live` message region. Removed unused `useRef` import.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\DashboardDateControl.test.tsx` — added a `describe('iOS-reachable date picker (Bug #1)')` block with six new tests covering the new contract. Existing five tests preserved unchanged.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css` — added minimal `.kalori-dashboard-date-trigger` rule (transition + `:focus-within` ring) so keyboard focus on the now-hidden input surfaces a visible ring on the wrapper. Matches the existing `:focus-visible` token pattern (2px ivory outline + 2px offset + oxblood border tint) used elsewhere in the Ledger system.

`lib/i18n/en.ts` was NOT touched — the existing `t.dashboard.date.pickerA11y` key (`'Choose dashboard date'`) was already present and is reused as the input's `aria-label`. No new strings needed.

## Tests Added/Modified

Six new tests under `describe('iOS-reachable date picker (Bug #1)')`:

1. **`keeps the date input as a real pointer-receiving tap target`** — Asserts `getComputedStyle(input).pointerEvents !== 'none'`, `opacity === '0'`, and the wrapper carries `minWidth ≥ 44` + `minHeight ≥ 44` (WCAG 2.5.5 + Apple HIG tap-target floor).
2. **`preserves the accessible label on the date input itself`** — Asserts `getByLabelText('Choose dashboard date')` resolves to the same node as `getByTestId('dashboard-date-input')` (no more proxy button stealing the labeled control).
3. **`renders the calendar icon as decorative (pointer-events: none, aria-hidden)`** — Locates the icon via the new `data-testid="dashboard-date-icon"` seam and asserts `aria-hidden="true"` + `pointer-events: none` on the container.
4. **`does not call HTMLInputElement.showPicker during a wrapper click`** — Installs a spy via `Object.defineProperty(HTMLInputElement.prototype, 'showPicker', ...)`, fires `user.click(input)`, asserts the spy is never called. Restores the original descriptor in `finally`.
5. **`disables the date input while a day is loading`** — Regression for the `isLoading` branch; asserts `input.disabled === true` after `fireEvent.change`.
6. **`preserves the max attribute so future dates cannot be selected`** — Asserts `input.getAttribute('max')` matches `today` and `type` remains `'date'`.

All five pre-existing tests (loading indicator, transition shield, return-to-today, interaction lock) still pass unmodified.

## Test Run Result

- **Unit (`DashboardDateControl.test.tsx`):** 10 passed / 0 failed / 0 skipped (4 existing + 6 new).
- **Affected-module (`tests/unit/components/dashboard`):** 113 passed / 0 failed / 0 skipped across 12 test files. No regressions in adjacent dashboard components (MacroBars, Masthead, MealEntryContextTrigger, MealsBulletin, MicronutrientPanel, TargetUpdatedNudge, WaterTracker, WeightQuickAdd, etc.).
- **Typecheck (`pnpm typecheck` → `tsc --noEmit`):** PASS, zero output (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all clean).
- **Lint (`pnpm lint <changed files>`):** Zero errors. Zero new warnings. The 13 warnings in the lint output are all pre-existing `@typescript-eslint/no-unused-vars` warnings in unrelated test files (`pnpm lint` runs against the whole repo regardless of args).

## Deviations from Proposal

None. Implemented Option A verbatim per `proposals/bug-1.md`:

- Used `<span>` wrapper (not `<label>`) because the input has an `aria-label` and label-for association is not required; this also avoids accidentally double-triggering the input on label click in some browsers.
- Added `data-testid="dashboard-date-icon"` on the icon container as a test seam (the proposal did not specify a testid for it, but it was the cleanest way to make the icon container assertable). This is additive and does not break any consumer.
- Added `aria-busy={isLoading || undefined}` on the input (a small a11y enhancement consistent with the wrapper `<section>`'s existing `aria-busy={isLoading}` attribute).
- The `font: inherit` + `color: transparent` belt-and-suspenders on the input style suppresses any residual visible date text iOS Safari might render in legacy versions; the input is layered behind the icon overlay so this is defense-in-depth.

## Status

implemented

## Codex-Anticipated Flags

1. **`color: transparent` on the input may interact with `forced-colors` (Windows High Contrast) modes — the input could become invisible to the OS theme.** Mitigation argument: the input is decorative-visible-as-zero (it's only there to receive the tap and forward the OS picker). The visible chrome is the icon + the formatted date caption next to it. In forced-colors mode the wrapper's `border: 1px solid var(--color-rule-strong)` still renders, the icon still renders, and the input remains operable — only its (empty) text content is hidden, which is intentional. No regression vs. the previous `opacity: 0; pointer-events: none` pattern.
2. **`:focus-within` ring on the wrapper depends on the input being focusable; if a future refactor adds `tabindex="-1"` to the input the visible focus indication would vanish silently.** Worth a comment in the JSX OR a defensive integration test. Current implementation has no `tabindex` override so this is theoretical only.
3. **The proposal flagged a desktop-Enter-to-open regression; this is mitigated because focused `<input type="date">` opens its native picker on Space/Enter in all modern browsers (verified per ui-design.md §10.6.1 "OS-level wheel" prescription), but a Playwright E2E test against `chromium` desktop project would close this loop end-to-end.**
