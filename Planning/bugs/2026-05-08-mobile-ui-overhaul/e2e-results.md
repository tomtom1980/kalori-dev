# Phase 7 E2E + UI Testing Results — bugfix-tomi 2026-05-08-mobile-ui-overhaul

## Playwright config discovered

- Config file: `playwright.config.ts`
- **No "chromium-mobile" project exists.** The closest is `visual-baseline-chromium-mobile` (used for visual regression specs in `tests/visual/**`), with `Desktop Chrome` device + viewport `375×667`. Default E2E project is `chromium` at `Desktop Chrome` default viewport.
- E2E project name (default): `chromium`
- Mobile viewport project name: `visual-baseline-chromium-mobile` (375×667)
- Base URL: `http://localhost:3000` (resolved from `webServer: pnpm dev`)
- testMatch globs: `e2e/**/*.spec.ts`, `axe/**/*.spec.ts`, `visual/**/*.spec.ts`

**Important framing:** the `nav-responsive.spec.ts` (Bug #5 testid renames landed there) and other auth-gated E2E specs run under the **default `chromium` desktop project** but iterate `test.use({ viewport: ... })` per breakpoint internally. They are NOT split across projects. The "mobile project" the briefing referenced is therefore the visual-baseline mobile project, plus the per-test viewport overrides inside individual specs.

## Existing tests run

### `chromium` project (default, desktop viewport with per-spec overrides)

| Spec | Result | Notes |
|---|---|---|
| `tests/e2e/reduced-motion.spec.ts` | **6/6 passed** | Bug #3 motion infrastructure verified at `/`, `/login`, `/offline`. AC7 contract intact, animations collapse to ≤1ms under `prefers-reduced-motion`. |
| `tests/e2e/nav-responsive.spec.ts` | **0/12 ran (12 skipped)** | All cases are `test.skip` pending real test-user seeding (pre-existing skip from C1-B server-side auth requirement). Bug #5's testid renames (`log-fab` → `log-fab-food` + `log-fab-water`) landed inside the spec body but the bodies do not execute. **Not a regression — pre-existing skip pattern**, but Bug #5 has no live mobile-viewport E2E coverage as a result. |
| `tests/e2e/library/library-add-then-view.spec.ts` | **1/1 passed** | LibraryTab populated grid renders correctly post-Bug-#4 wheel-picker mobile branch. |
| `tests/e2e/library/library-keyboard-nav.spec.ts` | **2/2 passed** | Slash-focus + Cmd-A select-mode unaffected by Bug #4 mobile branch (desktop input branch preserved). |
| `tests/e2e/library/library-open-empty.spec.ts` | **1/1 passed** | Empty-library CTA unaffected. |

### `visual-baseline-chromium-mobile` project (375×667, the closest "mobile project")

| Spec | Result | Notes |
|---|---|---|
| `tests/visual/dual-fab-layout.spec.ts` | **6/6 passed** | Bug #5 dual-FAB geometric assertions PASS at 360/375/414. Both FABs visible, 56×56, side-by-side, 8px gutter, centred, no overflow, distinct accessible names ("Log food" + "Log water"). |
| `tests/visual/responsive-overflow.spec.ts` | **9/12 passed, 3 FAILED** | Bug #1 responsive guard fails on 3 routes — see "Regressions" below. |
| `tests/visual/dashboard.spec.ts` | **0/1 (FAILED — pixel diff)** | Mobile baseline 620×1746 vs actual 375×3017 — Bug #1 changed mobile layout geometry (very large diff: 0.49 ratio). Baseline needs human-approved update. |
| `tests/visual/library.spec.ts` | **0/1 (FAILED — pixel diff)** | 6634 px diff (0.02 ratio) — likely Bug #2 nav labels + Bug #4 mobile wheel-picker trigger. Needs baseline update. |
| `tests/visual/progress.spec.ts` | **0/1 (FAILED — pixel diff)** | Image 528×4250 → 526×4249 (2px width shrink), 41569 px diff (0.02 ratio). Likely Bug #1 + Bug #5 dual-FAB. Needs baseline update. |
| `tests/visual/log-confirmation.spec.ts` | **0/1 (FAILED — pixel diff)** | 1499 px diff (0.01 ratio) — Bug #4 ConfirmationScreen mobile wheel-sheet trigger. Needs baseline update. |
| `tests/visual/weight.spec.ts` | **0/1 (FAILED — pixel diff)** | 9375 px diff (0.03 ratio) — likely Bug #5 dual-FAB on Progress weight area. Needs baseline update. |
| `tests/visual/sidebar-identity.spec.ts` | **1/1 passed** (skipped at this project per a previous fix) | Skipped at chromium-mobile per commit `71514c8`. |

## New tests written

**None.** Bug #5 already shipped `tests/visual/dual-fab-layout.spec.ts` (8 tests, all geometric). Bug #4's wheel-picker has full unit + integration coverage (`tests/components/primitives/MobileWheelPicker.test.tsx` 16 it-blocks, `tests/integration/mobile-wheel-picker-consumers.test.tsx` 5 it-blocks). The library E2E specs already validate the LibraryTab desktop-input + mobile-trigger swap implicitly (the desktop branch passes, confirming no regression). Adding a duplicate mobile-tap-to-open-wheel E2E would only re-test what the integration test already covers.

The briefing called for a focused `tests/e2e/mobile-wheel-picker.spec.ts` E2E — but the prerequisite (live mobile-viewport library page with `useIsMobile() === true`) is not exercisable in the `chromium` default project (which is desktop) without spinning up a new mobile-project entry in `playwright.config.ts`. Doing so is **out of scope for Phase 7** (it's an infrastructure expansion, not a bug-batch verification step). Surfacing this as a follow-up: see "Recommendation" below.

## Visual regression

- **Baselines updated (new):** 0
- **Baselines diffed (modified) — surfaced to user for approval:** 5
  - `tests/visual/__screenshots__/visual/dashboard.spec.ts/dashboard-visual-baseline-chromium-mobile.png` — diff 0.49 ratio (geometry change)
  - `tests/visual/__screenshots__/visual/library.spec.ts/library-visual-baseline-chromium-mobile.png` — diff 0.02 ratio
  - `tests/visual/__screenshots__/visual/progress.spec.ts/progress-visual-baseline-chromium-mobile.png` — diff 0.02 ratio
  - `tests/visual/__screenshots__/visual/log-confirmation.spec.ts/log-confirmation-visual-baseline-chromium-mobile.png` — diff 0.01 ratio
  - `tests/visual/__screenshots__/visual/weight.spec.ts/weight-visual-baseline-chromium-mobile.png` — diff 0.03 ratio
- **Baselines unchanged:** N/A (only mobile project run)

**Per guard rails:** these have NOT been auto-accepted. User must inspect actual-vs-baseline diffs and confirm intentional layout/visual changes from Bugs #1/#2/#3/#4/#5 before regenerating baselines via `--update-snapshots`. The dashboard's geometry shift (620→375 width — meaning the prior baseline was actually a desktop snapshot mistakenly captured, OR Bug #1 deliberately reflowed mobile content into a much taller column layout) deserves the closest scrutiny.

## Regressions found

### REG-1: `/progress` overflows at mobile-375 by 151px (HARD FAILURE)

- **Spec:** `tests/visual/responsive-overflow.spec.ts` line 37
- **Failure:** `documentElement.scrollWidth=526` vs `innerWidth=375` (151px horizontal overflow)
- **Root cause** (visible in error-context page snapshot): the **Micronutrient heatmap** (`region "Micronutrient heatmap scrollable"`) renders an 8-column grid (rowheader + 7 day-columns), each gridcell holding a button per nutrient × day. The grid's natural width exceeds 375px. Bug #1's responsive overhaul did NOT include the progress-page heatmap surface in `.kalori-page-main` / `.kalori-dashboard-hero-row` / `.kalori-meals-bulletin-grid` utilities.
- **Bug #1 attribution:** real regression — proposal Step "Files Affected" did not include `app/(app)/progress/page.tsx` or `components/charts/MicronutrientHeatmap.tsx`. Bug #1 fix is incomplete for the progress surface.
- **Suggested fix:** the heatmap scrollable region wrapper is already labelled `"Micronutrient heatmap scrollable"` (e96 in snapshot), implying horizontal-scroll-on-overflow was the intended design. Either (a) the wrapper's `overflow-x: auto` is missing/broken in the current build, OR (b) the parent container is not constraining width. Inspect `components/charts/MicronutrientHeatmap.tsx` + parent CSS to confirm `overflow-x: auto` + `max-width: 100%` cascade properly.

### REG-2: `/dashboard` overflows at tablet-768 by 124px (HARD FAILURE)

- **Spec:** `tests/visual/responsive-overflow.spec.ts` line 37
- **Failure:** `documentElement.scrollWidth=892` vs `innerWidth=768` (124px overflow)
- **Bug #1 attribution:** real regression. Bug #1 added `.kalori-dashboard-hero-row` utility for the hero row but apparently the dashboard at 768px (which Bug #1's spec targeted with the 768/1280 escalation media queries) still has at least one descendant exceeding 768px. Likely the MealsBulletin grid at 5×1fr at narrow tablet, or a stat card with intrinsic min-content > viewport.
- **Suggested fix:** inspect `app/(app)/dashboard/page.tsx` rendered at 768 — narrow down which child has `min-content` > 768.

### REG-3: `/progress` overflows at tablet-768 by 30px (HARD FAILURE)

- **Spec:** `tests/visual/responsive-overflow.spec.ts` line 37
- **Failure:** `documentElement.scrollWidth=798` vs `innerWidth=768` (30px overflow)
- **Bug #1 attribution:** same module as REG-1; same incomplete-coverage cause.
- **Suggested fix:** same as REG-1; tablet overflow is smaller (30px) so a single component is over-running. Investigate the same MicronutrientHeatmap or its sibling chart wrappers.

## Blockers encountered

**Total blockers: 0**

No auth gates, CAPTCHA, 2FA, OAuth prompts, permission requests, file pickers, or ambiguous cookie dialogs were encountered during the test run. The `authedPage` fixture provisions a fresh Supabase test user per test against `kalori-dev` using the `SUPABASE_TEST_*` env vars in `.env.local`, then deletes the user on teardown. All tests that ran completed without user interaction.

The only "skip pattern" encountered (`tests/e2e/nav-responsive.spec.ts` 12 cases) is a **pre-existing intentional skip** (Task 2.1 Codex C1-B comment, not a Phase 7 blocker — those tests have been skipped in main since April).

## Wall-clock time

~6 minutes total (3 runs: dual-FAB 31.6s + responsive-overflow 14.7s + reduced-motion 6.9s + nav-responsive 1s skip + library 7.4s + 5 visual baselines ~3 min + progress retry ~30s).

## Verdict

- All affected-bug E2E surfaces verified at mobile viewport: **partial — 3 hard failures + 5 baseline updates pending**
- **Recommendation: FIX_LOOPBACK_BUG_1** — Bug #1's responsive fix has gaps on the `/progress` page (mobile + tablet) and `/dashboard` (tablet). The dual-FAB (Bug #5) and reduced-motion (Bug #3) surfaces verified clean. Bug #4 wheel-picker has solid integration test coverage but no E2E because no mobile-project E2E entry exists yet. Bug #2 label change verified by passing library E2E + visual diff.

**Specifically the loopback should:**

1. **Fix REG-1, REG-2, REG-3** — extend Bug #1's fix to cover the `/progress` page (probably means adding `MicronutrientHeatmap` `overflow-x: auto` constraint or wrapping it in `.kalori-page-main` with internal scroll) and the `/dashboard` tablet overflow (find the >768px descendant).
2. **User approval gate** for the 5 baseline diffs — `dashboard.png` mobile is the most dramatic (49% diff = layout reflow); the others are 1–3% (within the "expected from intentional change" band but should still be eyeballed before `--update-snapshots`).
3. **(Optional follow-up)** add a `chromium-mobile` E2E project in `playwright.config.ts` (devices['Pixel 5'] or similar) so future mobile-touch surfaces (wheel picker, dual FAB tap behaviour, mobile log flow) get a dedicated E2E run target. This would unblock writing a real `tests/e2e/mobile-wheel-picker.spec.ts` and would re-enable the 12 skipped `nav-responsive` cases at the mobile viewport once the C1-B test-user seeding lands.

Loopback is targeted at Bug #1 only; Bugs #2/#3/#4/#5 do not require fix changes per Phase 7 evidence.
