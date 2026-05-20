---
batch_id: 2026-05-18-1328-calorie-tracker-fixes
started: 2026-05-18T13:28:43+07:00
last_updated: 2026-05-18T17:10:27+07:00
phase: 7
phase_status: validation_passed
starting_head_sha: 3639be2afa0594e2946603e6763b1e5a79bba4d2
git_stash_ref: null
working_tree_was_clean_at_start: false
project_slug: kalori
last_user_decision: approved all nine scoped items for implementation
last_completed_action: Final validation rerun passed. Port 3000 was free before Playwright; typecheck, lint, targeted Vitest (24 files / 333 tests), Phase 7 Playwright (21 passed / 11 skipped), and git diff --check passed. .next/dev was not cleared because the route-level 404 family did not recur. See final-validation.md.

bugs:
  - id: 1
    description: "Whole-style units such as serving, cup, portion, large egg, medium fruit must only allow integer quantities."
    classification: needs_debug_shallow
    status: implemented
    files_touched:
      - lib/log/portion-unit.ts
      - app/(app)/log/_components/ConfirmationScreen.tsx
      - app/(app)/log/_components/AddFoodTab/LibraryList.tsx
      - app/(app)/library/_components/FoodDetail/FoodDetailName.tsx
      - app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts
      - app/(app)/library/_components/FoodDetail/foodDetail.schema.ts
      - app/api/entries/save/route.ts
      - app/api/library/[id]/update/route.ts
      - app/api/library/merge/route.ts
      - lib/library/create-schema.ts
      - tests/unit/lib/log/portion-unit.test.ts
      - tests/unit/lib/library/create-schema.test.ts
      - tests/unit/library/food-detail-edit-validation.test.ts
      - tests/unit/components/log-flow/ConfirmationScreen.test.tsx
      - tests/components/library-tab-continue-cta.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-1.md
    tests_added:
      - tests/unit/lib/log/portion-unit.test.ts::whole-style unit helpers
      - tests/unit/lib/library/create-schema.test.ts::rejects decimal default_portion for whole-style units such as cup
      - tests/unit/library/food-detail-edit-validation.test.ts::rejects decimal portions for whole-style edit units
      - tests/unit/components/log-flow/ConfirmationScreen.test.tsx::rejects decimal edits for whole-style confirmation units
      - tests/components/library-tab-continue-cta.test.tsx::rejects decimal quantities for whole-style library units
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 2
    description: "Food logging date/time selector must prevent selecting a future date/time based on current time."
    classification: known_fix
    status: implemented
    files_touched:
      - app/(app)/log/_components/Confirmation/TimeEditor.tsx
      - app/(app)/log/_components/ConfirmationScreen.tsx
      - lib/i18n/en.ts
      - tests/unit/log/confirmation-time-editor.test.tsx
      - tests/unit/components/log-flow/ConfirmationScreen.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-2.md
    tests_added:
      - tests/unit/log/confirmation-time-editor.test.tsx::clamps max to now and ignores forced future changes
      - tests/unit/components/log-flow/ConfirmationScreen.test.tsx::shows a specific error when the server rejects a future logged_at
    tdd_required: true
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 3
    description: "AI food parsing details should show micronutrients: minimal view shows top micronutrient by percentage and an expand/collapse button shows all."
    classification: known_fix
    status: implemented
    files_touched:
      - app/(app)/log/_components/WhyTheseNumbers.tsx
      - app/(app)/log/_components/ConfirmationScreen.tsx
      - lib/i18n/en.ts
      - tests/unit/components/log-flow/WhyTheseNumbers.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-3.md
    tests_added:
      - tests/unit/components/log-flow/WhyTheseNumbers.test.tsx::shows the top micronutrient by percent daily value first, then expands all rows
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 4
    description: "Adding a library food with a custom serving amount updates macros but not micronutrients such as vitamin C."
    classification: known_fix
    status: implemented
    files_touched:
      - lib/stores/useLogFlowStore.ts
      - lib/library/to-log-library-item.ts
      - app/(app)/log/_components/AddFoodTab/LibraryList.tsx
      - tests/unit/library/to-log-library-item.test.ts
      - tests/components/library-tab-continue-cta.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-4.md
    tests_added:
      - tests/unit/library/to-log-library-item.test.ts::maps full library item to log library item shape
      - tests/components/library-tab-continue-cta.test.tsx::scales library micronutrients by selected quantity
    tdd_required: true
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 5
    description: "Whole-style/new AI or image parsed serving units should show static approximate gram text below serving, also in library manage/open views."
    classification: actually_a_feature
    status: implemented
    files_touched:
      - lib/ai/schemas.ts
      - lib/ai/prompts.ts
      - app/api/entries/save/route.ts
      - lib/library/create-schema.ts
      - lib/library/fetch.ts
      - lib/library/to-log-library-item.ts
      - lib/stores/useLogFlowStore.ts
      - app/(app)/log/_components/ConfirmationScreen.tsx
      - app/(app)/log/_components/AddFoodTab/LibraryList.tsx
      - app/(app)/library/_components/LibraryCard.tsx
      - app/(app)/library/_components/FoodDetail/FoodDetailName.tsx
      - app/(app)/library/_components/FoodDetail/foodDetail.schema.ts
      - app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts
      - app/api/library/[id]/update/route.ts
      - app/api/library/merge/route.ts
      - lib/i18n/en.ts
      - tests/unit/lib/ai/schemas-cholesterol.test.ts
      - tests/unit/lib/ai/prompts-approx-grams.test.ts
      - tests/unit/lib/library/create-schema.test.ts
      - tests/unit/library/to-log-library-item.test.ts
      - tests/components/library-tab-continue-cta.test.tsx
      - tests/components/library/LibraryCard.test.tsx
      - tests/components/library/FoodDetail.mode-edit-query.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-5.md
    tests_added:
      - tests/unit/lib/ai/schemas-cholesterol.test.ts::ParsedItem.approxGrams
      - tests/unit/lib/ai/prompts-approx-grams.test.ts
      - tests/unit/lib/library/create-schema.test.ts::accepts optional AI-provided approxGrams metadata in nutrition
      - tests/unit/library/to-log-library-item.test.ts::preserves AI-provided approximate grams metadata for log-flow hydration
      - tests/components/library-tab-continue-cta.test.tsx::scales library micronutrients by selected quantity
      - tests/components/library/LibraryCard.test.tsx::renders approximate grams metadata under whole-style portions
      - tests/components/library/FoodDetail.mode-edit-query.test.tsx::displays approximate grams in view mode when saved on the library item
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 6
    description: "Library item edit unit dropdown includes egg-specific units like egg, small egg, medium egg, large egg; remove those and rely on normal small/medium/large style units."
    classification: known_fix
    status: implemented
    files_touched:
      - app/(app)/library/_components/FoodDetail/FoodDetailName.tsx
      - tests/components/library/FoodDetail.mode-edit-query.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-6.md
    tests_added:
      - tests/components/library/FoodDetail.mode-edit-query.test.tsx::renders unit as a dropdown in edit mode
      - tests/components/library/FoodDetail.mode-edit-query.test.tsx::preserves a legacy saved egg-specific unit as the selected value only
    tdd_required: true
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 7
    description: "Progress weight unit switch should move to top of chart and switch both entry field and chart values, including goal and records, between kg and lb."
    classification: known_fix
    status: implemented
    files_touched:
      - app/(app)/progress/page.tsx
      - app/(app)/progress/_components/weight-quick-add.tsx
      - components/charts/WeightTrajectoryLine.tsx
      - tests/unit/components/charts/WeightTrajectoryLine.test.tsx
      - tests/unit/progress/weight-quick-add.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-7.md
    tests_added:
      - tests/unit/components/charts/WeightTrajectoryLine.test.tsx::renders point, goal, and live values in pounds when unitPref=imperial
      - tests/unit/progress/weight-quick-add.test.tsx::one top-level unit switch updates the entry suffix and chart values together
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 8
    description: "Image AI usage should share a daily 20/monthly 100 limit across adding to library image generation and dashboard camera/upload image recognition."
    classification: known_fix
    status: implemented
    files_touched:
      - app/api/ai/vision/route.ts
      - app/api/library/sketch/generate/route.ts
      - app/api/library/sketch/backfill/route.ts
      - app/api/library/create/route.ts
      - app/api/entries/save/route.ts
      - lib/ai/cost-log.ts
      - lib/ai/image-analysis-quota.ts
      - lib/library/sketch-enqueue.ts
      - lib/library/sketch-pipeline.ts
      - supabase/migrations/0023_image_analysis_quota_call_type.sql
      - tests/integration/ai-vision.test.ts
      - tests/unit/lib/ai/image-analysis-quota.test.ts
      - tests/unit/lib/library/sketch-pipeline.test.ts
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-8.md
    tests_added:
      - tests/integration/ai-vision.test.ts::returns 429 before Gemini when the shared daily AI image analysis limit is exhausted
      - tests/integration/ai-vision.test.ts::cache-hit path does not consume the shared AI image analysis quota
      - tests/unit/lib/ai/image-analysis-quota.test.ts
      - tests/unit/lib/library/sketch-pipeline.test.ts::happy path writes one image-analysis sketch ai_call_log row for the real model call
      - tests/unit/lib/library/sketch-pipeline.test.ts::shared daily AI image analysis quota exhausted: skips before claiming, model work, and upload
    tdd_required: true
    ui_touching: false
    risk: medium
    drop_reason: null
  - id: 9
    description: "Progress page minor elements need tooltip details, table should show all minor elements, chart defaults to top four most under target and can expand to all with scrollbar."
    classification: actually_a_feature
    status: implemented
    files_touched:
      - lib/aggregations/progress.ts
      - components/charts/MicronutrientHeatmap.tsx
      - components/charts/HeatmapInteractive.tsx
      - tests/unit/lib/aggregations/progress.test.ts
      - tests/components/progress/MicronutrientHeatmap.test.tsx
      - planning/.tmp/bugfix-2026-05-18-1328-calorie-tracker-fixes/outputs/bug-9.md
    tests_added:
      - tests/unit/lib/aggregations/progress.test.ts::uses DEFAULT_MICROS_LIST, hides zero/<1% DV nutrients, and ranks default rows by under-target deficiency
      - tests/components/progress/MicronutrientHeatmap.test.tsx::defaults to four under-target non-upper-limit rows and expands to all eligible rows
      - tests/components/progress/MicronutrientHeatmap.test.tsx::data-table view includes all eligible nutrients, including sodium
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null

codex_round_1: completed_with_fixes
codex_round_2: completed_with_fixes
security_review: completed_with_fixes
e2e_tests_required: true
e2e_tests_status: passed
e2e_session_id: null
e2e_blocker_history: []

pending_minor_findings:
  - source: codex_r1
    bug_id: 8
    file: lib/ai/image-analysis-quota.ts
    finding: "Shared image-analysis quota uses count-then-call checks, so highly parallel requests near the limit can overshoot slightly; a DB-side reservation/RPC would be stronger but is beyond the approved safe R1 fix scope."
  - source: security_review
    bug_id: 5
    file: lib/library/create-schema.ts, app/api/library/[id]/update/route.ts, app/api/library/merge/route.ts
    finding: "Persisted approxGrams is positive/finite but not upper-bounded or consistently normalized away for gram-unit direct library mutation payloads; user-scoped data-integrity follow-up recommended."
last_completed_action: Final validation rerun passed. Port 3000 was free before Playwright; typecheck, lint, targeted Vitest (24 files / 333 tests), Phase 7 Playwright (21 passed / 11 skipped), and git diff --check passed. .next/dev was not cleared because the route-level 404 family did not recur. See final-validation.md.
last_user_decision: approved all nine scoped items for implementation
---
