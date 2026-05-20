# R2 Recovery Diagnostic

## Working tree state

5 files modified per `git status --short`:

```
 M app/(app)/library/_components/FoodDetail/foodDetail.format.ts
 M app/api/entries/save/route.ts
 M tests/components/library/FoodDetailMacros.test.tsx
 M tests/unit/api/entries-save.test.ts
 M tests/unit/library/food-detail-format.test.ts
```

The `foodDetail.format.ts` + matching tests are the **Bug 2 micros precision** work (independent of the R1 question). The `app/api/entries/save/route.ts` + `tests/unit/api/entries-save.test.ts` modifications are the **original Bug 1 partial fix only** — not the R1 follow-up.

Inspecting `app/api/entries/save/route.ts` lines 540-680 directly:

- **INSERT into `food_library_items`** (lines 599-616): includes `log_count: 1` + `last_used_at: new Date().toISOString()` (Bug 1 partial fix is present).
- **After INSERT, link UPDATE on `food_entries`**: ABSENT. There is no `.from('food_entries').update({ library_item_id: ... })` call in the save-to-library branch.
- **23505 conflict-recovery branch with SELECT + UPDATE**: ABSENT. The `if (libError)` branch (line 617) goes straight to `Sentry.captureException`, no `libError.code === '23505'` test, no recovery `SELECT` by `(user_id, normalized_name)`.
- **COUNT-derived `log_count` bump**: ABSENT. No second-stage `.select('id', { count: 'exact', head: true })` + bump UPDATE for this code path.
- **`revalidatePath` / `revalidateTag` placement**: Lives in the `else` branch at lines 626-635 (success-path of the INSERT), NOT gated to a "bump succeeded" condition. The R1 fix design moved cache invalidation to the bump-success boundary.

Concretely: the on-disk save-to-library branch is the **pre-R1 partial Bug 1 fix only** (hardcoded `log_count: 1`, original error-handling structure).

## R1 fix actually on disk?

**No — partial only.** The hardcoded-1 + `last_used_at` insert payload from the initial Bug 1 fix IS on disk (lines 609-610), but the four R1 follow-up additions are all missing:

1. C1 link UPDATE (no `food_entries.library_item_id` write back) — confirmed absent at lines 617-668.
2. I1 23505 conflict-recovery SELECT — confirmed absent (else branch at 617 has no pg-code dispatch).
3. COUNT-derived bump replacing hardcoded 1 — confirmed absent.
4. Cache-invalidate moved to bump-success branch — confirmed absent (invalidate still lives on raw INSERT-success).

## stash@{0} contents

`stash@{0}` (`STASH-CONCURRENT-LIBFIX`) contains exactly the missing R1 additions:

- `app/api/entries/save/route.ts` — 222 insertions, 47 deletions (per `--stat`).
- `tests/unit/api/entries-save.test.ts` — 454 insertions, 47 deletions.

Inspecting `git stash show -p stash@{0}`:

- Adds 23505 conflict-recovery SELECT via `.eq('user_id', userId).eq('normalized_name', computedNormalized).is('deleted_at', null).maybeSingle()` — matches the partial unique index predicate in `0020_food_library_dedup_index.sql`.
- Adds `food_entries` link UPDATE setting `library_item_id` to the recovered/new id, with RLS-defense `.eq('user_id', userId)`.
- Adds COUNT(*) bump path: `.select('id', { count: 'exact', head: true }).eq('user_id').eq('library_item_id')` → derives `nextLogCount = Math.max(1, trueCount ?? 1)`, then `.update({ log_count, last_used_at })`.
- Moves `revalidateTag(TAGS.userLibrary(userId))` + `revalidatePath('/library', 'page')` INSIDE the bump-success branch.
- Splits the `libError` else-branch so non-23505 errors still get Sentry-captured, while 23505 falls through to the recovery path.
- Sketch enqueue is now gated `else if (libRow)` (new INSERTs only), no longer firing on the 23505 recovery branch.
- Tests in `tests/unit/api/entries-save.test.ts` are updated to mock the new COUNT chain shape (`.select('id', { count: 'exact', head: true }).eq().eq()` returning `{ count, error }`) plus the additional `.eq()` link in the `maybeSingle` chain.

Stash@{0} is the FULL R1 fix that the R1 sub-agent reported writing. It is intact, no merge conflicts visible against the current tree (the on-disk file is at the pre-R1 baseline for the save-to-library branch).

## Diagnosis

**(B) The working tree state changed between R1 implementation and R2 review.** Specifically: after the R1 sub-agent wrote the full R1 fix, a concurrent session (or an explicit park/restore step in the bugfix-tomi flow) stashed the R1 follow-up into `stash@{0}` ("STASH-CONCURRENT-LIBFIX"), leaving the working tree at the pre-R1 / Bug-1-only state that R2 then reviewed.

Evidence:

- The stash message "STASH-CONCURRENT-LIBFIX" matches the project memory note `feedback_commit_fast_on_concurrent_sessions.md` ("multiple Claude Code sessions can run concurrently … sibling stash+reset wipes uncommitted work").
- `stash@{0}` contains EXACTLY the four R1 deltas (link UPDATE, 23505 recovery, COUNT bump, cache-invalidate relocation) that the R1 sub-agent claimed to write, and they are EXACTLY the four pieces R2 (C1-R2 + C2-R2) is flagging as "still unlinked / not handled".
- The on-disk Bug 1 partial fix (hardcoded `log_count: 1` + `last_used_at`) and the Bug 2 micros precision work both survived the stash — those are NOT the R1 additions, they pre-dated R1.

So R2 reviewed the truth of the file system as it existed at the time R2 ran, but that truth had regressed from the R1-fixed state. R2's C1-R2 + C2-R2 findings are factually correct **against the file as it sits on disk right now** — but they are NOT new issues; they are the same gaps R1 was supposed to have filled, re-surfaced because the R1 fix has been stashed away.

## Recommended next action for main agent

**Pop `stash@{0}` to merge the R1 fix back into the working tree, verify it cleanly applies, then dismiss R2's C1-R2 + C2-R2 findings as duplicates of the R1 issues (already fixed in stash).** No round-3 auto-fix is needed for those two findings — they collapse to zero the moment the R1 stash lands.

Concretely:

1. `git stash pop stash@{0}` — should merge cleanly (no on-disk conflicts since the save/route.ts on disk is at the pre-R1 baseline for the save-to-library branch).
2. If pop conflicts (would be surprising — the on-disk file lacks the affected lines entirely), abort and use `git stash show -p stash@{0} | git apply --3way` to attempt a 3-way merge with the partial Bug 1 fix already present.
3. Re-verify on-disk state: `route.ts` should now contain the 23505 SELECT recovery (around line 618-660), link UPDATE (around line 660-685), and COUNT bump (around line 685-740).
4. Re-run the relevant test files to ensure the test-mock shape changes in `tests/unit/api/entries-save.test.ts` still align with the implementation (they should — both pieces lived together in stash@{0}).
5. Optionally re-run a targeted Codex R2 ONLY if you want to catch any genuinely new issues; the previously-flagged C1-R2 + C2-R2 will be moot.
6. Any OTHER R2 findings beyond C1-R2 + C2-R2 should be evaluated on their own merits — if they describe issues that exist independently of the R1 fix, dispatch a round-3 auto-fix for those specifically.

The 2-round Codex cap is preserved: the R2 review itself was not wasted (it correctly described disk state), and the "fix" for C1-R2 + C2-R2 is a `git stash pop`, not new implementation work.
