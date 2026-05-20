# Bugfix Manifest: 2026-05-18-1328-calorie-tracker-fixes

## Summary

Batch `2026-05-18-1328-calorie-tracker-fixes` closed with all nine scoped items implemented and final validation green. The batch covered food logging unit/date validation, AI micronutrient and approximate-grams details, library micronutrient hydration, progress weight and micronutrient displays, and shared AI image-analysis quota enforcement.

Final validation passed on 2026-05-18T17:10:27+07:00:
- `pnpm typecheck` passed.
- `pnpm lint` passed with 40 existing warnings and 0 errors.
- Targeted Vitest passed: 24 files / 333 tests.
- Phase 7 Playwright passed: 32 selected, 21 passed, 11 skipped.
- `git diff --check` passed.

## Batch Artifacts

- `state.md`
- `approval-gate.md`
- `project-context.md`
- `lessons-relevant.md`
- `proposals/bug-1.md` through `proposals/bug-9.md`
- `outputs/bug-1.md` through `outputs/bug-9.md`
- `codex/round-1.md`, `codex/round-1-categorized.md`
- `codex/fixes-r1-bug-2-time-editor.md`
- `codex/fixes-r1-quota-and-library-hydration.md`
- `codex/round-2.md`, `codex/round-2-categorized.md`
- `security-review.md`
- `e2e-results.md`
- `e2e-diagnosis.md`
- `final-validation.md`

## Per-Bug Details

### Bug 1: Whole-style units allow only integers

- **Classification:** `needs_debug_shallow`
- **Description:** Whole-style units such as serving, cup, portion, large egg, and medium fruit now reject fractional quantities.
- **Files:** `lib/log/portion-unit.ts`, `ConfirmationScreen.tsx`, `LibraryList.tsx`, Food Detail edit/schema files, `app/api/entries/save/route.ts`, library create/update/merge validation, and focused tests.
- **Tests:** Whole-style unit helper tests, library create schema tests, Food Detail edit validation, ConfirmationScreen quantity tests, and library-tab continue CTA tests.
- **Status:** Implemented.
- **Codex/security/E2E:** Security M1 later found and fixed direct library mutation bypasses for portion-only payloads. Covered by targeted component/API tests and final validation.

### Bug 2: Future food logging time selection

- **Classification:** `known_fix`
- **Description:** The confirmation time picker now clamps native max to current mount time and ignores forced future changes; future server rejects show specific copy.
- **Files:** `app/(app)/log/_components/Confirmation/TimeEditor.tsx`, `ConfirmationScreen.tsx`, `lib/i18n/en.ts`, and focused tests.
- **Tests:** TimeEditor max/forced-change tests and ConfirmationScreen future-time error copy.
- **Status:** Implemented.
- **Codex/security/E2E:** Codex R1 caught that Bug 2 was initially missing; R1 fix implemented and verified it. Included in targeted Vitest and final Phase 7 Playwright sweep.

### Bug 3: AI parse details micronutrients

- **Classification:** `known_fix`
- **Description:** AI details now receive parsed items, aggregate canonical micronutrients, show the top micronutrient by percent DV, and expand to remaining rows.
- **Files:** `WhyTheseNumbers.tsx`, `ConfirmationScreen.tsx`, `lib/i18n/en.ts`, and `WhyTheseNumbers.test.tsx`.
- **Tests:** Component coverage for top micronutrient, expand/collapse behavior, filtering, and non-AI source suppression.
- **Status:** Implemented.
- **Codex/security/E2E:** No blocking Codex or security findings. Covered by focused component tests and final validation.

### Bug 4: Library custom serving micronutrient scaling

- **Classification:** `known_fix`
- **Description:** Library-to-log hydration now preserves micronutrients and scales them by the selected serving ratio.
- **Files:** `lib/stores/useLogFlowStore.ts`, `lib/library/to-log-library-item.ts`, `LibraryList.tsx`, and mapper/component tests.
- **Tests:** `toLogLibraryItem` preserves micros; library-tab selection scales micros.
- **Status:** Implemented.
- **Codex/security/E2E:** Codex R1 found hydration still dropped `micros` and `approxGrams`; fixed in R1. Covered by targeted tests and final validation.

### Bug 5: Approximate gram text for parsed whole-style units

- **Classification:** `actually_a_feature`, approved into batch.
- **Description:** AI prompts and schemas now support model-provided `approxGrams`; new parsed/logged/library items persist and display subtle approximate gram text for non-gram serving units.
- **Files:** AI schemas/prompts, entry save, library create/fetch/mapper/update/merge, log/library UI surfaces, i18n, and focused tests.
- **Tests:** AI schema and prompt tests, library create schema, mapper preservation/scaling, library card display, Food Detail view display, and library-tab tests.
- **Status:** Implemented.
- **Codex/security/E2E:** Security L2 remains pending: `approxGrams` is positive/finite but not upper-bounded or normalized across all direct library mutation payloads. Covered by targeted tests and final validation.

### Bug 6: Remove egg-specific edit dropdown units

- **Classification:** `known_fix`
- **Description:** Food Detail edit dropdown no longer offers egg-specific units for new edits, while preserving legacy saved egg-specific values as selected disabled options.
- **Files:** `FoodDetailName.tsx` and `FoodDetail.mode-edit-query.test.tsx`.
- **Tests:** Component tests assert normal units remain, egg-specific options are absent, and legacy selected values are preserved.
- **Status:** Implemented.
- **Codex/security/E2E:** No blocking Codex or security findings. Covered by component tests and final validation.

### Bug 7: Progress kg/lb switch controls chart and entry

- **Classification:** `known_fix`
- **Description:** Progress page now has one top-level unit switch that drives quick-add and the weight trajectory chart, including goal, ticks, labels, and accessible text.
- **Files:** `app/(app)/progress/page.tsx`, `weight-quick-add.tsx`, `WeightTrajectoryLine.tsx`, and chart/quick-add tests.
- **Tests:** Imperial chart rendering tests and progress panel unit-switch tests.
- **Status:** Implemented.
- **Codex/security/E2E:** No blocking Codex or security findings. Covered by focused tests and final Playwright progress render sweep.

### Bug 8: Shared AI image-analysis quota

- **Classification:** `known_fix`
- **Description:** Vision recognition and library sketch generation now share the 20/day and 100/month AI image-analysis quota over `ai_call_log`; cache hits/reused results do not consume quota.
- **Files:** `app/api/ai/vision/route.ts`, sketch routes/pipeline/enqueue paths, library create/save enqueue paths, `lib/ai/cost-log.ts`, `lib/ai/image-analysis-quota.ts`, migration `0023_image_analysis_quota_call_type.sql`, and quota tests.
- **Tests:** Vision 429-before-Gemini and cache-hit tests, quota helper tests, sketch quota rejection/logging tests, and related API route tests.
- **Status:** Implemented.
- **Codex/security/E2E:** Codex R1 restored missing quota artifacts; Codex R2 updated generated types freshness for migration 0023. Security M2 fixed vision idempotency replay conflict for prior non-vision call IDs. Pending Minor: quota remains count-then-call rather than DB reservation based.

### Bug 9: Progress micronutrient table, tooltips, and ranking

- **Classification:** `actually_a_feature`, approved into batch.
- **Description:** Progress heatmap now uses canonical micronutrients, defaults to the four most under-target eligible rows, excludes upper-limit nutrients from default ranking, and expands/table-renders all eligible rows.
- **Files:** `lib/aggregations/progress.ts`, `MicronutrientHeatmap.tsx`, `HeatmapInteractive.tsx`, and aggregation/component tests.
- **Tests:** Canonical list aggregation, zero/<1% DV filtering, sodium/default-ranking exclusion, default four-row rendering, expand-all scroll behavior, and full table coverage.
- **Status:** Implemented.
- **Codex/security/E2E:** No blocking Codex or security findings. Covered by focused component/unit tests and final Playwright progress render sweep.

## Codex Summary

- **Round 1:** 2 Critical, 2 Improvement, 1 Minor. Critical/Improvement findings were fixed: missing Bug 2 implementation, missing quota artifacts, library hydration metadata preservation, and literal NUL byte in `LibraryList.tsx`. Minor count-then-call image-analysis quota race deferred.
- **Round 2:** 0 Critical, 1 Improvement, 1 Minor. Generated database types freshness for migration 0023 was fixed. The image-analysis quota reservation follow-up remained deferred.
- **Companion note:** Codex companion setup reported ready, but review jobs did not return retrievable findings; preserved artifacts record direct scoped adversarial reviews and the companion blocker.

## Security Summary

Security review found no Critical or High issues. Two Medium issues were fixed:
- Portion-only library mutations bypassing whole-style integer validation.
- Vision idempotency replay accepting prior non-vision AI call IDs.

Pending Low findings:
- Shared image-analysis quota is server-side and user-scoped, but count-then-call rather than atomic reservation based.
- `approxGrams` accepts any positive finite number and lacks a shared upper bound/unit-aware normalization across library create/update/merge surfaces.

## E2E And Final Validation Summary

Initial browser E2E was blocked by an existing `next dev` process using port 3000. After repair and server ownership cleanup, the Phase 7 Playwright sweep passed with 21 passed and 11 skipped. A later transient route-level 404 family could not be reproduced; final validation passed after confirming port 3000 was free and letting Playwright own the test server.

Final validation status: green.
