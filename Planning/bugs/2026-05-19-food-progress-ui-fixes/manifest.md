# Bugfix Manifest: 2026-05-19 Food/Progress UI Fixes

Batch: `2026-05-19-food-progress-ui-fixes`
Project: `kalori`
Started: `2026-05-19T08:16:25Z`
Final state: `ready_for_docs_commit`

## Summary

All 9 approved bugs were implemented. The final release-readiness gate is PASS with documented exclusions: deterministic code gates, full Vitest, accessibility, schema drift, bundle budget, and focused deterministic Playwright subsets passed. Full Playwright matrix and repo-wide format check were excluded from the final gate for documented infrastructure/repo-wide drift reasons.

## Bugs Fixed

### Bug 1 - Image recognition no-food state

- Fixed no-food Gemini/image responses so the API returns `reason: 'no_food'` and the Snap UI shows a no-food path instead of manual detail fallback fields.
- Added `Try Photo Again` reset behavior and `Add food item` handoff to the no-photo Add Food AI description flow.
- Tests: `ai-vision.test.ts`, `SnapTab-thumbnail-upload.test.tsx`, plus log-flow fallback/vision refresh regressions.
- Residual risk: happy-dom teardown noise was observed after passing runs, but assertions passed with exit code 0.

### Bug 2 - Progress/Dashboard data tables and recommendations

- Fixed shared data tables with sticky opaque headers, keyboard-clickable sortable header buttons, and `aria-sort`.
- Improved micronutrient heatmap/dashboard ordering so failing and worst-first nutrients surface before good or RDA-unknown rows.
- Improved AI nutrition-summary prompt/fallback to include concrete progress facts and next actions.
- Tests: `DataTableDrawer.test.tsx`, `MicronutrientHeatmap.test.tsx`, progress/dashboard aggregation tests, and `ai-nutrition-summary.test.ts`.
- Residual risk: unit/component tests cover structure and ordering; browser paint was covered by later focused E2E/visual sweeps.

### Bug 3 - Progress custom range calendar apply flow

- Changed `Custom` range selection to open the existing inline popover editor without immediate navigation.
- Applying a valid custom range writes `range=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` with `router.replace(..., { scroll: false })`.
- Client validation blocks invalid dates, start-after-end, future end dates, and ranges over 365 days.
- Tests: `ProgressRangeToolbar.test.tsx`; focused E2E confirmed URL application.

### Bug 4 - iPad pull-down does not refresh

- Added a touch-event pull-to-refresh client island mounted from `NavShell`.
- Refresh triggers only for one-finger, mostly vertical downward pulls at document top.
- Gesture handling ignores controls, dialogs/portals, horizontal scroll containers, scrolled pages, multi-touch, and below-threshold gestures.
- Tests: `nav-shell.test.tsx`; tablet Playwright smoke confirmed a refresh request count increase.
- Residual risk: physical iPad Safari/PWA behavior still benefits from manual device validation.

### Bug 5 - Future-date validation hidden by the food log calendar

- Moved future/outside-window validation text before the datetime input so the red error is visible instead of hidden by the picker area.
- Kept the informational hint below the input and retained `aria-describedby` linkage.
- Tests: `ConfirmationScreen.test.tsx`; focused E2E confirmed `aria-invalid=true` and visible hint near the When field.

### Bug 6 - Parsed-food remove button placement

- Moved the parsed-food remove button to the final direct control position in each confirmation row.
- Added a final grid column for the remove action on desktop and compact layouts.
- Tests: `ConfirmationScreen.test.tsx` asserts the remove button is the final row control.
- Residual risk: low; behavior handlers were unchanged.

### Bug 7 - Approximate grams display

- Removed item-confidence gating from `shouldDisplayApproxGrams`; sanity bounds and gram-unit suppression remain.
- Kept save-to-library metadata enrichment aligned with the UI display helper.
- Updated text and vision prompt contracts to request plausible approximate grams.
- Tests: `ConfirmationScreen.test.tsx`, `prompts-approx-grams.test.ts`, and related portion sanity tests.

### Bug 8 - English unit normalization

- Added deterministic localized unit alias normalization in the shared portion sanity helper.
- Covered Vietnamese and Hungarian aliases, including diacritic forms, while preserving already-English units.
- Prompt contracts now require English `unit` labels and forbid localized unit words.
- Tests: `portion-sanity.test.ts`, `prompts-approx-grams.test.ts`.
- Residual risk: medium; uncommon localized units outside the alias map may still need future additions.

### Bug 9 - Progress weight/date field alignment

- Added an explicit responsive grid alignment contract for progress inline weight/date/save controls.
- Weight and date controls share 52px minimum height and border-box sizing.
- Codex Round 1 identified a narrow-screen overflow risk; the grid was updated to collapse to one column with a full-width submit button.
- Tests: `weight-quick-add.test.tsx`, focused component suites, and focused visual/E2E alignment checks.

## Review Summary

### Codex

- Round 1: 0 Critical, 1 Improvement fixed, 0 Minor.
- Round 1 finding: weight/date/save grid could overflow narrow screens.
- Round 2: 0 Critical, 0 Improvement, 0 Minor.
- Tooling note: Codex companion script was unavailable at the expected path, so manual adversarial review was used.

### Security

- Status: `completed_with_fixes`.
- Critical: 0.
- High: 1 fixed. Alcohol aggregate output is now capped to database-safe bounds for `volume_ml` and `alcohol_grams`; the route-level `portion <= 100` guard was narrowed to alcoholic items only.
- Medium: 1 fixed. Dashboard/BAC timezone handling now normalizes invalid stored timezone values and falls back safely.
- Low/Informational: 0.
- Security refix verification passed focused alcohol/BAC suites and `pnpm typecheck`.

### E2E/UI

- Initial targeted smoke passed: no-food state, future-date validation, custom range apply, progress and dashboard data table sticky/sortable behavior, weight quick-add layout, and tablet pull-to-refresh simulation.
- Initial existing WebKit iOS calendar and visual-baseline specs failed, then final focused WebKit calendar and dashboard/progress visual subsets passed.
- Browser plugin was unavailable, so repo Playwright was used.

## Final Release Readiness

Passed final gate:

- `pnpm typecheck`
- `pnpm lint` with warnings
- `pnpm build`
- `pnpm test` - 426 files passed, 18 skipped; 3336 tests passed, 99 skipped
- `pnpm test:a11y`
- `pnpm schema-drift`
- `pnpm check:bundle-budget`
- Focused Chromium user-story/library/visual subsets
- Focused WebKit iOS calendar
- Focused dashboard/progress visual subsets

Documented exclusions:

- Full `pnpm test:e2e` was not rerun in the final gate. Batch state remains `passed_with_infra_exclusions` because broad full-matrix E2E is affected by Supabase auth rate limiting and missing local Firefox.
- Full `pnpm format:check` was not rerun in the final gate. Prior validation documented unrelated repo-wide Prettier drift.
- Working tree remained dirty with 203 changed entries and nothing staged during final readiness.

## Evidence Preserved

The complete batch evidence tree is preserved in this directory after docs handoff, including:

- `proposals/`
- `outputs/`
- `codex/`
- `security-review.md`
- `e2e-results.md`
- `validation-sweep.md`
- `final-validation.md`
- `release-readiness.md`
- `project-context.md`
- `lessons-relevant.md`
- `state.md`

## Release Notes

Release is defensible with the documented exclusions above. Commit preparation should account for the large dirty tree, generated service worker files, screenshot/visual evidence files, and any overlapping out-of-scope dirty changes noted in Codex Round 2.
