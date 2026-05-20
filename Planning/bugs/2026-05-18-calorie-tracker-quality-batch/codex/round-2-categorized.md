# Round 2 Categorized Findings

## Critical

None.

## Improvement

- I1 - `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md:90`: R1/security-added untracked files are documented under `recovery_review_fixes.untracked_files`, but not all are present in Bug 5 `files_touched`; Phase 8 staging must consume both lists or update the staging manifest before commit.

## Minor

- M1 - `components/charts/NutritionSummaryReview.tsx:47`: when `aiSummaryOptIn` is false, the component avoids the API call but still renders the fallback as permanently `aria-busy="true"` with the updating label because `state.key` never settles.

## Resolved R1/Security Checks

- C1 timezone food bucketing: resolved via `userTzDayFrom`.
- C2 summary-context Supabase read errors: resolved via fail-closed `NutritionSummaryContextReadError`.
- C3 untracked core files: exact current untracked core file list is documented in `codex/fixes-r1-review.md` and `state.md`, with the staging-manifest caveat in I1.
- I1 nutrition-summary idempotency conflict: resolved with 409 conflict/replay-unavailable paths before Gemini/logging.
- I2 future nutrition-summary dates/ranges: resolved with server-side user-timezone checks.
- I3 progress custom date prop sync: resolved for URL-driven prop changes.
- I4 HeatmapInteractive dialog focus: resolved with close-button focus and trigger focus restoration.
