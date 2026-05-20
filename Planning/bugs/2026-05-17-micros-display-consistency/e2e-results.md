# Phase 7 — E2E + Visual Regression Sub-Agent Report

**Batch:** `2026-05-17-micros-display-consistency`
**Date:** 2026-05-17
**Status:** HALT — recommend SKIP visual refresh, advance to Phase 8

---

## 1. Surfaces in Scope

Per briefing, this batch is UI-touching across three surfaces:
- **Surface A** — Dashboard `MicronutrientPanel` (RDA-unknown rows now render with neutral 'unknown' status: em-dash label, no oxblood red, distinct aria copy)
- **Surface B** — `ConfirmationItemMicros` (inputs sorted desc by %RDA, order frozen at mount via lazy `useState`)
- **Surface C** — Library `MicrosReadOnly` / `FoodDetailMacros` (sorted desc by %RDA, <1% filtered, sugar/sodium carve-out removed)

## 2. Specs Audited

| Spec | Captures | Affected by this batch? |
|---|---|---|
| `tests/visual/dashboard.spec.ts` | Empty-state authed dashboard (fullPage) | NO — empty-state renders MicronutrientPanel's "nothing to audit yet" placeholder, NOT the RDA-unknown rows. The R1 C1 inclusion change only affects pages with actual consumption. |
| `tests/visual/library.spec.ts` | Library GRID with 3 seeded items (fullPage) | NO — captures grid view; does not open FoodDetail modal, so `MicrosReadOnly` is not rendered. |
| `tests/visual/log-confirmation.spec.ts` | `/log?tab=library` landing page (fullPage) | NO — captures `/log` landing only; does not exercise AI confirmation flow, so `ConfirmationItemMicros` is not rendered. |
| `tests/visual/water-fab-toast.spec.ts` | Mobile water FAB → undo toast (viewport, 375×667) | NO — captures FAB region; MicronutrientPanel not in viewport at this breakpoint. |
| `tests/visual/progress.spec.ts` | Progress page (fullPage) | NO — does not render micros at all. |

**No visual baseline in this repo currently captures any of the three surfaces touched by this batch.** That is why Surfaces A/B/C are covered by component-level Vitest + Testing-Library tests (the 12 new test files listed in `state.md`), not visual regression.

## 3. Execution Results

Ran sequential visual baseline checks across all desktop + tablet + mobile projects for the suspect specs:

### Dashboard (`tests/visual/dashboard.spec.ts`)
- `visual-baseline-chromium` (desktop): **FAILED** — `Expected 1280x1864, received 1280x1880` (+16 px, 0.01 diff ratio)
- `visual-baseline-chromium-tablet`: **FAILED** — same +16 px pattern
- `visual-baseline-chromium-mobile`: **FAILED** — same +16 px pattern

### Library (`tests/visual/library.spec.ts`)
- `visual-baseline-chromium` (desktop): **FAILED** — `Expected 1280x1100, received 1280x1116` (+16 px, 0.02 diff ratio)

### Progress (`tests/visual/progress.spec.ts`)
- `visual-baseline-chromium` (desktop): **FAILED** — `Expected 1280x3325, received 1280x3341` (+16 px, 0.01 diff ratio)

### Water FAB toast (`tests/visual/water-fab-toast.spec.ts`)
- `visual-baseline-chromium-mobile`: **FAILED** (2 tests: default + reduced-motion) — diff image shows complete mobile UI shift: bottom-tab-bar now renders icons-above-labels, FAB position changed.

### Log confirmation (`tests/visual/log-confirmation.spec.ts`)
- `visual-baseline-chromium`: **PASSED**

## 4. Root-Cause Diagnosis

The +16 px on every fullPage spec + the bottom-tab-bar layout shift on mobile specs are **pre-existing visual drift NOT caused by this batch**:

- **`dda828e`** (2026-05-17 04:11) — `feat: bottom-tab-bar — render lucide icon above label (ui-design §6.4)` — adds icon column to mobile bottom-tab-bar
- **`cf24019`** (2026-05-17 14:25) — `feat(nav): enlarge mobile bottom bar` — adjusts mobile bottom-bar palette/height
- **`49c6db5`** (2026-05-16 23:54) — `[Minor] fix: desktop sidebar sticky positioning` — desktop sidebar position:sticky + height:100vh
- **`07273a3`** (last visual-baseline refresh commit) — refreshed mobile-bottom-nav baselines for some specs but missed dashboard/library/progress/water-fab-toast

These commits ship between the last visual-baseline refresh (`07273a3`, `8722c3b`) and HEAD without their own visual-baseline updates. The +16 px is a consistent symmetric layout shift across all fullPage specs (likely the bottom-page footer / safe-area / sidebar height-100vh side-effect).

**Confirmation that this batch did not cause the drift:**
1. The dashboard empty-state snapshot renders "MINOR ELEMENTS — nothing to audit yet" — the `MicronutrientPanel` shows the empty-state placeholder, NOT the new RDA-unknown rows. So the R1 C1 / R2 I2 changes are invisible in this baseline.
2. Library grid snapshot does NOT open `FoodDetail` — `MicrosReadOnly` never renders.
3. Log-confirmation snapshot does NOT exercise AI flow — `ConfirmationItemMicros` never renders.
4. Progress page has nothing to do with micros at all.
5. Water-FAB-toast diff shows mobile bottom-bar icon-above-label drift — exactly `dda828e`/`cf24019` territory.

May 16 9:29p memory observation already flagged "11 baseline failures across dashboard and UI components" — this is that pre-existing backlog.

## 5. Refresh Action — Reverted

I initially ran `--update-snapshots` on the 3 dashboard projects (chromium/tablet/mobile) before completing the diagnosis. After confirming the diffs were NOT caused by this batch's code (MicronutrientPanel renders empty-state placeholder, not the touched RDA-unknown branch), I reverted those refreshes via `git checkout HEAD -- tests/visual/__screenshots__/visual/dashboard.spec.ts/`.

**Refreshed baselines staged for commit: NONE.**
**Tree state for visual screenshots: clean (matches HEAD).**

## 6. Functional E2E

No functional E2E specs in this repo test the three touched surfaces' display-rule behaviour:
- All `tests/e2e/web/user-stories/*` specs are scoped to specific user-story bundles (A1, A2, A-bundled, B-bundled, etc.) — none exercise micro-nutrient sort/filter rules.
- `tests/e2e/library/*` specs test library CRUD + a11y + thumbnails — none open FoodDetail to inspect MicrosReadOnly ordering.
- `tests/e2e/copy-yesterday.spec.ts`, `tests/e2e/dedup-prompt.spec.ts`, `tests/e2e/undo-toast.spec.ts` etc. — orthogonal.

The 12 new component-level Vitest + Testing-Library tests already cover the display rules deterministically:
- `tests/unit/lib/nutrition/display-micros.sort-filter.test.ts` (13 helper tests)
- `tests/unit/components/log-flow/ConfirmationItemMicros.sort.test.tsx` (5 tests inc. freeze-at-mount regression)
- `tests/components/library/FoodDetailMacros.test.tsx` (5 new Bug 1 tests + 3 rewrites)
- `tests/unit/lib/dashboard/aggregate-micros-canonical.test.ts` (2 new R1 C1 dashboard inclusion tests)
- `tests/unit/lib/dashboard/aggregate-micros-rda-unknown.test.ts` (3 R2 I2 tests)
- `tests/unit/components/dashboard/MicronutrientPanel.rda-unknown.test.tsx` (7 R2 I2 tests)

All 30+ tests across these 6 files are GREEN per Phase 5 state.md notes.

## 7. Blockers Encountered

None. Pre-existing visual drift is a project-wide backlog item that should be cleaned in a dedicated rebaseline batch (or by amending the `07273a3` mobile-bottom-nav batch's coverage). It is **not appropriate to address inside this batch's commit** — doing so would conflate this batch's surgical display-rule changes with unrelated layout drift, and would prevent the next batch from spotting genuine regressions on the affected surfaces.

## 8. Working-Tree Observation (concurrent-session debris)

52 changed files in working tree:
- **20 belong to this batch** (15 modified + 5 untracked test files per security-review.md scope)
- **32 are concurrent-session debris** (sibling `tests/screenshots/user-stories/*` PNGs from a parallel session — `useFoodDetailEdit.ts`-flavour changes per state.md `concurrent_session_observations`)

Phase 8 commit MUST use explicit-path staging per security-review.md scope list. Do NOT use `git add -A` / `git add .`.

## 9. Recommendation

**Advance to Phase 8.**

Rationale:
- Visual baselines DO fail, but those failures pre-date this batch and reflect uncovered drift from commits `dda828e`/`cf24019`/`49c6db5`.
- The three touched surfaces (A/B/C) are not captured by any visual baseline.
- Component-level Vitest tests already provide complete coverage of the display-rule contract (30+ tests, all green).
- Refreshing unrelated baselines as part of this batch would conflate scope and mask genuine regressions next time.

Action for Phase 8:
1. Commit ONLY the 20 batch files (security-review.md scope list).
2. Open a tracked follow-up in `Planning/followups.md`: "Refresh visual baselines for dashboard/library/progress/water-fab-toast — pre-existing +16px drift from commits `dda828e`/`cf24019`/`49c6db5` not baselined."
3. Do NOT stash@{0} touch.

## 10. Snapshot Files Staged for Commit

NONE.
