# Migration Plan — MVP Stabilization Sprint

**Purpose:** Sprint-introduced migration list with apply order, executor role, rollback plan, and prod cutover runbook.
**Who reads this:** Implementation sub-agent on US-STAB-D6 (Phase D, migration 0018); Phase E orchestrator running prod cutover (US-STAB-E1).
**Authoritative source:** `Planning/features/2026-05-01-mvp-stabilization/design-doc.md` §7 (sprint-level) + `Planning/architecture.md` §2–§3 (project-level DDL/RLS conventions). When this plan disagrees with sprint design-doc §7, the sprint design-doc wins. When sprint design-doc disagrees with project architecture, project architecture wins.

---

## 1. Migration count (LOCKED)

| Migration # | Status | Phase | Story |
|---|---|---|---|
| **0018** | IN SCOPE — applied to dev per-task at D6 RED→GREEN; applied to prod at Phase E.1 batch | D | US-STAB-D6 |
| **0019** | DEFERRED (per DT-5 / O-2) — `profiles.micros_rda_override` jsonb column NOT created in this sprint; tracked as `F-MICROS-RDA-OVERRIDE-COLUMN` for post-MVP | n/a | n/a |
| **0020** | RESERVED-NOT-USED (per DT-2 / D3 honest-copy-only scope-down) — was originally allocated for offline-conflict-resolver server-side state; D3 stays honest-copy-only so no schema needed; full client-wins-resubmit impl remains DEFERRED under existing followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` | n/a | n/a |

**Net sprint-introduced migrations: 1 (0018 only).**

---

## 2. Migration 0018 — `food_library_items` partial unique index

### Filename + path

`supabase/migrations/0018_food_library_dedup_index.sql`

(Design doc §7 references the longer filename `0018_food_library_items_dedup_partial_unique.sql`; the actual filename committed at task time should match Supabase migration filename conventions in `Planning/architecture.md` §2 + the existing 0001–0017 naming pattern. Either name acceptable as long as the migration number is `0018` and the file is the next file in the migration sequence.)

### Goal

Prevent RACE-condition duplicate inserts at the database layer. Add a partial unique index on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` so:
- Active-row uniqueness is enforced (concurrent `INSERT` for same `(user_id, normalized_name)` returns `23505`).
- Soft-deleted rows do NOT block re-insert (a user who deletes "kale" can re-add "kale").
- Rows with `normalized_name IS NULL` (legacy or unset rows) are not affected by the constraint.

### Index spec

```sql
CREATE UNIQUE INDEX food_library_items_user_normalized_name_unique
ON food_library_items (user_id, normalized_name)
WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;
```

If `normalized_name` column is absent from the schema at sprint start (verify before writing the migration), use `lower(unaccent(name))` as the indexed expression instead — see Vietnamese-diacritic note in design-doc §7 P-3 mitigation.

### Pre-migration cleanup (verbatim from design-doc §7)

The cleanup-and-index sequence runs as a SINGLE atomic transaction:

```sql
BEGIN;

-- Step 1: Acquire write-blocking lock for the entire transaction
LOCK TABLE food_library_items IN ACCESS EXCLUSIVE MODE;

-- Step 2: Identify duplicate active rows by (user_id, normalized_name) WHERE deleted_at IS NULL
-- (Implementation detail: see CTE below)

-- Step 3: Keep the most-recently-updated_at row per duplicate group
-- (Implementation detail: see CTE below)

-- Step 4: Soft-delete (set deleted_at = now()) all other duplicates in the group
WITH duplicates AS (
  SELECT id,
         user_id,
         normalized_name,
         updated_at,
         row_number() OVER (
           PARTITION BY user_id, normalized_name
           ORDER BY updated_at DESC, id DESC
         ) AS rn
  FROM food_library_items
  WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
)
UPDATE food_library_items
SET deleted_at = now()
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 5: ASSERT zero active duplicates remain
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM (
    SELECT 1 FROM food_library_items
    WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
    GROUP BY user_id, normalized_name
    HAVING count(*) > 1
  ) AS dupes;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Cleanup left % duplicate active groups; aborting before unique index', remaining;
  END IF;
END $$;

-- Step 6: Create the partial unique index INSIDE the locked transaction
CREATE UNIQUE INDEX food_library_items_user_normalized_name_unique
ON food_library_items (user_id, normalized_name)
WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;

-- Step 7: Release lock atomically with the index becoming visible to other sessions
COMMIT;
```

The 7-step sequence is the canonical race-safe form per design-doc §7.

### Race-safety contract (write-blocking)

Per design-doc §7: ACCESS EXCLUSIVE LOCK is held continuously from cleanup through index creation. Without this lock, a concurrent library insert could create a new duplicate row AFTER step 5's assert and BEFORE step 6's `CREATE UNIQUE INDEX`, breaking the migration nondeterministically during Phase E prod cutover.

ACCESS EXCLUSIVE is acceptable here because:
1. Kalori is a single-user MVP at soft-launch — concurrent library writes are rare in practice.
2. The cleanup transaction is short (sub-second on the expected row count — kalori-prod has handfuls of library rows, not millions).

If write-blocking proves too aggressive at prod cutover (e.g., on a future multi-user fleet), the alternative is an application-level write-pause window documented in the Phase E runbook below. Pick ACCESS EXCLUSIVE for THIS sprint.

### Executor role — SECURITY DEFINER via service-role key

Per design-doc §7 Executor role subsection + N-I1 fix.

The migration executes via `SECURITY DEFINER` (Supabase service-role key) — required because:
- The cleanup soft-deletes duplicate rows across multiple `user_id` values.
- Under the runtime RLS policy (`auth.uid() = user_id`), the `UPDATE` cannot reach rows owned by other users.
- Index creation similarly requires service-role to bypass RLS during the structural change.

Execution context matches `scripts/apply-prod-migrations.mjs` (service-role key from `Planning/apikeys.txt` for prod / `Planning/devapikeys.txt` for dev).

**Runtime RLS for `food_library_items` is unchanged after the migration.** The 32-assertion RLS harness must still pass at every phase close (per Migration RLS contract below).

### Migration RLS contract

All sprint migrations preserve the existing 32-assertion RLS harness GREEN. New columns inherit existing per-user-isolation policies. New indexes do not change row visibility. AC5 of US-STAB-D6 explicitly asserts this at task-close time.

### Test coverage map (D6 ACs)

| AC | What it asserts | Test file (planned) |
|---|---|---|
| AC1 | Index exists on `(user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` after migration applies to dev | `tests/integration/db/0018-migration.test.ts::index-exists-with-soft-delete-predicate` |
| AC2 | Duplicate active-row insert (same user, same `normalized_name`, both `deleted_at IS NULL`) fails with `23505` | `tests/integration/library-create.test.ts::dedup-blocks-duplicate-active-insert` |
| AC3 | Pre-cleanup transaction identifies dupes by `(user_id, normalized_name) WHERE deleted_at IS NULL`, keeps most-recent `updated_at`, soft-deletes the rest, asserts zero, creates index | `tests/integration/db/0018-pre-cleanup.test.ts::transactional-dedup-then-index` + manual runbook |
| AC4 | Soft-deleted duplicates do NOT block re-insertion of same `(user_id, normalized_name)` as a NEW active row | `tests/integration/library-create.test.ts::soft-deleted-does-not-block-reinsert` |
| AC5 | Existing 32-assertion RLS harness still GREEN after migration applies | existing harness, no new file |
| AC6 | Cleanup AND index creation execute inside SINGLE transaction beginning with `LOCK TABLE ... ACCESS EXCLUSIVE`; lock held continuously through `CREATE UNIQUE INDEX` | `tests/integration/db/0018-pre-cleanup.test.ts::single-transaction-with-access-exclusive-lock` |
| AC7 | Migration executes under `SECURITY DEFINER` via service-role key; runtime RLS unchanged | `tests/integration/db/0018-pre-cleanup.test.ts::executes-as-service-role-and-rls-unchanged` |

---

## 3. Apply order (Q7 = A: per-task to dev, batch to prod at Phase E)

### 3.1 Per-task to kalori-dev (at Phase D US-STAB-D6 RED→GREEN)

1. Implementation sub-agent on US-STAB-D6 writes the migration file at `supabase/migrations/0018_food_library_dedup_index.sql`.
2. RED test commits FIRST — `tests/integration/db/0018-migration.test.ts::index-exists-with-soft-delete-predicate` should fail because the index does not exist yet.
3. Pre-flight cleanup probe runs: `scripts/dedup-pre-flight.mjs` (per FF #C mitigation in design-doc §10) against kalori-dev. If existing dupes found, halts with manual-review prompt. Documented runbook for resolution: keep most-recent `updated_at`, soft-delete older(s).
4. Migration applies to `kalori-dev` via `DATABASE_URL_DIRECT` (port 5432) OR Supabase CLI — same path used for migrations 0001–0017.
5. RED test re-runs and turns GREEN.
6. Per-task Codex (via `codex:rescue` sub-agent) reviews migration SQL alongside the task code (D8: per-task Codex required for Medium tasks).
7. Auto-fix Critical + Improvement findings in 2 rounds max.

### 3.2 Batch to kalori-prod at Phase E.1 closure

Migration 0018 is the ONLY sprint migration in the prod cutover batch (0019 deferred per DT-5; no 0020).

Cutover runs once at Phase E.1 (US-STAB-E1) via `scripts/apply-prod-migrations.mjs`:
1. Pre-flight schema diff: dev schema vs prod schema — must match expected delta (only 0018 added; everything else identical).
2. Apply 0018 to `kalori-prod`.
3. Post-cutover verify: assert partial unique index exists in `pg_indexes` on `food_library_items (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`.
4. Smoke against prod (read-only — RLS-bound, anon role, expect appropriate denials).
5. Record cutover evidence at `Planning/features/2026-05-01-mvp-stabilization/acceptance-evidence/phase-E-prod-migration.md`.

---

## 4. Rollback plan for 0018

### 4.1 Rollback procedure

```sql
DROP INDEX IF EXISTS food_library_items_user_normalized_name_unique;
```

Online drop, no data loss. The soft-deleted duplicates from the cleanup step REMAIN in deleted state (no automatic restore — by design, since the data was duplicate by definition).

If the user wants to restore soft-deleted rows after rollback (corner case — they should not), they must manually `UPDATE food_library_items SET deleted_at = NULL WHERE id IN (...)`. This is NOT a documented sprint operation; if needed, escalate to user.

### 4.2 Rollback safety

- DROP INDEX does not break any consumers — the application reads from `food_library_items` via `SELECT` paths that don't reference the index name; the optimizer falls back to seq scan on small tables.
- No new code path in the sprint depends on the index existing at runtime (the index is purely a CONSTRAINT, not a query optimization).
- Re-run is idempotent if needed: re-applying 0018 after a DROP runs the same 7-step cleanup; cleanup is itself idempotent (every duplicate group has at most one most-recent row to keep, all others are soft-deleted; running twice produces the same final state).

### 4.3 When to rollback

Only if Phase E.1 prod cutover post-conditions fail:
- Index creation succeeded but cleanup left active duplicates (assert step 5 should have raised, but if it somehow didn't)
- Application errors on library writes after cutover (suggests the active-row uniqueness contract clashes with a previously-tolerated duplicate workflow — would indicate a missed scope item)
- Cross-user data-isolation regression in the RLS 32-assertion harness (would indicate a security flaw in the cleanup `UPDATE`)

---

## 5. Pre-cutover verification

### 5.1 Pre-flight script (against dev)

`scripts/dedup-pre-flight.mjs` (FF #C mitigation):
- Lists existing duplicate `(user_id, normalized_name) WHERE deleted_at IS NULL` tuples in `food_library_items`.
- Halts with manual-review prompt if any exist.
- Documented runbook for resolution: keep most-recent `updated_at`, soft-delete older(s).

(Even though the migration's own cleanup CTE handles the same duplicates atomically inside the transaction, running the pre-flight first lets the operator inspect the data before the lock acquires — useful when prod is being touched.)

Sample probe SQL (informational — actual implementation in `scripts/dedup-pre-flight.mjs`):

```sql
SELECT user_id,
       normalized_name,
       count(*) AS dup_count,
       array_agg(id ORDER BY updated_at DESC) AS row_ids_newest_first
FROM food_library_items
WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
GROUP BY user_id, normalized_name
HAVING count(*) > 1;
```

### 5.2 Schema diff (dev vs prod) before cutover

Per design-doc §10 P-5 and `apply-prod-migrations.mjs` pre-flight contract:
- Run `supabase db diff` (or equivalent) between dev and prod schemas.
- Expected delta: ONLY the new index `food_library_items_user_normalized_name_unique` and any soft-delete updates to `food_library_items` rows from cleanup.
- If prod has unexpected schema state (manually-applied data fix, bypassed migration, etc.), halt with manual-review prompt.

---

## 6. Post-cutover verification

### 6.1 Index existence

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname = 'food_library_items_user_normalized_name_unique';
```

Expected: single row matching the spec, with the `WHERE deleted_at IS NULL AND normalized_name IS NOT NULL` predicate visible in `indexdef`.

### 6.2 Active-row uniqueness contract

Test with intentional double-save (in dev only, since prod test data lives in user library):
1. INSERT a `food_library_items` row with `user_id = X`, `normalized_name = 'phoTest'`, `deleted_at = NULL`. Should succeed.
2. INSERT a second row with the same `(user_id, normalized_name)` and `deleted_at = NULL`. Should fail with `23505 unique_violation`.
3. UPDATE the first row to `deleted_at = now()` (soft-delete).
4. INSERT a third row with the same `(user_id, normalized_name)` and `deleted_at = NULL`. Should SUCCEED (soft-deleted row does not block).

### 6.3 RLS regression check

Run the 32-assertion RLS harness post-cutover. Every assertion must remain GREEN. Any regression blocks Phase E close (per design-doc §13 closure criterion #7).

---

## 7. Migration 0019 — DEFERRED

Per design-doc §7 + DT-5 + O-2. The originally-proposed `profiles.micros_rda_override jsonb` column is NOT created in this sprint:
- **Rationale:** Single-user MVP doesn't need per-user override day-1 (per Over-Engineering Reviewer perspective).
- **Tracking:** logged as `F-MICROS-RDA-OVERRIDE-COLUMN` in `Planning/followups.md` for post-MVP.
- **C1 implementation impact:** US-STAB-C1 dashboard panel reads RDA values from the code constant `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` only. AC4 of US-STAB-C1 explicitly asserts code-constant-only reads.
- **If user requests overrides post-soft-launch:** un-defer the followup, mint a new migration (numbering is open — could be 0019 if no migration has shipped between now and then), add a JSONB column to `profiles`, gate dashboard panel logic behind the override-or-fallback resolver.

Sprint design-doc §7 Phase E gate, US-STAB-C1 ACs, US-STAB-E1 AC2, design-doc §10 U-5, manifest Q7 implementation note, design-doc §11 Decision Summary, design-doc §10 P-5, design-doc §8 [project-sweep], and design-doc §13 closure criterion #4 all consistently reflect the deferral.

---

## 8. Migration 0020 — RESERVED, NOT USED

Per design-doc §7 + DT-5 + DT-2. The originally-allocated migration slot for D3 client-wins-resubmit server-side state is NOT used in this sprint:
- **Rationale:** D3 stays honest-copy-only per DT-2 (modal already shipped honest CTAs in Phase 5.1.5 Codex F2/F3 fixes; full client-wins-resubmit impl scope blow-up was the Top Failure Mode #D in design-doc §10 — already mitigated by scope-down).
- **Tracking:** the deferred work spec lives in design-doc §7 "Deferred D3 work spec — full client-wins-resubmit impl" subsection (informational only; no sprint task references it). The deferred work is tracked under the EXISTING followup `F-OFFLINE-5.1.5-CLIENT-WINS-RESUBMIT` (do NOT mint a duplicate `-IMPL` ID).
- **D3 sprint scope:** verification-only + AC3 i18n regression guard + AC4 click-handler binding regression guard. No schema change. No new migration.

---

## 9. Migration test fixture additions (additive only)

Per testing-strategy.md (sprint) + design-doc §5 + design-doc §7:
- New file `tests/integration/db/0018-migration.test.ts` covers AC1.
- New file `tests/integration/db/0018-pre-cleanup.test.ts` covers AC3, AC6, AC7.
- Existing `tests/integration/library-create.test.ts` extended with AC2 + AC4 cases.
- Existing 32-assertion RLS harness un-modified (AC5 just re-runs it).

No existing migration test fixtures are modified by sprint work.

---

End of migration plan.
