# Bug Bundle Manifest — 2026-05-08-mobile-ui-overhaul

**Started:** 2026-05-08T11:52:13Z
**Completed:** 2026-05-08T15:50:00Z
**Starting HEAD:** `a2e43530d3c0ff2c7ec6515a2afb0b069b177bcf`
**User decisions:** Force-include all 7 items; Bug #6 = Path A (fold into Bug #5); Bug #3 = approve high-risk in-batch; Bug #2 = label-only fix, icons deferred; Round 3 = explicit override.

## Per-bug detail

### Bug #1 — Mobile-responsive layout drift
- **Status:** implemented
- **Classification:** known_fix
- **Description:** App-wide mobile-responsive layout drift (dashboard hero rows + MealsBulletin grid + nav-shell padding); extended via Phase 7 regression-loopback to /progress + /dashboard tablet.
- **Files touched:**
  - `app/globals.css`
  - `app/(app)/dashboard/page.tsx`
  - `components/dashboard/MealsBulletin.tsx`
  - `components/nav/nav-shell.tsx`
  - `app/(app)/progress/page.tsx`
  - `components/charts/MicronutrientHeatmap.tsx`
  - `components/charts/LoggingConsistencyCalendar.tsx`
  - `components/charts/ChartCard.tsx`
  - `components/charts/ChronometerRing.tsx`
  - `app/(app)/progress/_components/ProgressRangeToolbar.tsx`
- **Tests added:**
  - `tests/unit/design-tokens/responsive-page-classes.test.ts`
  - `tests/unit/components/dashboard/MealsBulletin.responsive.test.tsx`
  - `tests/unit/app/dashboard-page-responsive.test.ts`
  - `tests/visual/responsive-overflow.spec.ts`
- **Codex findings:** clean R1, no R2 finding
- **Phase 7 regressions:** REG-1 (/progress mobile-375 — MicronutrientHeatmap 151px overflow) + REG-2 (/dashboard tablet-768 — 124px overflow) + REG-3 (/progress tablet-768 — 30px overflow) caught + fixed via min-width:0 cascade extending to /progress + /dashboard tablet
- **Risk:** low_medium
- **Final test count:** 12/12 responsive-overflow + 201/201 unit

### Bug #2 — Bottom nav labels
- **Status:** implemented
- **Classification:** known_fix
- **Description:** Bottom nav labels show abbreviated 'DASH/LIB/PROG/SET' instead of full UPPERCASE words per ui-design.md §6.4; rendered via existing textTransform:uppercase CSS; icon glyphs deferred per user decision.
- **Files touched:**
  - `lib/i18n/en.ts`
  - `tests/components/nav/bottom-tab-bar.test.tsx`
  - `tests/unit/i18n-shape.test.ts`
- **Tests added:**
  - `tests/components/nav/bottom-tab-bar.test.tsx` — 2 new it() blocks: full-word label rendering + textTransform uppercase guard
  - `tests/unit/i18n-shape.test.ts` — updated existing assertions from abbreviated → full-word values
- **Codex findings:** none
- **Risk:** low

### Bug #3 — Motion infrastructure
- **Status:** implemented
- **Classification:** known_fix (high-risk approved by user)
- **Description:** Motion infrastructure gap — framer-motion not installed, lib/motion/defaults.ts missing, 35+ animations were CSS @keyframes. User approved high-risk in-batch foundation work. Installed framer-motion@12.38.0 (sha-512 integrity verified); created LazyMotion + m + EASE_EDITORIAL + motionPresets + variants + useReducedMotionVariants foundation; wired MotionProvider into app/layout; migrated WizardShell + LogFlowModal from CSS @keyframes to m.* primitives.
- **Files touched:**
  - `package.json`
  - `pnpm-lock.yaml`
  - `lib/motion/defaults.ts`
  - `lib/motion/MotionProvider.tsx`
  - `app/layout.tsx`
  - `app/(app)/onboarding/_components/WizardShell.tsx`
  - `app/(app)/log/_components/LogFlowModal.tsx`
  - `app/globals.css`
- **Tests added:**
  - `tests/unit/lib/motion/defaults.test.ts`
  - `tests/unit/lib/motion/MotionProvider.test.tsx`
  - `tests/unit/app/onboarding/WizardShell-motion.test.tsx`
  - `tests/unit/app/log/LogFlowModal-motion.test.tsx`
- **Codex findings:**
  - C1 R1 (LogFlowModal centering element collided with animator transform-property) → auto-fixed R1 by splitting centering element from animator
  - I-R2-1 (in-app reduce-motion toggle gap — useReducedMotion only read OS pref) → auto-fixed R3 by extending wrapper to OR OS + `html[data-reduce-motion='1']` + `localStorage['kalori.reduce-motion']`
- **Risk:** high
- **Pending:** `useReducedMotionVariants` helper still uses raw framer-motion `useReducedMotion` hook (P2 — see pending findings)

### Bug #4 — Mobile wheel picker
- **Status:** implemented (resumed after Phase 3 truncation)
- **Classification:** known_fix (with design-doc edit)
- **Description:** Mobile selectors drift from native-feel; built hand-rolled MobileWheelPicker primitive on Framer Motion (depends on Bug #3); design-doc edit required (ui-design.md §4.1.10 + §10.6.1 + §13 tiebreaker #23).
- **Files touched:**
  - `Planning/ui-design.md` (§4.1.10 primitive entry + §10.6.1 a11y contract + §13 tiebreaker #23)
  - `lib/hooks/use-is-mobile.ts` (NEW)
  - `components/primitives/MobileWheelPicker.tsx` (NEW — 304 LoC primitive)
  - `components/primitives/MobileWheelSheet.tsx` (NEW — 206 LoC sheet wrapper)
  - `app/(app)/log/_components/ConfirmationScreen.tsx` (mobile viewport integration)
  - `app/(app)/log/_components/LibraryTab.tsx` (mobile viewport integration)
  - `app/globals.css`
- **Tests added:**
  - `tests/unit/lib/hooks/use-is-mobile.test.tsx`
  - `tests/components/primitives/MobileWheelPicker.test.tsx`
  - `tests/integration/mobile-wheel-picker-consumers.test.tsx`
- **Codex findings:**
  - C2 R1 (LibraryTab false-green — Sheet was set-state-only, never mounted) → auto-fixed R1 by mounting MobileWheelSheet at LibraryTab component root + strengthened integration test from presence-only to end-to-end commit
  - C-R2-1 (MobileWheelPicker boundary math — boundary rows 0.25, 0.5, 9.5, 9.75, 10 unreachable via touch-scroll) → auto-fixed R3 with padding spacers `(viewportHeight - rowHeight) / 2` + new index formula
  - I1 R1 (touch-scroll onChange missing) → auto-fixed R1 by wiring `handleScroll` onChange on touch-scroll with equality short-circuit to filter programmatic scrolls
- **Risk:** medium

### Bug #5 — Dual FAB
- **Status:** implemented
- **Classification:** known_fix (with design-doc edit)
- **Description:** Single-FAB pattern doesn't accommodate water-logging entry; built side-by-side dual FAB (food primary + water secondary, 8px gutter, 56×56 each, floating overlay at z-index 41); water FAB navigates to existing /dashboard WaterTracker per user Path A; design-doc edit required (ui-design.md §6.4 + §6.6 + §2.4 + tiebreaker #24).
- **Files touched:**
  - `Planning/ui-design.md` (§6.4 + §6.6 + §2.4 + tiebreaker #24)
  - `components/nav/log-fab.tsx` (variant prop added)
  - `components/nav/nav-shell.tsx` (dual-FAB host)
  - `lib/i18n/en.ts`
  - `tests/components/nav/log-fab.test.tsx` (12 new it() blocks across food/water variants)
  - `tests/components/nav/nav-shell.test.tsx` (4 new it() blocks: dual-FAB rendering, distinct accessible names, navigation contracts)
  - `tests/visual/dual-fab-layout.spec.ts` (NEW — 8 Playwright tests at 360/375/414, geometric assertions, no PNG baselines)
  - `tests/e2e/nav-responsive.spec.ts`
- **Decision:** Option A — water FAB onClick = `router.push('/dashboard')` (Sheet primitive doesn't exist; out of scope to build a new water-logging Sheet). bottom-tab-bar.tsx untouched (uses `repeat(4, 1fr)` — no fixed FAB slot to widen).
- **Codex findings:** clean
- **Risk:** medium

### Bug #6 — Water logging (DROPPED)
- **Status:** rejected
- **Classification:** out_of_scope
- **Drop reason:** duplicate — water-logging shipped end-to-end via Phase 3 Task 3.5 (commits `b529290`, `0321f01`, `c706d50`: water_log table + RLS, /api/water/log POST, dashboard WaterTracker chip). User chose Path A: Bug #5 water FAB navigates to existing WaterTracker, no new code path needed.

## Codex Round Summary
- **R1:** C2 + I1 + M0 → 3 file-scoped auto-fix sub-agents (LogFlowModal centering, LibraryTab false-green, MobileWheelPicker touch-scroll onChange wiring)
- **R2:** C1 + I1 + M0 → escalated to user (wheel boundary math + in-app reduce-motion toggle gap)
- **R3 (override):** both fixed via 2 file-scoped sub-agents (MobileWheelPicker boundary math + motion-defaults wrapper extension)

## Security Review
0 Critical / 0 High / 0 Medium / 4 Informational. Recommendation: **PROCEED**.
- LibraryTab mobile setQuantityNumber path lacks defense-in-depth `Number.isFinite && >0` guard (acceptable today via typed-generic)
- useIsMobile reads matchMedia locally only — no telemetry surface
- 2 pre-existing dependency advisories carry over (`tmp` low dev-only; `postcss` moderate transitive via next) — not introduced by this batch
- 4 orphaned `@keyframes` declarations remain in `globals.css` after Bug #3 migration (cleanup deferred for minimal diff)

framer-motion@12.38.0 supply chain clean (sha-512 integrity verified).

## E2E Phase 7
- **Total specs run:** 33
- **Passed:** 33
- **Intentional skips:** 12 (`tests/e2e/nav-responsive.spec.ts` — pre-existing C1-B server-side auth skip)
- **Regressions found:** 3 (REG-1 /progress mobile-375; REG-2 /dashboard tablet-768; REG-3 /progress tablet-768)
- **Regressions fixed:** 3 (Bug #1 loopback — min-width:0 cascade extension)
- **Baselines regenerated:** 5 mobile baselines auto-accepted and re-validated green (`dashboard`, `library`, `progress`, `log-confirmation`, `weight` at chromium-mobile)
- **Blockers encountered:** 0
- **Mobile project:** `visual-baseline-chromium-mobile` (375x667)

## Pending Minor Findings
- **codex_r3_followup (minor)** — `lib/motion/defaults.ts`: `useReducedMotionVariants` helper still uses raw framer-motion `useReducedMotion` hook because its 2 baseline tests invoke it outside a component body. Migrating to the wrapper would require refactoring those tests. P2 followup; user-facing reduce-motion behavior is correct because actual consumers (LogFlowModal, WizardShell, MobileWheel*) flow through the wrapper.
- **security_r1 (informational)** — `app/(app)/log/_components/LibraryTab.tsx`: Mobile setQuantityNumber path skips the `Number.isFinite && >0` guard the desktop branch has. Acceptable because MobileWheelPicker<T> is typed-generic over static options, but a 1-line defense-in-depth guard would survive future refactors loosening the typed-option contract.
- **security_r1 (informational)** — `lib/hooks/use-is-mobile.ts`: useIsMobile reads matchMedia locally only, no telemetry surface. Noted as informational for future review.
- **security_r1 (informational)** — package-tree: 2 pre-existing advisories carry over: `tmp` (low, dev-only via @lhci/cli) and `postcss` (moderate, transitive via next). Not introduced by this batch. Track on next dependency upgrade pass.
- **security_r1 (informational)** — `app/globals.css`: 4 orphaned `@keyframes` declarations remain after Bug #3 migration to Framer Motion. Cleanup deferred for minimal-diff. Future polish task: remove unreferenced @keyframes.
- **phase_7_baseline_regen (minor)** — `tests/e2e/library/library-visual.spec.ts-snapshots/empty-state-sm-390.png`: Library visual spec → empty-state-sm-390 baseline diffs (different chromium-project, baseline timestamp Apr 23, file path `tests/e2e/library/library-visual.spec.ts-snapshots/`). Outside auto-accept scope of mobile baseline regen — likely needs separate review or is pre-existing drift unrelated to this batch. Recommend follow-up baseline-approval gate or separate visual triage.
