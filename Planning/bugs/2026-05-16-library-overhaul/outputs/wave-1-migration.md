# Wave 1 — DB Migration output (bugfix-2026-05-16-library-overhaul)

**Status:** complete. Migration applied to `kalori-dev` (`aaiohznsqlqchsoxaqkz`). Prod apply deferred to Phase 8 commit.

## Artifacts shipped

| File | Lines | Purpose |
|---|---|---|
| `supabase/migrations/0021_library_overhaul.sql` | 148 | Schema delta — Bug 5 (4 columns) + Bug 6 (CHECK widening). |
| `tests/integration/library-overhaul-migration-0021.test.ts` | 251 | Real-DB integration test, 6 cases (RED-first → GREEN). |
| `lib/database.types.ts` | 524 | Regenerated via `npx supabase gen types typescript --project-id aaiohznsqlqchsoxaqkz --schema public`; freshness markers updated (newest=`0021_library_overhaul.sql`, content-hash=`fcc47f8288f41d14090723fead71baba2b884912a9c0feb30bdbc7af4d887500`). |
| `scripts/apply-migration-0021.mjs` | 52 | Apply script (dev default; pass `Planning/apikeys.txt` arg for prod). |

## Migration contents

### Bug 6 — `created_from` CHECK widening

```sql
ALTER TABLE public.food_library_items
  DROP CONSTRAINT IF EXISTS food_library_items_created_from_check;
ALTER TABLE public.food_library_items
  ADD CONSTRAINT food_library_items_created_from_check
  CHECK (created_from IN ('text', 'photo', 'manual'));
```

DROP + ADD swap — standard Postgres pattern for widening an enumeration CHECK without touching the column itself. Existing rows cannot violate the new constraint (superset of prior set).

### Bug 5 — 4 sketch-tracking columns

```sql
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS thumbnail_kind text NULL;
ALTER TABLE public.food_library_items
  ADD CONSTRAINT food_library_items_thumbnail_kind_check
  CHECK (thumbnail_kind IS NULL OR thumbnail_kind IN ('photo', 'sketch'));

ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_generated_at timestamptz NULL;
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.food_library_items
  ADD COLUMN IF NOT EXISTS sketch_last_error text NULL;
```

All four columns carry `COMMENT ON COLUMN` annotations explaining purpose, NULL semantics, and the Bug 5 association.

## TDD discipline

- **RED step** (against dev DB BEFORE migration apply): 5 of 6 tests failed; 1 passed.
  - AC-6 manual INSERT: failed with `23514 food_library_items_created_from_check` (canonical "fail for the right reason").
  - AC-5 new-column round-trip / default / RLS: failed with `PGRST204 (schema cache)` + `42703 column does not exist`.
  - AC-6 bogus rejection: PASSED (pre-migration CHECK still correctly rejects unknown values — sanity-check the test logic itself).
- **GREEN step** (against dev DB AFTER migration apply): all 6 tests pass in 26.94s.

Verbatim RED proof captured during run before migration apply — pasted into the wave-1 conversation transcript.

## Database.types.ts regeneration

Used `npx supabase gen types typescript --project-id aaiohznsqlqchsoxaqkz --schema public`. Result:
- Stripped trailing `<claude-code-hint>` tag (Supabase CLI artifact).
- Prepended the project-standard header (lines 1-8) with:
  - `Generated <iso> from migrations through 0021_library_overhaul.sql`
  - `Migrations content hash: fcc47f8288f41d14090723fead71baba2b884912a9c0feb30bdbc7af4d887500`
- Prettier-formatted to match prior style (single quotes, trailing semicolons).
- Verified via `scripts/schema-drift-check.mjs#isTypesFileFresh` → `fresh: true`.

Four new columns appear in Row + Insert + Update unions:
```ts
sketch_attempt_count: number;
sketch_generated_at: string | null;
sketch_last_error: string | null;
thumbnail_kind: string | null;
```

## RLS verification

`food_library_items` keeps its four `auth.uid() = user_id` policies from migration 0003 (SELECT / INSERT / UPDATE / DELETE). Policies key on `user_id` only; new columns INHERIT isolation automatically. The integration test includes an explicit cross-user check (User B cannot SELECT nor UPDATE User A's `sketch_attempt_count` / `sketch_last_error`) — passes against the live dev DB.

## Deviations from the briefing

1. **No new partial index** added for sketch backfill candidates. Bug 5 proposal mentioned this as an option; given single-user MVP volume (~50-150 rows) a partial index on `(user_id) WHERE thumbnail_kind IS NULL` does not earn its maintenance cost. Wave 5's backfill worker can use a sequential scan inside a single-user RLS scope without observable latency. Documented in the migration header.
2. **Test file path** is `tests/integration/library-overhaul-migration-0021.test.ts` (sibling of `library-create-real-db-dedup.test.ts`) rather than `tests/integration/migrations/0021-...test.ts`. Reason: there is no `tests/integration/migrations/` directory in the project; migration-contract tests live alongside other library integration tests in `tests/integration/`, matching the precedent set by D.6 (migration 0020).
3. **Apply script** named `scripts/apply-migration-0021.mjs` — mirrors precedent (`apply-migration-0018.mjs`, `apply-migration-0019.mjs`). Defaults to dev credentials so prod apply is an explicit opt-in (`node scripts/apply-migration-0021.mjs Planning/apikeys.txt`).
4. **Prod NOT applied yet.** This sub-agent applied to `kalori-dev` only. Phase 8 commit will include a "apply to prod" reminder; user must run the prod apply explicitly when the batch is ready for production.

## Hand-off note for Wave 5 (Bugs 5/6 code implementation)

Migration ready. Column names landed in dev DB:

```
food_library_items.thumbnail_kind        text NULL  CHECK (NULL | 'photo' | 'sketch')
food_library_items.sketch_generated_at   timestamptz NULL
food_library_items.sketch_attempt_count  integer NOT NULL DEFAULT 0
food_library_items.sketch_last_error     text NULL
```

`food_library_items.created_from` CHECK now accepts `'text' | 'photo' | 'manual'`.

`lib/database.types.ts` Row/Insert/Update types are up-to-date — TypeScript writers for the new fields will type-check immediately. Schema-drift CI guard PASSES.

When Wave 5 implements `/api/library/create`, the route handler can set `created_from: 'manual'` and Postgres will accept it. When Wave 5 implements the Gemini sketch worker, the existing UPDATE path needs to set `thumbnail_url`, `thumbnail_kind: 'sketch'`, `sketch_generated_at: now()`, increment `sketch_attempt_count`. Error path sets only `sketch_attempt_count` + `sketch_last_error`.

## Test results

```
RUN  v4.1.4 (env-loaded, against kalori-dev)
 ✓ tests/integration/library-overhaul-migration-0021.test.ts (6 tests) 26.94s
   ✓ AC-6: created_from = 'manual' INSERT succeeds after migration
   ✓ AC-6: created_from = 'bogus' INSERT still rejected with 23514 check_violation
   ✓ AC-5: new sketch tracking columns round-trip on INSERT/SELECT
   ✓ AC-5: thumbnail_kind CHECK rejects values other than photo/sketch with 23514
   ✓ AC-5: sketch_attempt_count defaults to 0 when omitted on INSERT
   ✓ RLS: User B cannot SELECT or UPDATE User A sketch columns on the new row

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## Blockers

None.

## Next-wave dependencies

- Wave 2-4 sub-agents can proceed in parallel with their respective bugs (1-4, 7-12) — no schema dependency.
- Wave 5 (Bugs 5 + 6 code) starts when Wave 1 is committed.
- Phase 8 must apply migration 0021 to prod before the Bug 6 route ships (`scripts/apply-migration-0021.mjs Planning/apikeys.txt`).
