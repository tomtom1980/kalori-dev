# Bug 4: Mobile selectors drift from native-feel pattern (wheel picker missing)

## Classification
known_fix (with design-doc edit)

## Root Cause
`Planning/ui-design.md` does not prescribe any mobile wheel-picker library. The spec is biased toward editorial-broadsheet primitives (flush-serif `VALUE × UNIT` Portion Picker §7.2.5, kicker-row radios §7.2.6, Radix `DropdownMenu` §7.3.2 FilterDropdown / SortDropdown, `<select>` for IANA timezone §7.5). On mobile (<768px) these read as static dropdowns/typography rather than the inertial scrollable cylinder iOS users expect for "pick one of N values." The §7.2.5 stepper-with-preset-chips is intentionally anti-generic (tiebreaker #12) and must be preserved on desktop, but a parallel mobile-only wheel surface is needed for high-cardinality numeric/enumerated selection. The contract gap is in `ui-design.md`; implementation drifted naturally because no library was prescribed.

## Library Choice (Recommendation)

**Primary:** **Hand-rolled `<MobileWheelPicker>` built on already-prescribed `framer-motion` `LazyMotion + m`** (§9.4) using CSS scroll-snap + `useMotionValue` / `useTransform` for the rotational fade. NO new dependency.

**Rationale:**
- **Bundle: 0 KB added.** `framer-motion` LazyMotion already ships (§9.4 tiebreaker #11). Adding `vaul` (~12 KB gz) or `react-mobile-picker` (~9 KB gz, last release 2024-Q2, sole maintainer) violates the "simplicity first" principle and adds a license/abandonment surface for a single visual pattern.
- **A11y:** we control `role="listbox"` + `aria-activedescendant` (matches §7.3.1 grid pattern) + `role="spinbutton"` parity with existing Portion Picker (§7.2.5 line 1199). Arrow-up/down + Home/End + Enter commit; Escape closes. Library wrappers each strip or rename ARIA in ways that conflict with Ledger's audit chain.
- **Reduced motion:** §9.3 mandates 1ms + crossfades. `framer-motion` `useReducedMotion()` hook gates the inertial spring → instant snap; libraries lack this granular control without a wrapper.
- **Dark theme + Ledger tokens:** `bg-2` track + `oxblood` 2px center-row underline + 1px `rule-strong` top/bottom horizon lines + `dust→ivory→dust` opacity gradient on row text — pure CSS we own. Library defaults (rounded edges, white knobs, ease-out blur) violate §3.1 zero-radius and §3.4 hairlines-only rules and would require near-total override.
- **Stack fit:** Radix Dialog (`@radix-ui/react-dialog` already installed) hosts the mobile bottom-sheet wrapper exactly like Portion Picker §7.2.5 line 1171.

**Alternatives considered:**
- `vaul` — drawer primitive, NOT a wheel picker. Solves the bottom-sheet shell (which we already solve with Radix Dialog) but does not implement the cylinder UX. Rejected — wrong tool.
- `react-mobile-picker` — purpose-built but under-maintained, no headless mode, ships its own styling we'd fight, ~9 KB gz. Rejected — net cost > benefit when we already own framer-motion.
- `@react-aria/components` Picker — not a wheel; renders as listbox/popover. Excellent a11y but doesn't match the iOS scroll-cylinder pattern user requested. Rejected — wrong primitive.

## Proposed Change (Diff Outline)

### Step A — Update `Planning/ui-design.md`
- **Add subsection §4.1.10 `MobileWheelPicker` primitive** after the 9 primitives table (line 333):
  > "Mobile-only (<768px) bottom-sheet wheel picker for high-cardinality enumerated selection. Built on `LazyMotion + m` per §9.4 — no new dependency. Desktop/tablet (≥768) uses existing primitive (Radix `DropdownMenu`, `Stepper`, `<select>`)."
- **Add §10.6.1 a11y contract for wheel picker:** `role="listbox"`, each row `role="option"` with `aria-selected`, container `aria-activedescendant`; ArrowUp/Down/Home/End/Enter/Escape; 44×44 minimum row height (§10.6); `useReducedMotion` gates inertial spring → instant snap (§9.3); commit on snap-end OR explicit "DONE" tap (mobile users can't reliably blur a sheet).
- **Update §7.2.5 Portion Picker** (line 1166): split desktop spec (flush-serif `VALUE × UNIT` per tiebreaker #12) from mobile spec (wheel picker for portion **count** 0.25–10 step 0.25; preset chips HALF/FULL/DOUBLE remain ABOVE the wheel; unit segmented control unchanged). Tiebreaker #12 is preserved on desktop where it was authored — mobile gets the native-feel pattern user requested.
- **Update §7.2.6 ConfirmationScreen Items list** (line 1232): per-item portion stepper (line 1236) becomes a **tap-to-open MobileWheelPicker bottom-sheet** on mobile; desktop keeps the inline 44×44 stepper.
- **Update §7.2.6 TimeEditor** (line 1262): `LOGGED AT` field on mobile opens **two-column MobileWheelPicker** (hours 0–23 + minutes 00–59 step 5) inside the same sheet; desktop unchanged. Date stays on native picker per existing spec.
- **Update §7.5 Timezone select** (line 2245): `<select>` already uses native picker on mobile (browser renders OS wheel automatically) — leave as-is, no migration needed. Document this exception.
- **Add Tiebreaker #21 entry** to §13: "Mobile wheel picker pattern for portion count + time-of-day; preserves §7.2.5 desktop flush-serif (#12) on ≥768px via `useIsMobile`."

### Step B — Implementation
1. Add `lib/hooks/use-is-mobile.ts` (no existing hook found via grep — must be created).
   - Pattern: `useSyncExternalStore` over `matchMedia('(max-width: 767px)')`; SSR returns `false` (desktop default).
2. Add `components/primitives/MobileWheelPicker.tsx`:
   - Props: `{ value, onChange, options: {label,value}[], itemHeight=44, visibleRows=5, onCommit?, ariaLabel }`
   - Internals: vertical scroll container with `scroll-snap-type: y mandatory`; `useMotionValue(scrollTop)` → `useTransform` to row opacity (1 at center, 0.4 at ±2 rows) and rotation; `useReducedMotion()` → no `transition` animation, instant snap.
   - A11y: `role="listbox"`, `aria-activedescendant`, keyboard handler.
3. Add `components/primitives/MobileWheelSheet.tsx` — Radix Dialog wrapper that hosts one or two side-by-side wheels + DONE button (matching §7.2.5 line 1171 bottom-sheet shell).
4. Migrate consumers (in order — minimum surface):
   - `app/(app)/log/_components/ConfirmationScreen.tsx` — per-item portion stepper (current `Stepper`-style) → tap opens single-wheel sheet on mobile.
   - `app/(app)/library/_components/FoodDetail/FoodDetail.tsx` — same per-row portion pattern when present.
   - **TimeEditor child of ConfirmationScreen** — `HH:MM` becomes 2-column wheel sheet on mobile (date keeps native).
   - Portion Picker §7.2.5 (file location: search at impl time — `LibraryTab.tsx` opens it) — wheel as primary mobile control; preset chips (HALF/FULL/DOUBLE) move above wheel; `±` buttons drop on mobile (wheel replaces them) but stay on desktop.
5. Do **not** migrate: `FilterDropdown` / `SortDropdown` (Radix DropdownMenu pattern is correct for filter/sort — text labels, low cardinality, expects "menu" semantics not "picker"). Document in commit message why these are excluded. Do **not** migrate `<select>` for timezone (browser already renders native wheel on mobile).

### Step C — Tests (TDD)
- `tests/components/primitives/MobileWheelPicker.test.tsx` — RED: render at 375px viewport, scroll asserts new value committed; keyboard ArrowDown advances; Enter commits; Escape cancels with no commit. Reduced-motion: scroll snaps without spring.
- `tests/components/primitives/use-is-mobile.test.tsx` — RED: matchMedia 375px returns true; 1024px returns false; SSR returns false.
- `tests/integration/portion-picker-mobile.test.tsx` — at 375px: tap opens sheet, wheel scroll updates portion field; at 1024px: stepper still renders.
- `tests/e2e/mobile-wheel-picker.spec.ts` — Playwright at 375 viewport: log flow → confirmation → tap portion → wheel → snap → save; assert committed value. Plus `prefers-reduced-motion: reduce` variant.

## Files Affected
- `Planning/ui-design.md` (design-doc edit — REQUIRED before impl)
- New: `lib/hooks/use-is-mobile.ts`
- New: `components/primitives/MobileWheelPicker.tsx`
- New: `components/primitives/MobileWheelSheet.tsx`
- Modified: `app/(app)/log/_components/ConfirmationScreen.tsx`
- Modified: `app/(app)/library/_components/FoodDetail/FoodDetail.tsx`
- Modified: `app/(app)/log/_components/LibraryTab.tsx` (or wherever Portion Picker mounts; verify in impl Phase)
- New tests as listed above
- `package.json` — **NO change** (no new dep)

## TDD Required
yes — primitive logic (snap math, keyboard, a11y, reduced-motion fallback), breakpoint switching hook, integration parity desktop-vs-mobile

## Test Approach
- Unit: primitive renders correct row at value; scroll commits new value; keyboard handlers; a11y attrs (axe).
- Integration: `useIsMobile` switches between Stepper (desktop) and MobileWheelPicker (mobile) at 375 vs 1024 viewport.
- Visual regression: 375 baseline on Confirmation portion column + Time editor + standalone Portion Picker sheet (3 new screenshots) + 1024 baseline confirms desktop unchanged.
- Reduced-motion: explicit Playwright `emulateMedia({ reducedMotion: 'reduce' })` test that scroll lands at exact row with no spring overshoot.

## Risk Assessment
medium — net-new primitive; touch-vs-mouse-vs-keyboard parity is the standard wheel-picker gotcha; visual-regression risk on Confirmation + Portion Picker is real. Mitigated by (a) zero new dep (no supply-chain), (b) reusing existing Radix Dialog shell + framer-motion (already in bundle and tested), (c) preserving desktop flow unchanged via `useIsMobile`.

## Regression Sweep Needed
- Log flow E2E (mobile + desktop): TYPE → PARSE → Confirmation save with non-default portion + non-default time
- Library flow E2E: select item → Portion Picker → save
- Existing Portion Picker unit/integration tests
- Existing ConfirmationScreen unit tests (stepper interactions)
- Visual baselines for Confirmation, Portion Picker sheet, Time editor (375 + 1024)
- Reduced-motion E2E (existing `tests/e2e/reduced-motion.spec.ts` adds wheel scenarios)

## UI Touching
true

## Quick-Pick Citation
Per the user's mobile-ui-guide.md routing intent: "iOS-style wheel picker for high-cardinality numeric or enumerated selection on <768px viewports — reduced-motion variant snaps instantly; desktop keeps existing input primitive." (User-prescribed mapping; the literal mobile-ui-guide.md file is not in the repo at `~/.claude/skills/ui-design/`, so the canonical line is the one above paraphrased from the user's framing of this bug.)

## Design-Doc Edits Required
**YES** — `Planning/ui-design.md` must be updated **before** implementation lands:
- §4.1 primitives table — add `MobileWheelPicker` (10th primitive)
- §7.2.5 Portion Picker — split desktop/mobile spec
- §7.2.6 Confirmation Items + TimeEditor — split desktop/mobile
- §10.6 — wheel picker a11y contract subsection
- §13 — Tiebreaker #21 capturing the mobile-vs-desktop split rationale

The Phase 3 implementation sub-agent must edit `ui-design.md` FIRST (and the spec edit must pass design review) before any `components/primitives/MobileWheelPicker.tsx` code lands. This preserves the spec-as-source-of-truth invariant the project relies on.

## Open Questions
- **Tablet behavior (768–1279):** propose desktop-style stepper since tablets have hover + larger pointer; user to confirm.
- **High-cardinality cap:** wheel UX degrades >50 items. Portion count (0.25–10 step 0.25 = 40 items) is fine. Time-minutes step-5 (12 items) is fine. If a future consumer wants 200+ items, fall back to Radix Dialog + filtered listbox (not the wheel).
- **Snap-only vs explicit DONE:** mobile sheets benefit from explicit commit button (avoids accidental scroll-out commits). Propose DONE button + outside-tap = cancel; user to confirm.
- **Existing Portion Picker §7.2.5 line 1181 ±44×44 buttons:** drop on mobile (wheel replaces them) or keep as auxiliary nudge? Recommend drop on mobile to free vertical real estate; keep on desktop.
