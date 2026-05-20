# Codex Review Round 1

Codex companion adversarial-review was unavailable: neither `$HOME\.Codex\plugins\marketplaces\openai-codex\plugins\codex\scripts\codex-companion.mjs` nor `$HOME\.codex\plugins\marketplaces\openai-codex\plugins\codex\scripts\codex-companion.mjs` exists. Manual adversarial review performed.

Verification run:
- `pnpm typecheck` passed.
- `pnpm exec vitest run --pool threads --maxWorkers 1 tests/unit/components/DuplicateLogConfirmDialog.test.tsx tests/components/library/LibraryClient.quick-actions.test.tsx tests/components/library/FoodDetail-LogNow-Retry.test.tsx tests/components/log-flow/SnapTab.test.tsx tests/components/progress/WeeklyReviewCore.test.tsx tests/components/progress/WeeklyReviewIsland.period.test.tsx tests/unit/components/dashboard/DailyEditorsNote.test.tsx tests/unit/components/charts/ChronometerRing.test.tsx` passed: 8 files, 44 tests.

## Findings

### Improvement 1 - Bulk library logging still bypasses the duplicate confirmation dialog

File: `app/(app)/library/_components/LibraryClient.tsx:604`

The new in-app duplicate confirmation is wired for standard confirmation saves, per-card quick log, and FoodDetail Log Now, but the bulk-log path still sends all selected items through `Promise.allSettled` and treats any duplicate `409 duplicate_food_entry` as a generic failed log count. That means a user bulk-logging library foods into a meal slot can still hit the same "same food, same meal" duplicate condition without receiving the requested in-site "are you sure?" confirmation.

Fix required: in `performBulkLog`, detect `AuthApiError` 409 bodies with `error === 'duplicate_food_entry'`, prompt through `confirmDuplicateLog`, and retry confirmed duplicate requests with `allow_duplicate: true`. If multiple selected rows duplicate, use one clear confirmation before retrying duplicate rows, or a deterministic per-row loop that does not silently drop confirmed duplicates. Add a focused test for selected-items bulk log where one request returns the duplicate 409 and confirm retries with `allow_duplicate`.

## Minor Notes

- `public/sw.js` and `next-env.d.ts` are dirty generated artifacts but are not represented in `state.md` `files_touched`; verify whether they belong to the production/deploy step before staging the batch.
- `public/sw.js` is a generated one-line dev-labeled service worker. If production deployment regenerates it intentionally, this is fine; otherwise avoid carrying generated drift into the bugfix commit.
