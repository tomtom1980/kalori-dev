# Bug 1 — Implementation Output

## Files Touched

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts` (save-to-library INSERT block; added `log_count: 1` and `last_used_at: new Date().toISOString()` plus a 25-line rationale comment)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\api\entries-save.test.ts` (added 3 new tests inside the existing save-to-library `describe` block)

## Tests Added

In `tests/unit/api/entries-save.test.ts`, inside
`describe('save-to-library — server-computed normalized_name + full nutrition (Task 4.7.3)')`:

1. `Bug 1: save-to-library new row gets log_count=1 (not the DB default 0)` —
   asserts the captured `food_library_items` INSERT payload carries
   `log_count === 1`.
2. `Bug 1: save-to-library new row gets last_used_at = now() (within a few seconds)` —
   asserts `last_used_at` is a parseable ISO-8601 string whose epoch ms lies
   in the request's wall-clock window. Defends against future regressions
   that pass `null` or omit the field.
3. `Bug 1: regression — save_to_library=false path remains untouched` —
   defends against accidental cross-pollination: when the user did not ask
   to save, NO library row gets inserted. (Duplicates an existing test that
   sits earlier in the file — kept the new one co-located with the Bug 1
   suite for readability; the duplication is intentional.)

## Test Run Result

- RED verified — initial run with new tests + un-patched route showed
  failures at the exact expected lines:
    `AssertionError: expected undefined to be 1` (log_count)
    `AssertionError: expected 'undefined' to be 'string'` (last_used_at)
- GREEN verified — full suite:
    `Test Files  395 passed | 18 skipped (413)`
    `Tests       2980 passed | 99 skipped (3079)`

The 18 skipped Test Files match the pre-existing baseline from
`Planning/setup-state.md` notes (skipped intentionally — not regressions).
No failed tests.

## Typecheck / Lint

- `pnpm typecheck` — clean (zero output, exit 0).
- `pnpm exec eslint app/api/entries/save/route.ts tests/unit/api/entries-save.test.ts` — clean (zero output, exit 0).

## Deviations from Proposal

None of substance. Two minor notes:

- Proposal's Test Approach #3 (`re-log path counter behavior unchanged`)
  was already locked by the existing test bed for the re-log COUNT(*)
  pattern (`tests/integration/library-relog-bumps-counters.test.ts` and the
  `food_entries.count: 'exact'` path in `route.ts:451-503`). The unit-mock
  layer cannot easily simulate `.select('id', { count: 'exact', head: true })`
  without rebuilding the `entriesTable` mock to a 5th branch — and the
  integration test exists to lock this exact invariant. Skipped at the unit
  layer; the existing integration test already covers this regression
  surface.
- Proposal's Test Approach #4 (`manual-source library-create unaffected`)
  is unrelated to `app/api/entries/save` — it concerns `app/api/library/create`,
  a different route handler whose code path is not changed by this fix.
  Existing `tests/unit/api/library-create.test.ts` and
  `tests/integration/library-create.test.ts` continue to pass (they were
  re-run as part of the full-suite GREEN sweep). No new assertion needed
  because the fix is scoped to a different INSERT branch.

## Status

implemented

## Notes for Codex Review

- **Hardcoded `log_count: 1` vs `COUNT(*)`** — extensive rationale comment
  (lines 553-580 of `route.ts`) explains why hardcoding is correct in THIS
  branch (brand-new row, no FK pointing at it yet, no prior entries to
  count). The re-log path at line ~451 continues to use the COUNT(*) pattern
  for its own (correct) reasons. Verify the two patterns are NOT mixed in
  this PR.
- **ISO-8601 string vs DB `now()`** — `new Date().toISOString()` matches the
  re-log bump at line 480 verbatim. Supabase `timestamptz` accepts ISO-8601
  strings; no JSON-vs-text coercion concern. The test asserts the parsed
  epoch ms lies inside the request window, which guards against `null` /
  empty-string / past-timestamp regressions.
- **Concurrent-tab race** — proposals/bug-1.md §"Concurrent-tab race
  consideration" notes there's no UNIQUE on `(user_id, normalized_name)`,
  so two simultaneous `save_to_library: true` submissions produce two
  library rows each with `log_count: 1`. This is pre-existing behavior
  (each row truthfully reflects 1 log, dedup-merge handles consolidation
  downstream). NO race-window change vs prior code — the new fields are on
  the same INSERT, not a separate UPDATE.
- **Cross-bug independence** — Bug 2 touches `foodDetail.format.ts` and
  micros display tests. Zero file overlap with this fix. The parallel
  sub-agent's diff is independent and committed separately.
- **Cache invalidation** — already in place at lines 605-613 of the modified
  file (`revalidateTag(TAGS.userLibrary(uid), 'max')` +
  `revalidatePath('/library', 'page')`). These fire on success after the
  INSERT lands, so the post-save navigation to `/library` will see the new
  row with `log_count: 1` immediately. No additional cache work needed.
- **Sentry signal on error path** — already preserved. If the INSERT errors
  (RLS, 23505, schema drift), `libError` is non-null, cache calls are
  guarded behind `!libError`, and `Sentry.captureException(libError, ...)`
  fires. The added fields do not change the error-path contract.
