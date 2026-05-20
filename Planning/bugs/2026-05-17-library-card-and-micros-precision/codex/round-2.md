# Codex Adversarial Review — Round 2 (RETRY after stash recovery)

**Batch:** bugfix-tomi 2026-05-17-library-card-and-micros-precision
**Invocation:** `--base HEAD` (working-tree review)
**Recovery context:** The R1 fix in `app/api/entries/save/route.ts` was stashed by a concurrent session before the first R2 attempt ran. Main agent restored it via `git stash pop`. This run is against the recovered state.

**Sanity verification (pre-Codex):** Confirmed all 4 R1 elements present on disk:
1. `food_entries.library_item_id` link UPDATE — lines 668-674
2. 23505 conflict-recovery SELECT (`user_id` + `normalized_name`, `deleted_at IS NULL`) — lines 626-657
3. COUNT-derived `log_count` bump (`select('id', { count: 'exact', head: true })` then `update({ log_count })`) — lines 697-723
4. Cache invalidation (`revalidateTag(userLibrary)` + `revalidatePath('/library', 'page')`) on bump-success branch — lines 741-742

**Working-tree scope note:** Codex was instructed to focus on the 5 batch files only. The 3 unrelated debris files in the working tree (`components/dashboard/MacroBars.tsx`, `components/dashboard/MicrosOverflowToggle.tsx`, `app/globals.css`) are concurrent-session debris and will be filtered at Phase 8 commit. Codex respected the scope guard — no findings reference debris files.

**Auto-retry signals:** None detected in output (no "Input exceeded 1MB", "Retrying with tighter scope", "production files only", or "spec context trimmed").

---

## Verbatim Codex output

```
# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship. The R1 code is back on disk, including the link UPDATE, 23505 recovery SELECT, COUNT-derived bump, and cache invalidation on bump success. The remaining risk is that the save-to-library path still has non-transactional write gaps that can permanently corrupt the library badge/link invariant under failure or concurrency.

Findings:
- [critical] Link failure still publishes a successful library bump (app/api/entries/save/route.ts:668-742)
  The route inserts food_entries first, then creates or recovers a library row, then tries to link the just-inserted entry. If the link UPDATE errors, affects zero rows, or is skipped because inserted.id is not a string, the code still continues into the COUNT/bump path. Since the entry is not linked, COUNT can be 0, but Math.max(1, trueCount ?? 1) writes log_count=1 anyway and revalidates /library. Impact: a library item can appear as successfully logged while the authoritative entry remains library_item_id=null, so later COUNT-derived re-log bumps undercount from that point. The handler does not roll back or compensate the library insert and returns 200.
  Recommendation: Only bump/invalidate/enqueue after the entry link is confirmed, e.g. use a transaction/RPC or make the UPDATE return/select the affected row/count and skip or compensate the library row when the link is not confirmed.
- [medium] COUNT then literal UPDATE can lose the newest count under concurrent saves (app/api/entries/save/route.ts:697-723)
  The bump reads COUNT(*) in one request and later writes that literal value in a separate UPDATE. In a three-request race, an older request can count 1, later requests can link/count/write 2 or 3, and then the older request can finish last and overwrite log_count back to 1. This is an inference from the separate SELECT at 697-701 and literal UPDATE at 718-723. The two-request convergence case is not enough to prove safety when a stale writer can complete last.
  Recommendation: Move the count derivation into the database write boundary, such as an RPC/transaction or UPDATE food_library_items SET log_count = (SELECT COUNT(*) ...) so the value is computed at statement execution time after the link step.

Next steps:
- Add a failure-path test where food_entries link UPDATE errors or affects zero rows and assert no false log_count/cache success is published.
- Add a concurrency-oriented test or DB-level implementation proving final log_count equals COUNT(food_entries) after overlapping save-to-library requests.
```
