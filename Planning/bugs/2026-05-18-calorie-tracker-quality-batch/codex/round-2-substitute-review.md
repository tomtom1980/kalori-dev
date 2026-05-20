# Round 2 Substitute Code Review

Batch: `2026-05-18-calorie-tracker-quality-batch`
Reviewer: Codex substitute review
Scope: current working tree after R1/security fixes, focused on AI summary opt-in, migrations `0024`/`0025`, summary context timezone/fail-closed behavior, nutrition-summary idempotency/future-date checks, progress custom date sync, HeatmapInteractive focus management, and whether untracked core files are accounted for in docs.

## Summary

Not fully clean, but no remaining Critical code finding from R1/security was found in the reviewed surfaces.

R1 Critical/Improvement status:

- R1 C1 resolved: `lib/aggregations/summary-context.ts:229-230` now buckets food entries with `userTzDayFrom(row.logged_at, timezone)`, and `tests/unit/lib/aggregations/summary-context.test.ts` covers the Asia/Bangkok UTC-boundary case.
- R1 C2 resolved: `lib/aggregations/summary-context.ts:430-437` now throws `NutritionSummaryContextReadError` for food, water, and weight read errors instead of treating failed reads as empty context.
- R1 C3 mostly resolved for review tracking: exact untracked core files are documented in `codex/fixes-r1-review.md:45-58` and `state.md:333-343`. See Improvement I1 below: the Phase state staging list is still split.
- R1 I1 resolved: `app/api/ai/nutrition-summary/route.ts:216-223` returns 409 on reused `client_id` conflicts or unavailable same-hash replay before Gemini/logging.
- R1 I2 resolved: `app/api/ai/nutrition-summary/route.ts:149-157` gates consent and rejects future dashboard/progress dates before context reads/Gemini.
- R1 I3 resolved for the core stale-input bug: `ProgressRangeToolbar.tsx:37-53` derives visible custom input state from the URL-backed prop key when props change.
- R1 I4 resolved: `HeatmapInteractive.tsx:246-264` focuses/restores through the persistent dialog, and the close button receives focus via `closeButtonRef`.
- AI summary opt-in is fail-closed at the server route and dashboard/progress callers pass explicit profile state. Migration `0025_ai_summary_opt_in.sql` adds `profiles.ai_summary_opt_in boolean not null default false`, and generated types are updated through `0025`.

## Critical

None.

## Improvements

### I1 - Phase state staging source omits some R1/security-added core files

File refs:
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md:90`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md:117`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md:333`
- `planning/.tmp/bugfix-2026-05-18-calorie-tracker-quality-batch/state.md:343`

The exact untracked files are documented under `recovery_review_fixes.untracked_files`, including `AiSummaryConsentToggle.tsx`, migration `0025_ai_summary_opt_in.sql`, and `tests/unit/lib/aggregations/summary-context.test.ts`. However, Bug 5's `bugs[].files_touched` list does not include all of those R1/security additions.

This matters because the bugfix-tomi commit flow stages from `bugs[].files_touched` unless the final worker intentionally consumes the recovery list too. A literal staging pass could omit part of the opt-in/migration/test fix set even though the files are documented elsewhere.

Expected follow-up:
- Before Phase 8 commit/staging, merge `recovery_review_fixes.untracked_files` into the final staging manifest or explicitly instruct the commit/docs worker to stage both lists.
- Re-check `git status --porcelain` for the ten core untracked paths before commit.

## Minor

### M1 - Progress AI summary opt-out fallback remains permanently busy

File refs:
- `components/charts/NutritionSummaryReview.tsx:47`
- `components/charts/NutritionSummaryReview.tsx:50`
- `components/charts/NutritionSummaryReview.tsx:85`
- `components/charts/NutritionSummaryReview.tsx:99`
- `components/charts/NutritionSummaryReview.tsx:131`

When `aiSummaryOptIn` is false, the effect correctly returns before calling `/api/ai/nutrition-summary`, and the component renders deterministic fallback copy. But `isLoading` is still computed as `state.key !== requestKey`; because no request will ever set `state.key`, the opt-out fallback renders with `aria-busy="true"` and the updating label forever.

This is not a privacy/security regression, but it is misleading UI/a11y state for users who have not opted in.

Expected follow-up:
- Gate loading state on consent, for example `const isLoading = aiSummaryOptIn && state.key !== requestKey`, or initialize/mark the fallback state settled when opt-out is false.
- Add a progress summary opt-out component test mirroring the dashboard no-fetch test.

## Clean Areas

- `profiles.ai_summary_opt_in` is added by migration `0025` with a fail-closed default.
- `app/api/profile/save/route.ts` whitelists `ai_summary_opt_in` as a boolean patch.
- Dashboard and progress pages select/pass `ai_summary_opt_in`; clients default to `false`.
- The nutrition-summary route rejects opposite-scope bodies via strict schema/refinement.
- Future dashboard days and progress range end dates are rejected server-side using the profile timezone.
- Summary context no longer ignores Supabase read errors.
- Heatmap persistent detail dialog now focuses the close button and restores focus to the triggering cell on close.
