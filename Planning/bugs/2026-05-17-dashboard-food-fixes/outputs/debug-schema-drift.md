# Debug: schema-drift generated types freshness

## Scope

Targeted only the full-suite failure in:

- `tests/integration/schema-drift/generated-types-fresh.test.ts`

## Phase 1: Reproduction

Command:

```powershell
pnpm vitest run tests/integration/schema-drift/generated-types-fresh.test.ts --reporter=verbose
```

Result before fix:

- Failed 1 test.
- Error: `expected ... to contain '0022_profiles_birthday.sql'`.
- `lib/database.types.ts` header said it was generated through `0021_library_overhaul.sql`.

## Phase 2: Root Cause Evidence

Newest migration on disk:

- `supabase/migrations/0022_profiles_birthday.sql`

The migration adds only:

- `public.profiles.birthday date`

`lib/database.types.ts` already contained `birthday: string | null` in:

- `profiles.Row`
- `profiles.Insert`
- `profiles.Update`

Schema scan also reported no field drift:

```powershell
node scripts/schema-drift-check.mjs --mode report-only --paths app lib tests --types-file lib/database.types.ts
```

Result:

- `232 references inspected`
- `0 drift findings`

Conclusion:

- The generated type body already reflects the `0022_profiles_birthday.sql` schema change.
- The root cause was stale freshness metadata in the generated types header, not missing schema fields and not a test environment issue.

## Phase 3: Hypothesis

Updating only the freshness header to the newest migration name and current migration content hash should satisfy the freshness contract without changing generated schema types.

Current migration corpus hash:

```text
c80255e8ebb844b31aa837643fb158d5ed6ab1b98f68fc5ef3d4bc10bc8dc70c
```

## Phase 4: Fix

Updated the first two header lines in `lib/database.types.ts`:

- `from migrations through 0022_profiles_birthday.sql`
- `Migrations content hash: c80255e8ebb844b31aa837643fb158d5ed6ab1b98f68fc5ef3d4bc10bc8dc70c`

No generated type body was changed.

## Verification

Passed:

```powershell
pnpm vitest run tests/integration/schema-drift/generated-types-fresh.test.ts --reporter=verbose
```

- 1 file passed
- 1 test passed

Passed:

```powershell
pnpm schema-drift
```

- `218 references inspected`
- `0 drift findings`

Passed:

```powershell
pnpm vitest run tests/integration/schema-drift/check-fixtures-and-app-code.test.ts --reporter=verbose
```

- 1 file passed
- 2 tests passed

Note:

- Running `check-fixtures-and-app-code.test.ts` and `scanner-edge-cases.test.ts` in the same Vitest invocation produced a transient `ENOENT` for `alias-syntax.fixture.ts`.
- Running the target failure and the fixture scan independently passed. This appears separate from the generated-types freshness failure and was not changed.

## Changed Paths

- `lib/database.types.ts`
- `planning/.tmp/bugfix-2026-05-17-dashboard-food-fixes/outputs/debug-schema-drift.md`
