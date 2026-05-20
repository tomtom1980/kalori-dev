---
batch_id: 2026-05-18-calorie-tracker-quality-batch
started: 2026-05-18T19:47:47.5593237+07:00
last_updated: 2026-05-18T23:54:00+07:00
phase: 7
phase_status: e2e_blocker_fixed_visual_diffs_remain
starting_head_sha: 717bf25ebdb297b5795a047cad5397f518282d24
git_stash_ref: null
working_tree_was_clean_at_start: true
project_slug: calorie-tracker-webapp
bugs:
  - id: 1
    description: "Mobile account menu Settings and Export do not work"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\nav\profile-menu.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\settings\_components\DataSubsection.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\profile-menu.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\top-app-bar.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\settings\page.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\profile-menu.test.tsx::navigates to Settings and closes the menu'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\profile-menu.test.tsx::navigates to the data export section and closes the menu'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\nav\top-app-bar.test.tsx::router mock added for ProfileMenu useRouter dependency'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\settings\page.test.tsx::renders a stable data export anchor for account-menu deep links'
    tdd_required: true
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 2
    description: "Missing loading states for high-confidence async user actions"
    classification: needs_debug_shallow
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\ProgressRangeToolbar.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\copy-yesterday\_components\CopyYesterdayModal.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\BulkActionsBar.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryClient.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\CopyYesterdayModal.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\BulkActionsBar.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\LibraryClient.quick-actions.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\Planning\.tmp\bugfix-2026-05-18-calorie-tracker-quality-batch\outputs\bug-2.md'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx::marks the requested range busy until the server-rendered active range catches up'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\CopyYesterdayModal.test.tsx::shows semantic busy feedback and prevents duplicate copy submits while pending'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\BulkActionsBar.test.tsx::marks the whole bulk bar busy and disables conflicting actions while bulk log is pending'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\LibraryClient.quick-actions.test.tsx::Add Item button exposes quota-check busy state while the quota request is pending'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\LibraryClient.quick-actions.test.tsx::quick-log meal dialog exposes busy state while the log request is pending'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\library\LibraryClient.quick-actions.test.tsx::bulk-log actions expose busy state while selected items are being logged'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 3
    description: "Photo upload/capture desktop behavior"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\SnapTab.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab-thumbnail-upload.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab.test.tsx::desktop renders upload-only without camera capture input or capture square'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\log-flow\SnapTab-thumbnail-upload.test.tsx::desktop upload selector updated to snap-tab-upload-input'
    tdd_required: true
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 4
    description: "Data table view close button should match shared popup X style"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\DataTableDrawer.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx::data-table drawer close is an icon-only X button with stable accessible name'
    tdd_required: false
    ui_touching: true
    risk: low
    drop_reason: null
  - id: 5
    description: "Real AI summaries for dashboard daily summary and progress"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\ai\nutrition-summary\route.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\settings\_components\AiSummaryConsentToggle.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weekly-review-island.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\NutritionSummaryReview.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\WeeklyReviewCore.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\DailyEditorsNote.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\summary-context.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cache.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\cost-log.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\prompts.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\schemas.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\auth\orphan-profile-fence.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\0024_nutrition_summary_call_type.sql'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\0025_ai_summary_opt_in.sql'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\database.types.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\summary-context.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\nutrition-summary.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\auth\orphan-profile-fence-status.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-accuracy-idempotency.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-accuracy-regression.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-vision-refresh.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\log-flow-vision-refresh.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-vn-fallback-runtime.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\reduced-motion-audit.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\schema-drift\generated-types-fresh.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\scripts\apply-prod-migrations-incremental.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\DailyEditorsNote.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\dashboard\DailyEditorsNote.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewIsland.period.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewCore.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\nutrition-summary.test.ts::NutritionSummaryResult strips control chars and requires a body'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\nutrition-summary.test.ts::v1_nutritionSummary sends goals, food, water, weight, range, and caveats as separate prompt parts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\nutrition-summary.test.ts::v1_nutritionSummary sanitizes stored food highlights before prompt composition'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\nutrition-summary.test.ts::computeNutritionSummaryFingerprint changes when logged data, goals, profile, or range changes'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts::calls Gemini for sparse-but-nonempty ranges instead of returning not enough items logged'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts::returns deterministic fallback without Gemini for truly empty ranges'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts::keys cache by scope, range, and data fingerprint'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-nutrition-summary.test.ts::returns fallback and still logs exactly once when Gemini fails'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\auth\orphan-profile-fence-status.test.ts::missing optional ai_summary_opt_in column retries profile lookup and fails consent closed'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\auth\orphan-profile-fence-status.test.ts::missing optional ai_summary_opt_in column page routes keep rendering with opt-in false'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\dashboard\DailyEditorsNote.test.tsx::shows a first-load skeleton, then renders the AI body and bullets'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\dashboard\DailyEditorsNote.test.tsx::keeps the previous summary visible and marks the note busy during a refresh'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewIsland.period.test.tsx::range=last_30 requests the shared nutrition-summary route instead of deterministic period copy'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewIsland.period.test.tsx::range=last_30 without AI consent renders a static non-busy fallback and skips the API call'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\WeeklyReviewCore.test.tsx::custom period note names the selected range instead of the 30-day window'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-accuracy-idempotency.test.ts::admin quota mock supports vision quota count queries'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-accuracy-regression.test.ts::admin quota mock supports vision quota count queries'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-vision-refresh.test.ts::admin quota mock supports vision quota count queries'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\log-flow-vision-refresh.test.ts::admin quota mock supports vision quota count queries'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\ai-vn-fallback-runtime.test.ts::admin quota mock supports vision quota count queries'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\schema-drift\generated-types-fresh.test.ts::database types marker refreshed through 0024'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\scripts\apply-prod-migrations-incremental.test.ts::allow-dev dry-run fixture updated through 0024'
    tdd_required: true
    ui_touching: true
    risk: high
    drop_reason: null
  - id: 6
    description: "Redo progress date buttons"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\page.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\ProgressRangeToolbar.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weekly-review-island.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\progress\_components\weight-quick-add.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\WeightTrajectoryLine.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\progress.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\aggregations\progress-fetch.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\progress.test.ts'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx::renders Last 7 days, Last 30 days, and Custom segments'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx::shows labeled custom date fields and commits a valid custom range'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\ProgressRangeToolbar.test.tsx::blocks invalid custom ranges inline without navigating'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\progress.test.ts::normalizes old D/W/M URL ranges to safe new ranges'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\aggregations\progress.test.ts::accepts valid custom params and rejects invalid/future/overlong custom ranges'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 7
    description: "New food log date/time must not allow future date/time"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\Confirmation\TimeEditor.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\library\[id]\log-now\route.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\log\confirmation-time-editor.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\entries-save-30day-window.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\library-log-now-30day-window.test.ts'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx::blocks a future logged_at client-side with red validation text and no save request'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts::rejects logged_at beyond 30-second clock-skew tolerance of now'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\log\confirmation-time-editor.test.tsx::clamps max to now and blocks forced future changes'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\entries-save-30day-window.test.ts::future-skew-over-30-seconds-still-rejected'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\entries-save-30day-window.test.ts::within-30-second-future-skew still accepted'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\library-log-now-30day-window.test.ts::future-skew-over-30-seconds-still-rejected'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 8
    description: "AI parsed details must show micronutrients"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx::standard parsed-food rows show only the top micronutrient by target percentage by default'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx::standard parsed-food micronutrient toggle expands all nonzero micros and hides all-zero rows'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 9
    description: "Food row layout and approximate grams"
    classification: needs_debug_shallow
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\portion-sanity.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\prompts.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\ai\portion-sanity.test.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\prompts-approx-grams.test.ts'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\log-flow\ConfirmationScreen.test.tsx::shows approximate grams below the food name only for confident sane non-gram rows'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\ai\portion-sanity.test.ts::strips absurd approximate grams and lowers confidence for non-gram foods'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\ai\portion-sanity.test.ts::keeps plausible food-related approximate grams for non-gram foods'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 10
    description: "Progress weight quick-add layout"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\dashboard\WeightQuickAdd.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WeightQuickAdd.test.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\progress\weight-quick-add.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\components\dashboard\WeightQuickAdd.test.tsx::groups the weight and date fields together when inline unit choice is enabled'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\progress\weight-quick-add.test.tsx::renders the progress inline weight/date fields as one responsive pair'
    tdd_required: false
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 11
    description: "Progress micronutrient table collapsed view should stay top 4 without scrollbars"
    classification: known_fix
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\MicronutrientHeatmap.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx::defaults to four under-target non-upper-limit rows and expands to all eligible rows'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
  - id: 12
    description: "Heatmap/table cell interactions need hover value plus persistent accessible detail popup"
    classification: needs_debug_shallow
    status: implemented
    files_touched:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\components\charts\HeatmapInteractive.tsx'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\globals.css'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\i18n\en.ts'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx'
    tests_added:
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx::hover shows a quick value tooltip and pointer leave removes it'
      - 'c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\components\progress\MicronutrientHeatmap.test.tsx::click opens a persistent detail popup that closes via X, outside click, and Escape'
    tdd_required: true
    ui_touching: true
    risk: medium
    drop_reason: null
codex:
  status: round_1_review_fixes_applied
  findings: []
security:
  status: addendum_complete_blockers_addressed
  findings: []
e2e:
  status: blocked_with_failures
  last_run: 2026-05-18T23:48:40.9063363+07:00
  report: planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/e2e-results.md
  commands:
    focused_chromium:
      exit_code: 1
      result: failed
      summary: "13 tests: 2 passed, 4 skipped, 7 failed."
      passed:
        - tests/e2e/weight-log.spec.ts
        - tests/e2e/library/library-open-empty.spec.ts
      skipped:
        - "tests/e2e/progress-render.spec.ts: 4 fixme placeholders for @F-TEST-4."
      failed:
        - tests/e2e/web/dashboard-a11y.spec.ts
        - tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts
      blocker: "Dashboard-dependent flows hit ProfileLookupError caused by missing Supabase column profiles.ai_summary_opt_in (42703)."
    visual_baseline_chromium:
      exit_code: 1
      result: failed
      summary: "5 tests: 0 passed, 5 failed."
      failed:
        - "tests/visual/dashboard.spec.ts: blocked/error-page sized screenshot due missing profiles.ai_summary_opt_in."
        - "tests/visual/progress.spec.ts: blocked/error-page sized screenshot due missing profiles.ai_summary_opt_in."
        - "tests/visual/weight.spec.ts: rendered UI but baseline drift; expected 1280x800, received 1280x808, diff ratio about 0.02."
        - "tests/visual/library.spec.ts: rendered UI but baseline drift; expected 1280x1100, received 1280x1123, diff ratio about 0.05."
        - "tests/visual/log-confirmation.spec.ts: rendered UI but baseline drift; diff ratio about 0.01."
  findings:
    - "Resolved follow-up: narrow pre-0025 schema fallback for missing profiles.ai_summary_opt_in unblocks dashboard/progress/settings routes while treating consent as false."
    - "Visual baselines for weight, library, and log-confirmation fail against current render; no baseline updates made."
    - "Progress-render Playwright coverage is currently skipped via test.fixme placeholders."
  blocker_fix:
    status: fixed
    fixed_at: 2026-05-18T23:54:00+07:00
    blocker: "Authed dashboard/progress/settings routes crashed with ProfileLookupError on pre-0025 schemas missing profiles.ai_summary_opt_in."
    resolution: "Added a narrow 42703 ai_summary_opt_in-only fallback in the shared profile fence; fallback treats opt-in as false and preserves migration 0025 as the production schema path."
    verification:
      - "pnpm vitest run --pool threads --maxWorkers 1 tests/unit/lib/auth/orphan-profile-fence-status.test.ts tests/integration/ai-nutrition-summary.test.ts tests/unit/settings/page.test.tsx tests/integration/progress-page-profile-lookup-guard.test.ts tests/integration/dashboard-page-onboarding-guard.test.ts -> 5 files / 29 tests passed."
      - "pnpm typecheck -> passed."
      - "pnpm lint -> 0 errors, 42 pre-existing warnings."
      - "Focused Playwright golden-path/progress -> 1 passed, 4 skipped."
integration_verification:
  status: passed
  last_run: 2026-05-18T23:43:35+07:00
  commands:
    git_diff_check:
      exit_code: 0
      result: passed
      notes: "Line-ending warnings only; no whitespace errors."
    pnpm_test_initial:
      exit_code: 124
      result: timeout
      notes: "Initial full pnpm test hit the 5-minute harness timeout before returning a result."
    pnpm_test:
      exit_code: 0
      result: passed
      test_files: "408 passed | 18 skipped (426)"
      tests: "3161 passed | 99 skipped (3260)"
      notes: "Post-R2 final rerun passed. Happy DOM printed ECONNREFUSED :3000 and AbortError teardown noise after the passing summary."
    pnpm_typecheck:
      exit_code: 0
      result: passed
    pnpm_lint:
      exit_code: 0
      result: passed_with_warnings
      warnings: 42
      errors: 0
    pnpm_build:
      exit_code: 0
      result: passed
      artifacts: ".next/ production build; service worker build checked public/sw.js and public/sw.js.map with 0 written, 2 skipped."
  git_status_post_r2:
    total: 503
    staged: 428
    unstaged: 65
    untracked: 10
    staged_renames: 428
    unstaged_modified: 65
    old_batch_staged_files_remain: true
    old_batch_note: "Staged set still contains Planning/... to planning/... renames, including older batch files."
    untracked_core_files_or_migrations:
      - app/(app)/settings/_components/AiSummaryConsentToggle.tsx
      - app/api/ai/nutrition-summary/
      - components/charts/NutritionSummaryReview.tsx
      - lib/aggregations/summary-context.ts
      - supabase/migrations/0024_nutrition_summary_call_type.sql
      - supabase/migrations/0025_ai_summary_opt_in.sql
      - tests/components/dashboard/DailyEditorsNote.test.tsx
      - tests/integration/ai-nutrition-summary.test.ts
      - tests/unit/lib/aggregations/summary-context.test.ts
      - tests/unit/lib/ai/nutrition-summary.test.ts
regression_followups:
  - id: daily-editors-note-skeleton-container
    source: full_test_regression
    status: fixed
    description: "First-load DailyEditorsNote skeleton removed the stable daily summary surface expected by dashboard accessibility coverage."
    files_touched:
      - components/dashboard/DailyEditorsNote.tsx
      - tests/unit/components/dashboard/DailyEditorsNote.test.tsx
      - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/regression-diagnosis.md
      - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/outputs/bug-5.md
      - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md
    verification:
      - "pnpm test tests/integration/dashboard-a11y.test.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx -- --reporter=verbose"
      - "pnpm typecheck"
      - "pnpm exec eslint components/dashboard/DailyEditorsNote.tsx tests/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/integration/dashboard-a11y.test.tsx"
pending_minor_findings: []
recovery_review_fixes:
  status: complete
  worker: review-fix-recovery
  timestamp: 2026-05-18T23:21:28+07:00
  untracked_files:
    - app/(app)/settings/_components/AiSummaryConsentToggle.tsx
    - app/api/ai/nutrition-summary/route.ts
    - components/charts/NutritionSummaryReview.tsx
    - lib/aggregations/summary-context.ts
    - supabase/migrations/0024_nutrition_summary_call_type.sql
    - supabase/migrations/0025_ai_summary_opt_in.sql
    - tests/components/dashboard/DailyEditorsNote.test.tsx
    - tests/integration/ai-nutrition-summary.test.ts
    - tests/unit/lib/aggregations/summary-context.test.ts
    - tests/unit/lib/ai/nutrition-summary.test.ts
  public_sw_note: "public/sw.js remains modified generated churn; build reported public/sw.js and public/sw.js.map digest-unchanged/skipped. Do not stage unless intentionally accepting generated output."
last_completed_action: "E2E blocker fix documented. Narrow missing profiles.ai_summary_opt_in fallback in lib/auth/orphan-profile-fence.ts passed focused Vitest (5 files / 29 tests), typecheck, full lint (0 errors, 42 pre-existing warnings), and focused Playwright golden-path/progress (1 passed / 4 skipped). Visual baseline drift remains unresolved; no baseline updates were made."
last_user_decision: approved all recommendations
---

phase7_schema_fallback_rerun:
  timestamp: 2026-05-19T00:02:14+07:00
  status: failed_non_visual_a11y_and_visual_drift
  report: planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/e2e-results.md
  commands:
    focused_chromium:
      command: "pnpm exec playwright test --project=chromium tests/e2e/progress-render.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/web/dashboard-a11y.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-open-empty.spec.ts"
      exit_code: 1
      summary: "13 tests: 7 passed, 4 skipped, 2 failed."
      skipped:
        - "tests/e2e/progress-render.spec.ts: 4 existing test.fixme placeholders."
      failed:
        - "tests/e2e/web/dashboard-a11y.spec.ts AC1: axe color-contrast violation, #a13a2c on #0e0a08 ratio 2.96 vs expected 4.5:1."
        - "tests/e2e/web/dashboard-a11y.spec.ts AC2: 12 dashboard focus stops did not render expected ivory focus ring."
    visual_baseline_chromium:
      command: "pnpm exec playwright test --project=visual-baseline-chromium tests/visual/weight.spec.ts tests/visual/progress.spec.ts tests/visual/dashboard.spec.ts tests/visual/log-confirmation.spec.ts tests/visual/library.spec.ts"
      exit_code: 1
      summary: "5 tests: 0 passed, 0 skipped, 5 failed."
      failed:
        - "tests/visual/log-confirmation.spec.ts: 3434 pixels differed, ratio 0.01."
        - "tests/visual/library.spec.ts: expected 1280x1100, received 1280x1123, 58286 pixels differed, ratio 0.05."
        - "tests/visual/dashboard.spec.ts: expected 1280x1864, received 1280x1880, 61010 pixels differed, ratio 0.03."
        - "tests/visual/progress.spec.ts: expected 1280x3325, received 1280x3471, 244897 pixels differed, ratio 0.06."
        - "tests/visual/weight.spec.ts: expected 1280x800, received 1280x808, 10459 pixels differed, ratio 0.02."
  blockers:
    auth_or_schema: "none observed in rerun"
    non_visual_remaining: "dashboard accessibility/focus styling failures"
    visual_remaining: "desktop visual baseline drift across all five rerun specs"
  baseline_update: "not run"
  logs:
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/phase7-focused-chromium-rerun.log
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/phase7-visual-baseline-rerun.log
phase7_old_batch_rerun_copied:
  timestamp: 2026-05-19T00:20:00+07:00
  source:
    e2e_results: planning/bugs/2026-05-18-1328-calorie-tracker-fixes/e2e-results.md
    state: planning/bugs/2026-05-18-1328-calorie-tracker-fixes/state.md
  copied_to:
    e2e_results: planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/e2e-results.md
    state: planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md
  focused_chromium:
    command: "pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts tests/e2e/web/dashboard-a11y.spec.ts --reporter=line"
    exit_code: 1
    summary: "34 tests executed; 22 passed, 11 skipped, 1 failed."
    failed:
      - "tests/e2e/library/library-quick-action-menu.spec.ts::Edit option navigates to /library/[id]?mode=edit stayed on /library after clicking Edit."
    dashboard_a11y: "passed in this focused rerun"
  visual_baseline:
    command: "pnpm exec playwright test --project=visual-baseline-chromium --project=visual-baseline-chromium-tablet --project=visual-baseline-chromium-mobile --reporter=line"
    exit_code: 1
    summary: "81 tests executed; 46 passed, 35 failed; 15 screenshot diffs and 20 auth rate-limit failures."
    baseline_update: "not run"
  blocker:
    non_visual_remaining: "library quick-action Edit menu does not navigate to /library/<id>?mode=edit"
    visual_remaining: "visual baselines red; auth rate limits partially blocked visual rerun"
phase7_library_quick_action_rerun:
  timestamp: 2026-05-19T00:24:00+07:00
  status: passed_current_working_tree
  production_code_changed: false
  docs_updated:
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/e2e-results.md
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/outputs/bug-2.md
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md
  old_batch_docs_restored:
    - planning/bugs/2026-05-18-1328-calorie-tracker-fixes/e2e-results.md
    - planning/bugs/2026-05-18-1328-calorie-tracker-fixes/state.md
    - planning/bugs/2026-05-18-1328-calorie-tracker-fixes/outputs/bug-2.md
    - planning/bugs/2026-05-18-1328-calorie-tracker-fixes/outputs/bug-5.md
  commands:
    component:
      command: "pnpm vitest run --pool threads --maxWorkers 1 tests/components/library/LibraryClient.quick-actions.test.tsx"
      exit_code: 0
      summary: "1 file passed; 11 tests passed."
    focused_playwright:
      command: "pnpm exec playwright test --project=chromium tests/e2e/library/library-quick-action-menu.spec.ts --reporter=line"
      exit_code: 0
      summary: "2 tests passed."
    wider_focused_playwright:
      command: "pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts tests/e2e/web/dashboard-a11y.spec.ts --reporter=line"
      exit_code: 0
      summary: "34 tests executed; 23 passed, 11 skipped, 0 failed."
    typecheck:
      command: "pnpm typecheck"
      exit_code: 0
    lint:
      command: "pnpm lint"
      exit_code: 0
      summary: "0 errors, 42 existing warnings."
  blocker:
    non_visual_remaining: "none observed; library quick-action Edit navigation is green"
    visual_remaining: "visual baseline drift/auth-rate issues from copied notes remain separate"
last_completed_action: "Copied latest old-batch E2E rerun notes/state into active batch docs, restored only old-batch unstaged doc edits, and reran library quick-action navigation coverage. Current working tree passes the isolated spec and exact wider focused Chromium command; no production patch was applied because the non-visual blocker did not reproduce."

final_prepackage_verification:
  timestamp: 2026-05-19T00:36:00+07:00
  status: passed_with_non_blocking_warnings
  docs_updated:
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/integration-verification.md
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/e2e-results.md
    - planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md
  visual_baselines:
    run: false
    updated: false
  commands:
    git_diff_check:
      command: "git diff --check"
      exit_code: 0
      summary: "passed; line-ending warnings only"
    test:
      command: "pnpm test"
      exit_code: 0
      summary: "408 files passed, 18 skipped; 3163 tests passed, 99 skipped"
      post_summary_noise: "Repeated ECONNREFUSED :3000 AggregateError and happy-dom AbortError output after passing summary."
    typecheck:
      command: "pnpm typecheck"
      exit_code: 0
    lint:
      command: "pnpm lint"
      exit_code: 0
      summary: "0 errors, 42 warnings"
    build:
      command: "pnpm build"
      exit_code: 0
      summary: "Next production build passed; 29/29 static pages; service worker unchanged, 0 written and 2 skipped"
    focused_non_visual_e2e:
      command: "pnpm exec playwright test --project=chromium tests/e2e/web/smoke/golden-path.spec.ts tests/e2e/web/user-stories/US-STAB-C5.spec.ts tests/e2e/web/user-stories/US-STAB-C1.spec.ts tests/e2e/web/user-stories/US-STAB-C2-crud.spec.ts tests/e2e/web/user-stories/US-ADDFOOD-1.spec.ts tests/e2e/library/library-add-then-view.spec.ts tests/e2e/library/library-quick-action-menu.spec.ts tests/e2e/library/library-sketch-thumbnail.spec.ts tests/e2e/weight-log.spec.ts tests/e2e/progress-render.spec.ts --reporter=line"
      exit_code: 0
      summary: "32 tests executed; 21 passed, 11 skipped, 0 failed"
      warnings:
        - "Next Image quality 72 not configured in images.qualities [75]."
        - "DialogContent missing Description or aria-describedby."
        - "strokeDashoffset received NaN."
        - "Mixed textDecoration shorthand and textDecorationColor style warning."
        - "One web server ECONNRESET aborted after test completion."
  git_status_counts:
    total: 514
    staged: 428
    unstaged: 86
    untracked: 10
    staged_renames: 428
  blockers:
    non_visual: "none observed in final focused rerun"
    visual: "not evaluated in this pass; no visual baseline command was run"
last_completed_action: "Final pre-package verification passed: git diff --check, pnpm test, pnpm typecheck, pnpm lint, pnpm build, and focused non-visual Chromium E2E all exited 0. No visual baseline command was run or updated. Remaining items are non-blocking warnings/noise recorded in integration-verification.md and e2e-results.md."
