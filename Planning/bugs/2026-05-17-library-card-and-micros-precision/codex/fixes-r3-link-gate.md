# Codex R3 Auto-fix — Link-confirmed log_count bump gating (C1-R2)

## Finding addressed

**C1-R2 (Critical) — Link failure still publishes a successful library bump.**
`app/api/entries/save/route.ts:668-742` — If the post-INSERT link UPDATE
errors / matches 0 rows / is skipped (non-string id), the code fell
through to the COUNT/bump path. `Math.max(1, trueCount ?? 1)` floors
COUNT=0 to 1, so the bump wrote `log_count=1` and invalidated cache while
the food_entries row remained orphaned. The R1 invariant
`log_count == COUNT(entries linked)` was permanently broken from first
observation.

## False-positive check

No — valid Critical finding. The R1 fix introduced the
`food_entries.library_item_id` link UPDATE between the library INSERT
and the COUNT-derived bump, but did NOT gate the downstream chain on
the link result. Codex's analysis of the on-disk R1 code matched the
exact failure mode: PostgREST's silent 0-row-match outcome was invisible
to the route, and `Math.max(1, …)` ensured the bump always wrote a
positive value even when zero entries were actually linked.

## Files modified

- `app/api/entries/save/route.ts`
- `tests/unit/api/entries-save.test.ts`

## Approach

**Gate-without-rollback.** Three changes to the save-to-library branch:

1. **Link UPDATE now passes `{ count: 'exact' }`** so PostgREST returns
   the affected-row count. The destructuring is updated to receive
   `{ error: linkError, count: linkCount }`.

2. **A `linkConfirmed` boolean** is set true only when
   `!linkError && linkCount === 1`. The bump-COUNT-update-cache chain is
   now wrapped in `if (linkConfirmed) { … }`. The sketch-enqueue arm of
   the `libRow` branch is also gated via `else if (libRow && linkConfirmed)`.

3. **Sentry observability** preserved for both error paths. The
   `linkCount === 0` case synthesises an `Error('…affected 0 rows…')`
   so Sentry's exception normalisation has a real stack trace; passing
   `null` would drop the event silently. The scope tag also differentiates
   `library_entry_link` (PostgREST error) from `library_entry_link_zero_rows`
   (silent no-op) for operator clarity.

**Rollback rejected.** Per the design-doc §10.3 invariant ("library is
enrichment, entry write is authoritative"), the entry-side write must
remain committed even when the library link breaks. Deleting the
library row on link failure would:
- For fresh INSERT + link failure: race against any in-flight sibling
  tab that recovered via 23505 and linked its own entry to that row.
- For 23505-recovery + link failure: orphan the winner's already-linked
  entry.

The orphan library row keeps its DB-default `log_count = 0` (never
bumped), consistent with reality. The next re-log via
`/api/library/[id]/log-now` self-heals via COUNT-from-statement
(architecture.md §3.5). Response stays 200 — the client doesn't see a
falsified "entry failed" 5xx.

## Test results

**New RED→GREEN cases (3 new):**
- `C1-R2: link UPDATE error → no bump, no cache invalidation, no sketch, route still 200` — GREEN
- `C1-R2: link UPDATE matches 0 rows → no bump, no cache invalidation, no sketch, route still 200` — GREEN
- `C1-R2 positive regression: link UPDATE confirmed (count=1) → bump + cache + sketch fire as before` — GREEN

**Regression sweep:**
- `tests/unit/api/entries-save.test.ts` — 28/28 GREEN (5 R1 link-gating cases preserved; 3 new R2 cases added)
- `tests/integration/library/*` — 108/108 GREEN (23 skipped, real-DB-only)
- `tests/integration/entries/*` — 37/37 GREEN

**Typecheck / lint:**
- `pnpm typecheck` — clean (no errors, no new warnings)
- `pnpm lint` — 0 errors (43 pre-existing unrelated warnings, none in changed files)

## Notes for review

- **`{ count: 'exact' }` is the official PostgREST count flag** for
  UPDATE (verified against `@supabase/postgrest-js@2.103.3`
  `PostgrestQueryBuilder.update<Row>(values, { count?: 'exact' | … } = {})`).
  Same flag used by the compensating-delete path at lines 387-394 of
  the same route — pattern consistency preserved.

- **The link UPDATE mock** in `tests/unit/api/entries-save.test.ts`'s
  `buildExtMocks` was extended to accept a second argument (the count
  option object) without using it — injection happens via
  `opts.linkUpdateError` and `opts.linkUpdateAffectedCount`.

- **`enqueueSketchGeneration`** was already auto-skipped in test mode
  (line 62 of `lib/library/sketch-enqueue.ts`), so the sketch-call
  assertions use a `vi.doMock` override to capture call counts. The
  positive-regression test verifies sketch fires with the correct
  `libraryItemId` when link is confirmed.

- **I1-R2 (Improvement) — concurrent-saves race** is deferred to
  `pending_minor_findings` per skill rule (Improvement-only residuals
  at round-2-cap). The race is read-modify-write across separate SELECT
  and UPDATE statements; in 3+ overlapping save-to-library requests, an
  older request's stale COUNT can overwrite a newer COUNT after the
  newer request's link landed. Self-heals on the next re-log via the
  log-now route's COUNT-from-statement pattern (architecture.md §3.5).
  Not fixed in this round — explicit override-of-2-round-cap is for the
  Critical only.
