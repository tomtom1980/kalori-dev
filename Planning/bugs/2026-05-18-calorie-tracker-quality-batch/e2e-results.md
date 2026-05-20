# Phase 7 UI/E2E Results

Timestamp: 2026-05-18T23:48:40.9063363+07:00

Browser path: Browser plugin not available in this session; used repo Playwright workflow via `pnpm exec playwright test`.

## Discovery

- Package manager: `pnpm@10.29.3`
- Main scripts: `test:e2e` -> `playwright test`; `test:a11y` -> Chromium library/dashboard a11y specs.
- Playwright config: `playwright.config.ts`
- Test dir/match: `./tests`, matching `e2e/**/*.spec.ts`, `axe/**/*.spec.ts`, `visual/**/*.spec.ts`
- Global setup: `./tests/e2e/fixtures/global-setup.ts`
- Projects: `chromium`, `webkit-ios`, `visual-baseline-chromium`, `visual-baseline-chromium-tablet`, `visual-baseline-chromium-mobile`, `visual-firefox`, `visual-safari`
- Web server: `pnpm dev` at configured `BASE_URL`, with `.env.test.local` injected into the spawned server env.

## Commands Run

| Command | Result | Coverage |
|---|---:|---|
| `pnpm exec playwright test --project=chromium tests/e2e/progress-render.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/web/dashboard-a11y.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-open-empty.spec.ts` | Failed | Focused Chromium E2E for progress render placeholders, weight flow, dashboard accessibility, log flow/library loading, and library empty state |
| `pnpm exec playwright test --project=visual-baseline-chromium tests/visual/weight.spec.ts tests/visual/progress.spec.ts tests/visual/dashboard.spec.ts tests/visual/log-confirmation.spec.ts tests/visual/library.spec.ts` | Failed | Desktop visual baselines for weight, progress, dashboard, log confirmation, and library |

## Functional E2E Results

Summary: 13 tests total, 2 passed, 4 skipped, 7 failed.

Passed:
- `tests/e2e/weight-log.spec.ts` -> weight entry, weight history, scoped axe check, dashboard nudge soft path.
- `tests/e2e/library/library-open-empty.spec.ts` -> empty library toolbar/Add Item entry point.

Skipped:
- `tests/e2e/progress-render.spec.ts` has 4 `test.fixme` placeholders for `@F-TEST-4`.

Failed:
- `tests/e2e/web/dashboard-a11y.spec.ts` AC1 and AC2 failed because `/dashboard` did not render expected dashboard UI.
- `tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts` AC1-AC5 failed at dashboard entry because `meal-add-breakfast` never rendered.

Primary blocker:
- The Next dev server raised `ProfileLookupError: profile lookup failed`.
- Underlying Supabase/Postgres error: `column profiles.ai_summary_opt_in does not exist` (`42703`).
- This blocked dashboard-dependent dashboard summary/accessibility and log-flow coverage. I did not bypass auth, schema, CAPTCHA, or permission behavior.

## Visual Results

Summary: 5 visual baseline tests total, 0 passed, 5 failed.

Backend-blocked visual failures:
- `tests/visual/dashboard.spec.ts` rendered an 800px error/blocked page instead of the full dashboard baseline.
- `tests/visual/progress.spec.ts` rendered an 800px error/blocked page instead of the full progress baseline.
- Both showed the same missing `profiles.ai_summary_opt_in` column blocker.

Rendered UI visual diffs:
- `tests/visual/weight.spec.ts`: reached `/weight`, but screenshot differed from baseline; expected `1280x800`, received `1280x808`, diff ratio about `0.02`.
- `tests/visual/library.spec.ts`: reached `/library`, but screenshot differed from baseline; expected `1280x1100`, received `1280x1123`, diff ratio about `0.05`.
- `tests/visual/log-confirmation.spec.ts`: reached log confirmation surface, but screenshot differed from baseline; diff ratio about `0.01`.

Generated artifacts:
- Playwright wrote failure artifacts under `test-results/` and updated/created the HTML report under `playwright-report/`.
- These paths are ignored by git in this repo; `git status --short -- test-results playwright-report planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch` showed no tracked changes from those generated artifacts before this report/state update.

## Coverage Notes

- Progress render/ranges: only existing Playwright coverage is currently skipped via `test.fixme`; visual progress was attempted and blocked by backend schema.
- Weight: functional E2E passed; visual baseline failed due screenshot drift.
- Dashboard summary/accessibility: attempted; blocked by missing backend column before dashboard UI rendered.
- Log flow/photo/time: `US-ADDFOOD-1` attempted including Snap tab coverage, but dashboard entry was blocked by the same backend column; log-confirmation visual reached UI but failed baseline drift.
- Library loading states: Add Food library loading path blocked by dashboard entry; `/library` empty-state E2E passed; library visual failed baseline drift.
- Charts/heatmap popovers: no narrower Playwright spec found for heatmap popovers; progress visual attempted but blocked by backend schema. Component/unit coverage for heatmap was already part of the green unit suite reported by Phase 6.

## Phase 7 Status

Status: blocker fixed in follow-up; visual baseline drift still unresolved.

Blockers:
- Resolved follow-up: test/pre-0025 Supabase schemas missing `profiles.ai_summary_opt_in` no longer block authed dashboard/progress/settings routes.
- Visual baselines for weight, library, and log-confirmation are stale or legitimately detecting rendered drift; no baseline updates were made.

## E2E Blocker Fix Addendum - 2026-05-18T23:54:00+07:00

### Blocker

- Phase 7 authed dashboard/progress/settings paths crashed with `ProfileLookupError`.
- Supabase returned `42703` because `profiles.ai_summary_opt_in` did not exist on pre-0025 schemas.

### Fix Applied

- Added a narrow compatibility retry in `lib/auth/orphan-profile-fence.ts` for only the missing `profiles.ai_summary_opt_in` `42703` case.
- The retry removes only `ai_summary_opt_in` from the profile select and injects `ai_summary_opt_in: false` into the returned profile.
- Other profile lookup errors still fail closed through the existing `ProfileLookupError` / `profile_lookup_unavailable` paths.
- `supabase/migrations/0025_ai_summary_opt_in.sql` remains the production schema fix and still must ship with this batch.

### Verification

- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/auth/orphan-profile-fence-status.test.ts tests/integration/ai-nutrition-summary.test.ts tests/unit/settings/page.test.tsx tests/integration/progress-page-profile-lookup-guard.test.ts tests/integration/dashboard-page-onboarding-guard.test.ts` -> 5 files / 29 tests passed.
- PASS: `pnpm typecheck`
- PASS: `pnpm lint` -> 0 errors, 42 pre-existing warnings.
- PASS: focused Playwright golden-path/progress command -> 1 passed, 4 skipped.

## Phase 7 Focused UI/E2E Rerun After Schema Fallback - 2026-05-19T00:02:14+07:00

Commands rerun without visual baseline updates:

| Command | Exit | Result |
|---|---:|---|
| `pnpm exec playwright test --project=chromium tests/e2e/progress-render.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/web/dashboard-a11y.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-open-empty.spec.ts` | 1 | 13 tests: 7 passed, 4 skipped, 2 failed |
| `pnpm exec playwright test --project=visual-baseline-chromium tests/visual/weight.spec.ts tests/visual/progress.spec.ts tests/visual/dashboard.spec.ts tests/visual/log-confirmation.spec.ts tests/visual/library.spec.ts` | 1 | 5 tests: 0 passed, 0 skipped, 5 failed |

Functional E2E remaining failures:

- `tests/e2e/web/dashboard-a11y.spec.ts` AC1 `axe-zero-violations after Tabx8 + chart hover`: axe color-contrast violation on `meal-add-breakfast`, `meal-add-lunch`, `meal-add-dinner`, `meal-add-snack`, `meal-add-drink`, and the Editor's Note label. Reported contrast: foreground `#a13a2c` on background `#0e0a08`, ratio `2.96`, expected `4.5:1`.
- `tests/e2e/web/dashboard-a11y.spec.ts` AC2 `ivory focus ring on every interactive dashboard element`: 12 dashboard focus stops did not render the expected ivory focus ring. Affected stops include `dashboard-date-input`, `View as data table`, meal add buttons, and water controls.

Functional E2E skipped:

- `tests/e2e/progress-render.spec.ts`: 4 existing `test.fixme` placeholders.

Visual baseline remaining failures:

- `tests/visual/log-confirmation.spec.ts`: `log-confirmation.png` differed by `3434` pixels, ratio `0.01`.
- `tests/visual/library.spec.ts`: expected `1280x1100`, received `1280x1123`; `58286` pixels differed, ratio `0.05`.
- `tests/visual/dashboard.spec.ts`: expected `1280x1864`, received `1280x1880`; `61010` pixels differed, ratio `0.03`.
- `tests/visual/progress.spec.ts`: expected `1280x3325`, received `1280x3471`; `244897` pixels differed, ratio `0.06`.
- `tests/visual/weight.spec.ts`: expected `1280x800`, received `1280x808`; `10459` pixels differed, ratio `0.02`.

Non-visual blocker assessment:

- No auth/schema blocker observed in this rerun. Dashboard/progress routes rendered far enough for a11y and visual assertions.
- Remaining non-visual blocker: dashboard accessibility/focus styling failures in `dashboard-a11y.spec.ts`.
- Visual baselines still fail due screenshot drift; no `--update-snapshots` or baseline update command was run.

Generated logs:

- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/phase7-focused-chromium-rerun.log`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/phase7-visual-baseline-rerun.log`

## Copied Old-Batch Focused Rerun Notes - 2026-05-19T00:20:00+07:00

Source copied from `planning/bugs/2026-05-18-1328-calorie-tracker-fixes/e2e-results.md` before restoring accidental old-batch worktree doc edits.

### Dashboard A11y Repair

- PASS: `pnpm exec playwright test --project=chromium tests/e2e/web/dashboard-a11y.spec.ts --reporter=line` -> 2 passed.
- PASS: affected Vitest batch -> 6 files / 69 tests passed.
- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` -> 0 errors, 42 existing warnings.

### Final Focused Chromium E2E Rerun

- FAILED: `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts tests/e2e/web/dashboard-a11y.spec.ts --reporter=line`
- Result: 34 tests executed; 22 passed, 11 skipped, 1 failed.
- Failure: `tests/e2e/library/library-quick-action-menu.spec.ts` -> `Edit option navigates to /library/[id]?mode=edit`.
- Reason: after clicking the Edit option, the page stayed at `http://localhost:3000/library` instead of navigating to `/library/<id>?mode=edit`.
- Dashboard a11y coverage in this focused run: both dashboard a11y tests passed.

### Visual Baseline Command

- FAILED: `pnpm exec playwright test --project=visual-baseline-chromium --project=visual-baseline-chromium-tablet --project=visual-baseline-chromium-mobile --reporter=line`
- Result: 81 tests executed; 46 passed, 35 failed.
- Baselines updated: 0. No `--update-snapshots` flag was used.
- Screenshot diffs: 15 failures across dashboard, library, log-confirmation, progress, water FAB toast, and weight.
- Auth-rate blockers: 20 failures reported `Auth fixture: signInWithPassword failed: Request rate limit reached`, mostly on mobile visual-baseline variants.

### Current Blockers From Copied Notes

- Non-visual blocker: library quick-action Edit menu no longer navigates to `/library/<id>?mode=edit` in the focused Chromium rerun.
- Visual blocker: visual baselines are red, with screenshot diffs plus auth rate-limit failures.

## Library Quick-Action Navigation Rerun - 2026-05-19T00:24:00+07:00

### Targeted Component Coverage

- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/components/library/LibraryClient.quick-actions.test.tsx`
- Result: 1 file passed; 11 tests passed.

### Focused Playwright Spec

- PASS: `pnpm exec playwright test --project=chromium tests/e2e/library/library-quick-action-menu.spec.ts --reporter=line`
- Result: 2 tests passed.
- Coverage: the Edit option successfully navigated to `/library/<id>?mode=edit`.

### Exact Wider Focused Chromium Rerun

- PASS: `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts tests/e2e/web/dashboard-a11y.spec.ts --reporter=line`
- Result: 34 tests executed; 23 passed, 11 skipped, 0 failed.
- The previously copied failure in `library-quick-action-menu.spec.ts` did not reproduce in the current working tree.

### Static Verification

- PASS: `pnpm typecheck`.
- PASS: `pnpm lint` -> 0 errors, 42 existing warnings.

### Status

- Non-visual blocker resolved in the current working tree by verification; no production code patch was applied because both the isolated spec and the exact wider failing command are green.
- Visual baseline blocker remains outside this non-visual navigation follow-up.

## Final Pre-Package Focused Non-Visual E2E - 2026-05-19T00:36:00+07:00

No visual projects were run. No `--update-snapshots` or visual baseline update command was run.

### Command

```text
pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line
```

### Result

- Exit code: `0`.
- Summary: `32 tests executed; 21 passed, 11 skipped, 0 failed`.
- No auth, schema, CAPTCHA, 2FA, or native prompt blocker was observed.

### Non-Failing Warnings Observed

- Next Image quality `72` not configured in `images.qualities [75]`.
- `DialogContent` missing `Description` or `aria-describedby`.
- `strokeDashoffset` received `NaN`.
- Mixed `textDecoration` shorthand and `textDecorationColor` style warning.
- One web server `ECONNRESET aborted` after test completion.

### Current E2E Blockers

- Non-visual: none observed in this focused rerun.
- Visual: not evaluated in this pass by request; previous visual drift notes remain separate.
