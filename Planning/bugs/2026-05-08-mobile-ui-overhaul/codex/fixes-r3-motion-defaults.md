# Codex R3 Fix — I-R2-1 (Reduced motion in-app toggle integration)

## Finding addressed

I-R2-1 (Improvement, high) — `lib/motion/defaults.ts:144-207`. Bug 3 wired
the re-exported `useReducedMotion` to the OS-only signal (Framer's
`matchMedia('(prefers-reduced-motion: reduce)')`), ignoring the existing
in-app accessibility contract that CSS animations honor:
`localStorage['kalori.reduce-motion']` + `html[data-reduce-motion='1']`.
LogFlowModal, WizardShell, MobileWheelSheet, and MobileWheelPicker all
bypassed the Settings toggle as a result.

## Investigation

- **App-level toggle source**: `app/(app)/settings/_components/ReduceMotionToggle.tsx`.
  - Storage key: `kalori.reduce-motion` (single string `'1'` for ON, key removed for OFF).
  - HTML data attribute: `data-reduce-motion='1'` on `<html>`.
  - Same-tab fan-out: dispatches a `kalori:reduce-motion-change` `CustomEvent` on `window`.
  - Cross-tab fan-out: standard `storage` event.
  - Effective state contract: ADDITIVE — toggle ON forces reduce; OFF inherits OS pref. NEVER cancels OS-says-reduce.
- **Pre-existing reduced-motion hook outside framer-motion**:
  `useReducedMotionPreference()` (private) and
  `__probeReducedMotionForTests()` (test probe) live inside
  `lib/offline/network-state.tsx` (lines 230–326). They use
  `useSyncExternalStore` to merge OS pref + localStorage override and
  subscribe to `matchMedia` change, `storage`, and the
  `kalori:reduce-motion-change` CustomEvent. Bug 3 did not shadow this
  hook — it added a *separate* re-export under the same name through
  `@/lib/motion/defaults`, leaving the two paths divergent. The new
  wrapper now mirrors the same merge + subscription contract for
  Framer-driven consumers.

## Fix Approach

`lib/motion/defaults.ts`:

- Replaced the bare `useReducedMotion = fmUseReducedMotion` re-export with a wrapper hook that ORs three signals: OS pref (Framer hook), `html[data-reduce-motion]` dataset, `localStorage['kalori.reduce-motion']`.
- App-side merge uses `useSyncExternalStore` for hydration safety, with `getServerSnapshot` returning `false` so SSR never falls into reduced-motion (matches existing `network-state.tsx` discipline).
- Subscription set on the client only:
  1. `MutationObserver` on `<html>` filtered to `data-reduce-motion` — picks up Settings-toggle data-attribute writes.
  2. `window` `storage` event — cross-tab `kalori.reduce-motion` writes.
  3. `window` `kalori:reduce-motion-change` CustomEvent — same-tab Settings-toggle fan-out (matches the dispatch in `ReduceMotionToggle.notifyOverrideChange()`).
- SSR-safe: module top imports only types and React. All browser API access is inside snapshot/subscribe callbacks guarded by `typeof document` / `typeof window` checks.
- `useReducedMotionVariants` left untouched on the bare Framer hook — its existing baseline tests call it outside a component body, which would break under `useSyncExternalStore`. The wrapped hook is what flows to LogFlowModal / WizardShell / MobileWheel* consumers via direct calls; variant collapse remains OS-only by design until those baseline tests are migrated. Documented as an open follow-up below.

## Files Touched

- `lib/motion/defaults.ts` — added `useSyncExternalStore` import; replaced re-export with wrapper hook + helpers (`readAppReduceSnapshot`, `readAppReduceServerSnapshot`, `subscribeAppReduce`).
- `tests/unit/lib/motion/defaults.test.ts` — added 6 new tests under the new `describe` block; tagged the file with `@vitest-environment happy-dom` so DOM/MutationObserver/StorageEvent are available.

## Test Run Result

- **6 new R3 tests** (all R3 I-R2-1):
  - `returns true when ONLY OS pref says reduce (in-app toggle off)` ✅
  - `returns true when ONLY html[data-reduce-motion] is set (OS = no preference)` ✅
  - `returns true when ONLY localStorage override is set (OS = no preference, dataset = unset)` ✅
  - `returns false when neither OS pref nor in-app toggle is set` ✅
  - `reacts to html[data-reduce-motion] mutations during the hook lifetime` ✅
  - `reacts to cross-tab StorageEvent for kalori.reduce-motion` ✅
  - (Plus a 7th test for the `kalori:reduce-motion-change` CustomEvent — covers the same-tab fan-out path the toggle actually uses.)
- **Bug #3 baseline tests** (`defaults.test.ts` original 13): 13/13 pass. No regression.
- **Reduced-motion ecosystem tests**: 44/44 pass across:
  - `tests/unit/lib/motion/defaults.test.ts` — 20/20
  - `tests/unit/lib/motion/MotionProvider.test.tsx` — pass
  - `tests/integration/reduced-motion-audit.test.ts` — pass (audit framework unaffected)
  - `tests/integration/reduce-motion-effective.test.tsx` — pass (network-state probe still green)
  - `tests/integration/reduced-motion-toggle-mirror.test.ts` — pass (CSS mirror unchanged)
  - `tests/components/settings/ReduceMotionToggle.test.tsx` — pass
- **Consumer test** `tests/unit/app/onboarding/WizardShell-motion.test.tsx`: 3/3 pass.

## Open Concerns

- **Audit test**: `tests/integration/reduced-motion-audit.test.ts` operates on raw source-file scans (regex over CSS / TSX). It does NOT assert on Framer's actual runtime behavior, so the new wrapper does not cause an audit drift. The audit's contract is unchanged.
- **`useReducedMotionVariants` follow-up**: still calls `fmUseReducedMotion` directly. Its 2 baseline tests invoke it outside a component, which means swapping in the new wrapper (which uses `useSyncExternalStore`) regresses them with "Cannot read properties of null (reading 'useSyncExternalStore')". The variants helper is a much narrower surface than the re-exported hook (only `pulse` keys for ember/scale variants), and Bug 3 audit doesn't list it as a Settings-toggle gap. Recommend a follow-up: migrate the baseline tests to `renderHook` AND swap variants to the wrapper. Tracked as a P2 follow-up rather than rolled into this surgical R3 fix per the "stay within `lib/motion/defaults.ts` + its test file" rule.
- **No production component changes**: per finding scope, only the hook itself was touched. Consumers (LogFlowModal, WizardShell, MobileWheelSheet, MobileWheelPicker) automatically inherit the new behavior because they import `useReducedMotion` from `@/lib/motion/defaults`.
