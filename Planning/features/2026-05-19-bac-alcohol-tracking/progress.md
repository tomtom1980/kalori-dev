# BAC Alcohol Tracking Progress

**Feature Folder**: `planning/features/2026-05-19-bac-alcohol-tracking/`  
**Status**: Completed, pushed, and deployed
**Last Updated**: 2026-05-19  

## Current Position

`complete`

Tasks A.1-A.7 are complete. Dev and production migration 0026 were applied and verified, commit `9ae4e98` was pushed to `origin/main`, and Vercel production deployment `dpl_6z4iGLypCzYNcCsJjvw4K4P2XYrT` is Ready and aliased to `https://kalori-one.vercel.app`.

## Decisions Locked

- Explicit alcohol metadata per alcoholic drink.
- 72-hour rolling BAC calculation window.
- 30-minute linear absorption.
- `0.015` BAC/hour elimination.
- Profile sex is strict `male | female`.
- Existing `other` rows backfill to `male`.
- Onboarding exposes only Male/Female going forward.

## Task Status

| Task | Status | Owner | Notes |
|---|---|---|---|
| A.1 Profile sex constraint migration | Completed | Database/Profile subagent | Added migration 0026 backfill/constraint/default; runtime validation and BMR now use `male | female` only |
| A.2 Alcohol persistence | Completed | API/Data subagent | Added `alcohol_logs`; save route persists server-computed grams on fresh alcoholic drink saves without replay duplicates |
| A.3 BAC calculation engine | Completed | Calculation subagent | Added pure BAC helper with 30-minute absorption, 0.015/hour elimination, clamp, and deterministic tests |
| A.4 Dashboard BAC fetch + snapshot | Completed | Dashboard data subagent | Dashboard fetches 72h alcohol window independent of viewed day and emits `snapshot.bac` |
| A.5 Drink logging UI | Completed | Log-flow UI subagent | Drink-only alcohol toggle with presets, custom volume/ABV, validation, and save payload wiring |
| A.6 Dashboard BAC widget | Completed | Dashboard UI subagent | BAC widget added beside hydration with estimated BAC, as-of timestamp, and refresh action |
| A.7 Verification, migration, production | Completed | Verification/release subagent | Dev/prod migration applied and verified; commit pushed; Vercel production Ready and live URL returns 200 OK |

## Resume Instructions

1. Load `planning/features/2026-05-19-bac-alcohol-tracking/manifest.md`.
2. Load `planning/features/2026-05-19-bac-alcohol-tracking/plan.md`.
3. Invoke `superpowers-exec-tomi` for task execution.
4. Execute with subagents according to the owner boundaries in `plan.md`.
5. Update this file after every completed task.

## Completed So Far

### A.1 Profile Sex Constraint Migration

- Added `supabase/migrations/0026_bac_alcohol_tracking.sql`.
- Backfilled `profiles.bio_sex = 'other'` to `male`, tightened DB constraint to `male | female`, and changed `handle_new_user()` default to `male`.
- Removed runtime/onboarding/BMR exposure of `other`.

### A.2 Alcohol Persistence

- Added `alcohol_logs` table with owner RLS, `entry_id` FK cascade, `entry_id` uniqueness, and `(user_id, consumed_at desc)` index.
- Extended `/api/entries/save` to accept top-level `alcohol` metadata for drink logs and compute ethanol grams server-side.
- Replays return before alcohol insert, preventing duplicate ledger rows.

### A.3 BAC Calculation Engine

- Added `lib/alcohol/bac.ts`.
- Covered empty logs, absorption ramp, elimination, clamping, determinism, and unsupported sex handling.

### A.4 Dashboard BAC Fetch + Snapshot

- Added dashboard alcohol log fetch bounded by `asOf - 72h` through `asOf`.
- Added BAC snapshot to dashboard aggregation using profile weight and biological sex.

### A.5 Drink Logging UI

- Added drink-only alcohol controls to the confirmation screen.
- Supports common alcohol presets plus custom volume and ABV inputs.
- Sends alcohol metadata only for drink entries with alcohol enabled.

### A.6 Dashboard BAC Widget

- Added `components/dashboard/BacTracker.tsx`.
- Displays estimated BAC, calculation timestamp, and an icon refresh action.
- Places BAC next to hydration on desktop and in the same stacked row on mobile.

### A.7 Verification, Migration, Production

- Added migration-script support and verification predicates for migration `0026`.
- Applied migration `0026` to dev and verified schema artifacts.
- Applied migration `0026` to production and verified schema artifacts.
- Commit `9ae4e98` pushed to `origin/main`.
- Vercel production deployment `dpl_6z4iGLypCzYNcCsJjvw4K4P2XYrT` is Ready and aliased to `https://kalori-one.vercel.app`.
- Live production URL returns `200 OK`.

## Verification Log

- A.1-A.4 targeted Vitest: 14 files / 98 tests passed.
- A.1-A.4 `pnpm typecheck`: passed.
- A.1-A.4 `git diff --check`: passed with existing CRLF normalization warnings only.
- Focused BAC/profile/migration regression suite: 7 files / 115 tests passed.
- BAC idempotency integration regression: 1 file / 2 tests passed.
- `pnpm typecheck`: passed.
- `pnpm test:unit`: passed, 196 files / 1724 tests.
- `pnpm lint`: passed with existing warnings only.
- `pnpm build`: passed.
- Dev migration `0026`: applied and verified.
- Production migration `0026`: applied and verified.
- Full `pnpm test`: 411 files passed, 3 files failed, 3183 tests passed, 13 failed. The earlier BAC mock failure is fixed; remaining failures are existing wheel-picker component test assumptions in library/log-flow tests and are documented for follow-up.
- Pre-push after rebase: `pnpm typecheck` and `pnpm test:unit` passed, 196 files / 1724 tests.
- Production verification: Vercel deployment `dpl_6z4iGLypCzYNcCsJjvw4K4P2XYrT` Ready; `https://kalori-one.vercel.app` returns `200 OK`.

## Blockers

- Full `pnpm test` includes unrelated component test failures around old quantity input test IDs versus the current wheel picker trigger UI in `tests/components/library-tab-continue-cta.test.tsx`, `tests/components/log-flow/LogFlowTabs-confirmation-wiring.test.tsx`, and `tests/components/log-flow/library-tab-preselect.test.tsx`.

## Next Action

None; feature release is complete. Remaining wheel-picker component test cleanup is outside the BAC feature scope.
