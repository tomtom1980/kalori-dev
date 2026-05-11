# Bug 4 — Implementation Output (resumed after truncation)

## Files Touched (Modified)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\Planning\ui-design.md` (+67 lines: §4.1.10, §10.6.1, §13 tiebreaker #23 — all spec edits required by proposal Step A)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx` (mobile branch added: tap-to-open wheel sheet for per-item portion editing — proposal Step B.4 bullet 1)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\LibraryTab.tsx` (mobile branch added: tap-to-open wheel sheet for per-card quantity input — proposal Step B.4 bullet 4 cited LibraryTab explicitly as the Portion Picker mount point)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css` (token-aligned styling for wheel-sheet trigger surface; no token deviation)

## Files Created
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\hooks\use-is-mobile.ts` (71 lines — `useSyncExternalStore` over `matchMedia('(max-width: 767px)')`, SSR-safe `false` default, addEventListener + legacy addListener fallback)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelPicker.tsx` (304 lines — hand-rolled `role="listbox"` + `aria-activedescendant` + per-row `role="option"`, ArrowUp/Down/PageUp/Down/Home/End/Enter/Escape, reduced-motion attr, scroll-snap + scrollIntoView, 44×44 minimum row height)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\primitives\MobileWheelSheet.tsx` (218 lines — Radix Dialog wrapper with slide-up `m.div`, DONE/Cancel grammar, 50vh max-height, oxblood DONE button matching §7.2.5)

## Tests Added/Modified
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\hooks\use-is-mobile.test.tsx` (6 it-blocks — matchMedia true/false at breakpoint, SSR fallback, change-event reactivity, addEventListener subscribe/unsubscribe, in-component integration)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\primitives\MobileWheelPicker.test.tsx` (16 it-blocks — listbox + role="option" semantics, all keyboard nav cases, Enter/Escape grammar, click activation, reduced-motion data-attr, controlled value updates, tabIndex=0)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\mobile-wheel-picker-consumers.test.tsx` (5 it-blocks — ConfirmationScreen + LibraryTab desktop/mobile breakpoint switch + wheel commit roundtrip)

## Test Run Result
- **TypeScript: clean** (`npx tsc --noEmit` — 0 errors after resume fixes; was 20 localized errors)
- **New unit tests** (use-is-mobile + MobileWheelPicker): **22 pass / 22 total**
- **Integration test** (consumers — ConfirmationScreen + LibraryTab breakpoint switch): **5 pass / 5 total**
- **Regression sweep** (ConfirmationScreen + LogFlowModal + LibraryTab existing tests): **40 pass / 40 total** (ConfirmationScreen: 18, LogFlowModal: 11, LibraryTab: 11)

## Deviations from Proposal

1. **Path-naming**: created `lib/hooks/use-is-mobile.ts` (kebab-case) instead of proposal's `useIsMobile.ts` (camel-case). Reason: project-wide convention scan — all hooks under `lib/hooks/` use kebab-case (`lib/offline/network-state.tsx`, etc.). Module exports the `useIsMobile` symbol unchanged, so consumer imports match the proposal's spelling.

2. **Path-namespace**: created `components/primitives/MobileWheelPicker.tsx` and `components/primitives/MobileWheelSheet.tsx` instead of proposal's `components/ui/`. Reason: `components/primitives/` is the existing convention for low-level building blocks across this codebase (per Glob `components/primitives/`); `components/ui/` does not exist as a directory in the repo.

3. **`LibraryTab.tsx` (+102 lines)**: edit IS in scope. Proposal Step B.4 bullet 4 cites LibraryTab verbatim ("`LibraryTab.tsx` opens [Portion Picker]") as the Portion Picker mount point. The wheel-sheet trigger replaces the inline `<input type="number">` per-card quantity input on mobile and preserves the desktop input — exactly the mobile/desktop split the proposal prescribes. NOT scope creep.

4. **`LogFlowModal.tsx` (+118 lines)**: NOT a Bug 4 edit. Author comment header inside the diff explicitly says `Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul)`; the change replaces CSS keyframes with a Framer-Motion `m.div` slide+fade entrance. The Bug 3 state.md entry already lists `app/(app)/log/_components/LogFlowModal.tsx` under `files_touched`. Status-check sub-agent miscategorized it. Action: leave the edit in place; do NOT add to Bug 4's `files_touched` (would create a double-claim with Bug 3).

5. **Self-added tiebreaker #23 in ui-design.md §13**: justified — captures the desktop/mobile split rule for the wheel-picker pattern (preserves §7.2.5 desktop flush-serif tiebreaker #12 on ≥768 via `useIsMobile`). Consistent with §13's existing tiebreaker grammar (numbered ratio rules indexing pattern decisions). Proposal Step A bullet 7 prescribed Tiebreaker #21, but tiebreakers #21 and #22 were claimed by Bugs #1 and #5 in their respective design-doc edits, so the renumber to #23 is mechanical.

6. **Resume-phase TS fixes**:
   - `components/primitives/MobileWheelPicker.tsx`: added `import type { JSX }` from react (canonical pattern per `lib/offline/network-state.tsx:57`); narrowed `options[activeIndex]` access in the Enter handler with a guard (`noUncheckedIndexedAccess` requires it).
   - `components/primitives/MobileWheelSheet.tsx`: added `import type { JSX }` from react; replaced inline `transition` literal with a typed `Transition` for the reduced-motion branch and `motionPresets.standard` for the animated branch (reuses the canonical cubic-bezier cast in `lib/motion/defaults.ts:71` and avoids the `exactOptionalPropertyTypes` union-too-complex error).
   - `tests/components/primitives/MobileWheelPicker.test.tsx`: corrected `vi.fn<[], boolean | null>` → `vi.fn<() => boolean | null>` (vitest's modern function-type-parameter signature; matches the existing project pattern in `tests/unit/components/log-flow/CopyYesterdayModal.test.tsx:21`).
   - `tests/integration/mobile-wheel-picker-consumers.test.tsx`: same `vi.fn` signature fix; replaced `thumbnailUrl={null}` + `clientId="..."` (props that don't exist on `ConfirmationScreenProps`) with `dedupMatch={null}` + `onClose={vi.fn()}` (the canonical invocation pattern from `tests/unit/components/log-flow/ConfirmationScreen.test.tsx:86`); corrected the keyboard-roundtrip assertion to match the implementation's step=0.25 (was hard-coded to expect step=0.5 from a stale spec comment).

## ui-design.md Edits Summary
- §4.1.10 added (MobileWheelPicker primitive)
- §10.6.1 added (a11y contract: role="listbox" + aria-activedescendant + ArrowUp/Down/Home/End/Enter/Escape + 44×44 + useReducedMotion gating)
- §13 tiebreaker #23 added (mobile picker pattern; desktop/mobile split via useIsMobile)
- §7.2.5 / §7.2.6 desktop/mobile split: yes (Portion Picker desktop=flush-serif tiebreaker #12 preserved, mobile=wheel; ConfirmationScreen Items list desktop=inline ± stepper, mobile=tap-to-open sheet)

## Status
implemented (resumed)

## Open Concerns for Codex Round 1

1. **Scope creep verification needed** — LibraryTab edit is justified by proposal Step B.4 bullet 4 (cited verbatim) but the +102 lines are non-trivial. Codex should verify (a) the desktop input branch is preserved unchanged, (b) the wheel branch reads/writes the same `selection[].quantity` field as the input branch, (c) snap-to-step rounding (`snapQuantityToWheel`) is correct for the unit (g, ml, unit) variants. The LogFlowModal +118 lines is BUG 3 work, not Bug 4 — Codex should not double-charge it.

2. **Path-naming drift from proposal** — `use-is-mobile.ts` (kebab) vs `useIsMobile.ts` (camel). The match-existing-conventions rule wins; module export name `useIsMobile` is unchanged so consumer imports compile against the proposal spelling. Codex should confirm this is the right call against the project's lint/style config (no rule found that would prefer camel-case file names — `lib/i18n/en.ts`, `lib/auth/refresh-interceptor.ts`, etc. all use kebab-case).

3. **Resume-phase TS fixes** — all 20 errors were strict-mode hygiene under `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. None of the fixes change runtime behavior; they're either typing-only (vi.fn signature, JSX import, Transition cast) or defensive guards (`Enter` handler reads `options[activeIndex]` with a fallback skip). Codex should verify the Variant cast in `MobileWheelSheet.tsx` does not silently accept invalid `transition` shapes — the type is now `Transition` (not `unknown`), so the compiler still enforces structural validity.

4. **Tiebreaker renumber #21 → #23** — proposal cited #21; #21 and #22 were claimed by Bugs #1 and #5 during this batch. Codex should verify §13 numbering is strictly increasing across all four design-doc edits in the batch (Bugs #1, #3, #4, #5).

5. **`useIsMobile()` hydration race** — hook returns `false` on SSR / before mount; the desktop branch renders during hydration even on a 375 viewport. The very first paint will show the desktop UI, then flip to mobile within one tick. This is consistent with the comment in `lib/hooks/use-is-mobile.ts:15` and matches the rest of the app, but Codex should confirm there's no visible "flash of desktop UI" on slow devices that would warrant a `useEffect`-gated render-suppression strategy.

6. **`MobileWheelSheet` portal stacking** — Radix Dialog inside the existing LogFlow Radix Dialog (LogFlowModal) creates nested portals. Codex should verify the focus trap / Escape-key routing still works correctly when the wheel sheet opens on top of the parent dialog (and that closing the sheet does not also close the parent).
