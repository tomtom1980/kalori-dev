# Phase 7 E2E/UI Results: 2026-05-18-1328-calorie-tracker-fixes

## Browser Fallback Reason

Browser plugin not available. Used regular Playwright/repo scripts as the fallback path.

## Tests Run

### Playwright / E2E

- BLOCKED: `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line`
  - Result: no tests executed.
  - Reason: `http://localhost:3000 is already used`; Playwright config refuses `reuseExistingServer` when `.env.test.local` exists.
- BLOCKED: `$env:PORT='3100'; pnpm exec playwright test --project=chromium ... --reporter=line`
  - Result: no tests executed.
  - Reason: Next refused to start a second dev server for this project: existing `next dev` PID `97828` at `http://localhost:3000`.

### Targeted Vitest / Integration / Component / API

- PASS: `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/log/portion-unit.test.ts tests/unit/lib/library/create-schema.test.ts tests/unit/library/food-detail-edit-validation.test.ts tests/unit/log/confirmation-time-editor.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/components/log-flow/WhyTheseNumbers.test.tsx tests/unit/library/to-log-library-item.test.ts tests/components/library-tab-continue-cta.test.tsx tests/components/library/LibraryCard.test.tsx tests/components/library/FoodDetail.mode-edit-query.test.tsx tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/integration/weight-page-imperial-conversion.test.tsx tests/integration/ai-vision.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts tests/unit/lib/library/sketch-pipeline.test.ts tests/unit/api/library-sketch-generate.test.ts tests/unit/api/library-sketch-backfill.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/library-create.test.ts tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/integration/library-item-update.test.ts tests/unit/api/library-merge-micros-bound.test.ts`
  - Result: 24 files / 333 tests passed.

### Final Smoke

- PASS: `pnpm typecheck`
- PASS: `pnpm exec eslint "lib/log/portion-unit.ts" "app/(app)/log/_components/ConfirmationScreen.tsx" "app/(app)/log/_components/Confirmation/TimeEditor.tsx" "app/(app)/log/_components/WhyTheseNumbers.tsx" "app/(app)/log/_components/AddFoodTab/LibraryList.tsx" "app/(app)/library/_components/FoodDetail/FoodDetailName.tsx" "app/(app)/progress/page.tsx" "app/(app)/progress/_components/weight-quick-add.tsx" "components/charts/WeightTrajectoryLine.tsx" "components/charts/MicronutrientHeatmap.tsx" "components/charts/HeatmapInteractive.tsx" "app/api/ai/vision/route.ts" "lib/ai/image-analysis-quota.ts" "tests/unit/components/log-flow/ConfirmationScreen.test.tsx" "tests/components/progress/MicronutrientHeatmap.test.tsx" "tests/integration/ai-vision.test.ts"`

## Target Flow Coverage

1. Food logging quantity validation: covered by targeted unit/component/API tests; no browser E2E due Playwright blocker.
2. Future time UI/server copy: covered by targeted TimeEditor and ConfirmationScreen tests; existing C5 Playwright candidate was blocked before execution.
3. AI parsed food micronutrient details: covered by `WhyTheseNumbers` component tests; no browser E2E due blocker.
4. Library custom serving micronutrient scaling: covered by mapper and library-tab component tests; no browser E2E due blocker.
5. Approx grams display: covered by AI schema/prompt, library mapper, library card, food detail, and library-tab component tests; no browser E2E due blocker.
6. Library unit edit dropdown egg-option behavior: covered by FoodDetail component tests; no browser E2E due blocker.
7. Progress kg/lb switch: covered by chart, quick-add, and integration tests; no browser E2E due blocker.
8. Image analysis quota: covered by integration/API/unit tests from previous phases and rerun here; no UI-E2E coverage found/ran.
9. Progress micronutrient heatmap/table: covered by aggregation and component tests; no browser E2E due blocker.

## Blockers Encountered

- Existing project `next dev` process blocks Playwright from owning the test server lifecycle.
  - PID: `97828`
  - Command: `node.exe ... next/dist/server/lib/start-server.js`
  - Existing server log shows `Reload env: .env.local`, so using the existing server would bypass the `.env.test.local` safety path.
  - User action needed: stop the existing project dev server, then rerun the Playwright command so the configured test server can launch with `.env.test.local`.

## Visual/UI Findings

- No browser screenshots or visual diffs were produced because Playwright was blocked before test execution.
- Component-level UI assertions passed for the changed UI surfaces listed above.

## Commands Run

- `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line`
- `$env:PORT='3100'; pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line`
- `Get-CimInstance Win32_Process -Filter "ProcessId = 97828" | Select-Object ProcessId,CommandLine,ExecutablePath | Format-List`
- `Get-Content -Path '.next\dev\logs\next-development.log' -Tail 80 -ErrorAction SilentlyContinue`
- `pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/log/portion-unit.test.ts tests/unit/lib/library/create-schema.test.ts tests/unit/library/food-detail-edit-validation.test.ts tests/unit/log/confirmation-time-editor.test.tsx tests/unit/components/log-flow/ConfirmationScreen.test.tsx tests/unit/components/log-flow/WhyTheseNumbers.test.tsx tests/unit/library/to-log-library-item.test.ts tests/components/library-tab-continue-cta.test.tsx tests/components/library/LibraryCard.test.tsx tests/components/library/FoodDetail.mode-edit-query.test.tsx tests/unit/components/charts/WeightTrajectoryLine.test.tsx tests/unit/progress/weight-quick-add.test.tsx tests/integration/weight-page-imperial-conversion.test.tsx tests/integration/ai-vision.test.ts tests/unit/lib/ai/image-analysis-quota.test.ts tests/unit/lib/library/sketch-pipeline.test.ts tests/unit/api/library-sketch-generate.test.ts tests/unit/api/library-sketch-backfill.test.ts tests/unit/api/entries-save-sketch-enqueue.test.ts tests/unit/api/library-create.test.ts tests/unit/lib/aggregations/progress.test.ts tests/components/progress/MicronutrientHeatmap.test.tsx tests/integration/library-item-update.test.ts tests/unit/api/library-merge-micros-bound.test.ts`
- `pnpm typecheck`
- `pnpm exec eslint "lib/log/portion-unit.ts" "app/(app)/log/_components/ConfirmationScreen.tsx" "app/(app)/log/_components/Confirmation/TimeEditor.tsx" "app/(app)/log/_components/WhyTheseNumbers.tsx" "app/(app)/log/_components/AddFoodTab/LibraryList.tsx" "app/(app)/library/_components/FoodDetail/FoodDetailName.tsx" "app/(app)/progress/page.tsx" "app/(app)/progress/_components/weight-quick-add.tsx" "components/charts/WeightTrajectoryLine.tsx" "components/charts/MicronutrientHeatmap.tsx" "components/charts/HeatmapInteractive.tsx" "app/api/ai/vision/route.ts" "lib/ai/image-analysis-quota.ts" "tests/unit/components/log-flow/ConfirmationScreen.test.tsx" "tests/components/progress/MicronutrientHeatmap.test.tsx" "tests/integration/ai-vision.test.ts"`

## Remaining Risk

- Phase 7 browser E2E remains blocked until the existing dev server is stopped. The exact UI flows are covered by focused component/integration tests, but not by browser click-through validation in this run.
- No auth/CAPTCHA/2FA/native prompt blocker was reached; Playwright stopped at server startup before browser interaction.

## Resume Attempt - 2026-05-18 16:39 +07

### Process Verification / Server Unblock

- Verified PID `97828` before stopping:
  - Process: `node.exe`
  - Command: `C:\nvm4w\nodejs\node.exe "...Calorie tracker webapp\node_modules\.pnpm\next@16.2.4_...\node_modules\next\dist\server\lib\start-server.js"`
  - Parent PID `82564` was the matching repo `next dev` CLI command: `node "...Calorie tracker webapp\node_modules\.bin\..\...next\dist\bin\next" dev`
- Stopped only PID `97828`.
- Rechecked port `3000`; no listener remained.
- `.env.test.local` exists, so Playwright was able to launch its own repo web server with the test-env injection path.

### Playwright / E2E Resume Command

- FAILED: `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line`
  - Result: 32 tests executed; 16 passed, 11 skipped, 5 failed.
  - No auth/CAPTCHA/2FA/native prompt blocker was reached.
  - No production code or test code was changed during this resume.

### Failures / Diagnosis

- `tests/e2e/library/library-add-then-view.spec.ts`
  - Failure: expected `library-card-lettermark-<id>`.
  - Observed: cards rendered with correct names/kcal, but the no-thumbnail slot showed the current `ThumbnailSketchPending` status UI for recent seed rows instead of the old lettermark test id.
  - Artifact: `test-results/e2e-library-library-add-th-0ef35-ards-with-display-name-kcal-chromium/test-failed-1.png`
  - Context: `test-results/e2e-library-library-add-th-0ef35-ards-with-display-name-kcal-chromium/error-context.md`
- `tests/e2e/library/library-sketch-thumbnail.spec.ts`
  - Failure: expected `library-card-thumb-<id>` for both sketch and photo rows.
  - Observed: seeded rows rendered, but the thumbnail URL signing path degraded to fallback UI, so the image test ids were absent.
  - Artifacts:
    - `test-results/e2e-library-library-sketch-ad4d4-ers-Image-data-sketch-true--chromium/test-failed-1.png`
    - `test-results/e2e-library-library-sketch-776f8-carry-data-sketch-attribute-chromium/test-failed-1.png`
  - Context:
    - `test-results/e2e-library-library-sketch-ad4d4-ers-Image-data-sketch-true--chromium/error-context.md`
    - `test-results/e2e-library-library-sketch-776f8-carry-data-sketch-attribute-chromium/error-context.md`
- `tests/e2e/web/smoke/golden-path.spec.ts`
  - Failure: `/settings` did not render `page-settings`.
  - Observed server error: `ProfileLookupError: profile lookup failed`; Supabase error `42703`, `column profiles.birthday does not exist`.
  - Diagnosis: test database schema has not applied `supabase/migrations/0022_profiles_birthday.sql`, while the app now selects `birthday` on settings/profile paths.
  - Artifact: `test-results/e2e-web-smoke-golden-path--3c439-rogress-→-settings-→-logout-chromium/test-failed-1.png`
  - Context: `test-results/e2e-web-smoke-golden-path--3c439-rogress-→-settings-→-logout-chromium/error-context.md`
- `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts`
  - Failure: timed out waiting for `POST /api/library/<id>/log-now`.
  - Observed: clicking `food-detail-log-now` opened the current meal-slot picker; the spec did not click a meal option, so no POST was sent.
  - Artifact: `test-results/e2e-web-user-stories-US-ST-38bd9-w---recent-entries---delete-chromium/test-failed-1.png`
  - Context: `test-results/e2e-web-user-stories-US-ST-38bd9-w---recent-entries---delete-chromium/error-context.md`

### Resume Status

- `e2e_tests_status`: failed.
- Reason for stop: failures require a user decision before proceeding:
  - update the affected E2E specs to the current sketch-pending / meal-picker contracts,
  - apply the pending `profiles.birthday` migration to the test database or choose a code fallback,
  - then rerun the same Playwright command.

## E2E Repair Pass - 2026-05-18 16:52 +07

### Repairs Applied

- Updated `tests/e2e/library/library-add-then-view.spec.ts` to assert the current fresh-row `library-card-pending-<id>` sketch placeholder instead of the old lettermark fallback.
- Updated `tests/e2e/library/library-sketch-thumbnail.spec.ts` to upload a real 1px probe image into the `food-thumbnails` test bucket before asserting `library-card-thumb-<id>` and `data-sketch`. This avoids the old missing-object signing fallback.
- Updated `tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts` to click the meal-slot picker after `Log this now`; the CRUD chain uses `snack` to avoid the intentionally pre-seeded `lunch` duplicate row.
- Applied and verified the existing non-destructive test DB migration `supabase/migrations/0022_profiles_birthday.sql` against the dev/test Supabase project. Verification confirmed `public.profiles.birthday` exists as `date`.

### Verification After Repair

- PASS: targeted repaired-spec Playwright run after final patching.
  - Command: `pnpm exec playwright test --project=chromium tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts --reporter=line`
  - Result: 6 tests executed; 2 passed, 4 skipped.
- PASS: full Phase 7 Playwright sweep.
  - Command: `pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line`
  - Result: 32 tests executed; 21 passed, 11 skipped.
- PASS: targeted ESLint on edited specs.
  - Command: `pnpm exec eslint "tests/e2e/library/library-add-then-view.spec.ts" "tests/e2e/library/library-sketch-thumbnail.spec.ts" "tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts"`

### Final Status

- `e2e_tests_status`: passed.
- No auth/CAPTCHA/2FA/native prompt blocker was reached.
- No production behavior was changed.
