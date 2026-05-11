# Bug 3 — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\package.json` (added `framer-motion@^12.38.0`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\pnpm-lock.yaml` (regenerated for framer-motion)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\layout.tsx` (mounted `<MotionProvider>` around `{children}`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\onboarding\_components\WizardShell.tsx` (replaced plain `<div className="kalori-wizard-step-body">` with `<m.div>` driven by `pageSettle` variant + `useReducedMotionVariants`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\LogFlowModal.tsx` (Dialog.Content asChild → `m.div`; spring-based opacity+y entry; reduced-motion gate via `useReducedMotion`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css` (removed obsolete `@keyframes kalori-wizard-step-enter` + `.kalori-wizard-step-body { animation: ... }`; removed `animation:` from `.kalori-log-content` mobile + the desktop `@media` override variants — the four `kalori-log-{enter,exit}-{mobile,desktop}` keyframe declarations remain in CSS but are now unreferenced)

## Files Created

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\motion\defaults.ts` (the prescribed motion foundation: `EASE_EDITORIAL`, `durations`, `motion` presets, `variants` {inkFade, emberPulse, pageSettle}, `useReducedMotionVariants`, re-exports `LazyMotion`/`m`/`AnimatePresence`/`useReducedMotion`/`domAnimation`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\motion\MotionProvider.tsx` (thin `'use client'` wrapper applying `<LazyMotion features={domAnimation} strict>`)

## Tests Added/Modified

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\motion\defaults.test.ts` — 13 contract tests covering exports + reduced-motion variant collapse helper
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\motion\MotionProvider.test.tsx` — 2 tests confirming MotionProvider renders children + admits `m.div` consumers
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\app\onboarding\WizardShell-motion.test.tsx` — 3 regression tests proving the migrated wizard step body keeps its CSS-class hook and renders under both reduced/non-reduced motion
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\app\log\LogFlowModal-motion.test.tsx` — 4 regression tests proving the migrated Dialog.Content keeps role=dialog/testid/aria wiring and the close button still dismisses

## Test Run Result

- Affected-module tests:
  - `tests/unit/lib/motion/*` — 15 passed / 0 failed
  - `tests/unit/app/onboarding/*` (motion proxy) + `tests/components/onboarding/*` — 71 passed / 0 failed
  - `tests/unit/app/log/*` (motion regression) + `tests/components/log-flow/LogFlowModal.test.tsx` — 11 passed / 0 failed
  - `tests/integration/reduced-motion-audit.test.ts` — 6 passed / 0 failed (the dynamic-CSS audit still proves every keyframe is suppressed under reduced motion AND that every JS-motion import has a reduced-motion guard)
- Full unit-test sweep (`tests/unit` + `tests/components` + `tests/integration/reduced-motion-audit.test.ts`): **128 files / 955 tests / 0 failed**
- TypeScript: `pnpm typecheck` passes with no errors
- ESLint: `pnpm lint` passes (5 pre-existing warnings unrelated to this change; 0 errors)
- Visual regression: **NOT RUN by this implementation pass** — see "Open Concerns" below. Per the contract, baselines must NOT be auto-accepted; visual sweep + re-baseline is Phase 6/7 territory for the orchestrator.

## Deviations from Proposal

1. **`framer-motion` (legacy package) chosen over the new `motion` package** (proposal Open Question 1). Rationale: `Planning/ui-design.md` §2.6 line 222 spells the import literally as `from 'framer-motion'`; the framer-motion v12 line is current and React-19 compatible. Aligning to the spec is lower-risk than introducing a different package name that the audit's `MOTION_LIBRARY_IMPORT_PATTERNS` would still flag (the audit already lists both `framer-motion` and `motion` as recognized patterns).
2. **Migrated families = 2, not 3.** Proposal §3 line 16 named "Dashboard log row enter/exit (`kalori-log-enter-mobile/exit-mobile`)" as a separate target, but those keyframes are the **modal** mobile keyframes (already covered by the LogFlowModal migration). The actual `MealsBulletin` / `MealColumn` row components do not consume any keyframes — there is no separate "dashboard log row" animation in the codebase. The third candidate (`@keyframes rowFadeIn` on `.heatmap-row`) belongs to the heatmap, NOT the log rows, and the proposal did not list it. Per the contract ("Stay within the proposal's `Files Affected` list — surface if you need to grow it"), I did not invent a third migration. The wizard step body + log modal cover the prescribed mobile-feel surfaces; remaining CSS keyframes (skeleton shimmer, drop-cap, chart tooltip, chronometer, focus rings, FD scrim/sheet, etc.) are explicitly listed in the proposal as "ambient surfaces" to keep as CSS.
3. **ESLint `no-restricted-imports` rule deferred** (proposal §3 line 13 marked it as "incremental"). The proposal explicitly listed it as future-incremental; introducing it now would force a same-PR rewrite of the (already-correct) `@/lib/motion/defaults` consumers and add risk. The convention is documented in the `lib/motion/defaults.ts` header comment for the next implementation pass.
4. **No `dashboard-choreography.ts` change** (proposal §3 line 16 mentions it). That file does not exist yet (per `lib/motion/` listing only `reduced-motion-audit.ts` + the two new files I added). Creating it is genuinely out of scope for the bug-fix; it would land alongside Bug 4 / 5 (depend on this Bug 3 foundation) or in a follow-up.

## Lockfile Diff Summary

- `framer-motion@^12.38.0` added to `dependencies`
- pnpm reports `+3` packages added (framer-motion + 2 transitive deps), `0` removed
- `pnpm-lock.yaml` regenerated by `pnpm add framer-motion`. Total dep count delta: +3.
- 7 deprecated subdependency warnings pre-existed; none new.

## Status

**implemented**

## Open Concerns for Codex Round 1

1. **Visual regression deferred.** Two animation surfaces changed (wizard step body + log modal). The Playwright `tests/screenshots/reduced-motion/` baselines plus any responsive baseline that captures the modal at mobile/tablet/desktop will need re-capture during Phase 6/7. Per the contract I did NOT auto-accept baselines. The proposal's §"Test Approach" expressly anticipates this re-baseline. Codex should NOT flag the absence of new screenshots as a regression; it is a deferred orchestrator step.

2. **Dialog.Content + `asChild` + `m.div` interaction.** Radix Dialog.Content with `asChild` forwards refs and data-state attributes onto the m.div. I verified all 11 regression assertions still pass (testid, role=dialog, aria-labelledby/describedby live ids, close-button dismiss, dirty-draft AlertDialog gate). One concern Codex should sanity-check: whether the `data-state="closed"` exit phase still fires correctly post-migration. The CSS `kalori-log-content[data-state='closed']` exit animation is removed; Radix's default close behavior (instant unmount) is now what the user sees. If the orchestrator wants a fade-out on close, an `<AnimatePresence>` wrapper around `Dialog.Portal` would be the next step — out of scope for the proposal as written, but worth flagging.

3. **`y` (Framer composes via its own `transform`) vs the existing `transform: translate(-50%, -50%)` centering.** Framer Motion v12 composes its `y`/`x` translation into the same `transform` string as any author-set `transform`. I verified by inspection (and through the test that asserts the modal still renders without throwing) but Codex should confirm there is no visual centering glitch on the first frame at the mobile breakpoint. This is the highest-risk visual concern and the reason the proposal asked for re-baseline screenshots.

4. **Four orphaned `@keyframes` declarations remain in `app/globals.css`** (`kalori-log-enter-mobile`, `kalori-log-exit-mobile`, `kalori-log-enter-desktop`, `kalori-log-exit-desktop`). I left them in CSS rather than deleting because the reduced-motion audit's `enumerateKeyframesFromCss` enumerates and asserts every keyframe is suppressed under reduced motion — deleting them is fine, but doing so is technically a separate cosmetic cleanup. The audit currently passes (the wildcard `*` blanket in the reduced-motion media query covers them whether referenced or not). Codex may flag this as dead code — I deliberately left them to keep the diff minimal and let the orchestrator decide whether to GC them now or in a follow-up.

5. **Framer Motion bundle delta.** With `LazyMotion + domAnimation`, the initial bundle hit is ~4.6 KB gzipped per the spec / web-ui-guide. Recharts is already dynamic-imported so no chart route is touched. I did NOT run `pnpm check:bundle-budget` — the script would flag if the budget were blown. Codex should advise whether to run that script as part of Round 1 verification.

6. **The `tests/integration/reduced-motion-audit.test.ts` already enforces "any TSX importing framer-motion has a reduced-motion guard"** via `MOTION_LIBRARY_IMPORT_PATTERNS`. The audit explicitly recognizes `from 'framer-motion'`, so the consumers I added (`MotionProvider.tsx`, `WizardShell.tsx`, `LogFlowModal.tsx`) all have to satisfy the guard requirement — which they do via `useReducedMotion` and `useReducedMotionVariants`. Codex should confirm this audit ran green (it did, all 6 tests pass).
