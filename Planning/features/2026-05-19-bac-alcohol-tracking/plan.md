# BAC Alcohol Tracking Implementation Plan

## Scope

Implement timestamped alcohol tracking for drink logs and a dashboard BAC widget with manual refresh. Also migrate biological sex handling from `male | female | other` to `male | female`, backfilling existing `other` rows to `male`.

## Source Decisions

- Persist all alcohol logs indefinitely.
- Dashboard BAC calculation uses the last 72 hours only.
- Alcohol absorption is linear over 30 minutes per drink.
- BAC elimination is `0.015` per hour.
- Existing `bio_sex = 'other'` profiles are migrated to `male`.
- New users can select only `male` or `female` in onboarding.
- US standard drink reference is 14g pure alcohol, used for presets and tests.

## Data Model

Preferred schema:

- Add `alcohol_logs` table linked to `food_entries.id`.
- Columns:
  - `id uuid primary key`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `entry_id uuid not null references public.food_entries(id) on delete cascade`
  - `volume_ml numeric(8,2) not null`
  - `abv_percent numeric(5,2) not null`
  - `alcohol_grams numeric(8,3) not null`
  - `consumed_at timestamptz not null`
  - `created_at timestamptz not null default now()`
- Index: `(user_id, consumed_at desc)`.
- RLS: same owner-only select/insert/update/delete posture as `food_entries`.

Rationale: `food_entries.items` remains nutrition-focused JSON. BAC needs a queryable timestamped alcohol ledger across day boundaries, so a dedicated table avoids JSON scans and keeps the dashboard query bounded.

## Tasks

### Task A.1: Profile Sex Constraint Migration

**Owner**: Database/Profile subagent  
**Files**:
- `supabase/migrations/0026_bac_alcohol_tracking.sql`
- `lib/database.types.ts`
- `lib/validation/onboarding.ts`
- `lib/nutrition/mifflin-st-jeor.ts`
- related tests

**Acceptance Criteria**
- AC1: Existing `profiles.bio_sex = 'other'` rows are updated to `male`.
- AC2: DB constraint accepts only `male | female`.
- AC3: `handle_new_user()` default is `male`.
- AC4: Runtime validation rejects `other`.
- AC5: BMR code/tests no longer expose the `other` branch.

### Task A.2: Alcohol Persistence

**Owner**: API/Data subagent  
**Files**:
- `app/api/entries/save/route.ts`
- `app/api/entries/copy-yesterday/route.ts` if alcohol copy is in scope
- `lib/dashboard/types.ts`
- new alcohol validation/calculation helper
- API/integration tests

**Acceptance Criteria**
- AC1: Saving an alcoholic drink persists an `alcohol_logs` row with grams and timestamp.
- AC2: Non-alcoholic drinks create no alcohol row.
- AC3: Replays do not duplicate alcohol rows.
- AC4: Validation bounds reject invalid ABV/volume.
- AC5: Entry delete cascades alcohol rows through FK.

### Task A.3: BAC Calculation Engine

**Owner**: Calculation subagent  
**Files**:
- `lib/alcohol/bac.ts`
- `tests/unit/lib/alcohol/bac.test.ts`

**Acceptance Criteria**
- AC1: No drinks returns `0`.
- AC2: A newly logged drink ramps absorption linearly over 30 minutes.
- AC3: A fully absorbed drink decays by `0.015` BAC/hour.
- AC4: BAC clamps at `0`.
- AC5: Calculation is deterministic for fixed `asOf`.
- AC6: Uses male/female body-water coefficients only.

### Task A.4: Dashboard BAC Fetch + Snapshot

**Owner**: Dashboard data subagent  
**Files**:
- `lib/dashboard/fetch.ts`
- `lib/dashboard/aggregate.ts`
- `lib/dashboard/types.ts`
- dashboard aggregation tests

**Acceptance Criteria**
- AC1: Dashboard fetches alcohol logs from `asOf - 72h` through `asOf`.
- AC2: Fetch is independent of the viewed dashboard day.
- AC3: Snapshot contains BAC value and `calculatedAt`.
- AC4: Cross-midnight alcohol logs still affect BAC until eliminated/windowed out.

### Task A.5: Drink Logging UI

**Owner**: Log-flow UI subagent  
**Files**:
- `app/(app)/log/_components/ConfirmationScreen.tsx`
- `app/(app)/log/_components/Confirmation/TimeEditor.tsx` if needed for timestamp consistency
- `lib/i18n/en.ts`
- component tests

**Acceptance Criteria**
- AC1: Drink category exposes alcohol controls.
- AC2: Controls capture alcoholic toggle, volume, ABV, and/or standard-drink presets.
- AC3: Non-drink meal categories do not show alcohol controls.
- AC4: Submitted payload includes alcohol metadata only when alcoholic.
- AC5: UI remains accessible with labels, focus states, and validation messages.

### Task A.6: Dashboard BAC Widget

**Owner**: Dashboard UI subagent  
**Files**:
- new `components/dashboard/BacTracker.tsx` or equivalent
- `app/(app)/dashboard/page.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- component/visual tests

**Acceptance Criteria**
- AC1: BAC widget displays default `0.0` when no alcohol applies.
- AC2: BAC widget displays current estimated BAC and “as of” timestamp.
- AC3: Manual refresh updates BAC and timestamp without requiring full navigation.
- AC4: The widget is placed next to the drink/water dashboard area without layout overlap.
- AC5: Refresh button is icon-based, labelled for screen readers, keyboard accessible.

### Task A.7: Verification, Migration, Production

**Owner**: Verification/release subagent  
**Files**:
- `scripts/apply-prod-migrations-incremental.mjs` verification entry for `0026`, if needed
- `planning/features/2026-05-19-bac-alcohol-tracking/progress.md`
- `planning/CHANGELOG.md`
- `planning/progress.md`

**Acceptance Criteria**
- AC1: `pnpm test` passes or failures are documented as pre-existing.
- AC2: `pnpm typecheck` passes.
- AC3: `pnpm lint` passes.
- AC4: `pnpm build` passes.
- AC5: Migration applies to dev first, then production.
- AC6: Vercel production deployment is verified at `https://kalori-one.vercel.app`.

## Subagent Execution Rules

- Use subagents for each task owner above.
- Subagents are not alone in the codebase; they must not revert unrelated edits.
- Each coding subagent owns only the files listed in its task unless coordination is explicitly needed.
- TDD is required for logic and UI behavior.
- Main agent integrates results, resolves conflicts, runs final verification, and updates progress.

## Open Implementation Notes

- BAC coefficient constants should be named and tested. Use a conservative, clearly documented Widmark coefficient table for male/female.
- Display copy should call BAC an estimate, not legal/medical advice.
- Manual refresh can be implemented as a client island that calls a lightweight BAC endpoint, or by router refresh if the dashboard snapshot already contains everything. Prefer the smaller implementation after code inspection.
- If copying yesterday’s entries copies alcoholic drink entries, decide whether the new `consumed_at` should be “now” or preserve old time-of-day. Recommended: if copied to today, use the new copied entry timestamp so BAC does not resurrect yesterday’s exact drinking time.

## Approval State

Planning is locked. Implementation has not started. Next user command should be:

`approved, start implementation`
