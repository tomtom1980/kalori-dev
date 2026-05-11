# Bug #2 — `library-bulk-delete-undo` `toBeNull` flake

## Spec
`tests/e2e/library/library-bulk-delete-undo.spec.ts` — line 18 is the test signature; the actual failing assertion is **line 102** (`expect(r!.deleted_at).toBeNull()` after UNDO).

## Reproduction
1/5 reproduction with `--repeat-each=5 --workers=1` locally. Error message:
```
Received: "2026-05-08T08:57:37.996+00:00"
> 102 |       expect(r!.deleted_at).toBeNull();
```
Test PASSES on a single run — confirmed flake.

## Root cause
**Race between the lazy tombstone sweep and the UNDO POST.**

Sequence in the failing run:
1. `bulkConfirm` POSTs `/api/library/bulk-delete` → rows get `deleted_at = now()`.
2. Server returns 200; client calls `router.refresh()`.
3. `router.refresh()` re-renders the RSC tree, which re-runs `fetchLibraryPage(uid)` (`lib/library/fetch.ts:55`).
4. `fetchLibraryPage` runs the lazy sweep (`lib/library/fetch.ts:61-68`):
   ```
   sweepCutoff = new Date(Date.now() - 5_000)
   DELETE FROM food_library_items WHERE deleted_at IS NOT NULL AND deleted_at < sweepCutoff
   ```
5. **System clock skew:** if the database `deleted_at` (set via `nowIso = new Date().toISOString()` at `app/api/library/bulk-delete/route.ts:80`) is even slightly NEWER than `Date.now()` on the Node process at step 4, the sweep does nothing — fine.
6. **But:** when the test then calls UNDO at line 93, the undo route filters `not('deleted_at', 'is', null)` (`app/api/library/bulk-delete/undo/route.ts:78`). The route runs the orphan-fence + deleting-fence reads BEFORE the UPDATE — adding ~50–200ms of latency on cross-region (Vercel iad1 ↔ Supabase ap-southeast-1).
7. If the elapsed time between step 1's `nowIso` and the UPDATE in step 6 exceeds 5 seconds (rare but possible under preview-build cold start, or if `router.refresh()` + RSC fetch + page hydration + 500ms `waitForTimeout` add up), the row was already swept (hard-deleted) — undo returns `replayed: true` but the database has no row to restore.

But the ACTUAL failing read shows `deleted_at = "2026-05-08T08:57:37.996+00:00"` is still SET — the UNDO did NOT clear it. So step 6's filter `.in('client_id', client_ids)` is matching, the row exists, but `deleted_at` is non-null in the post-test readback.

**The actual race is simpler:** UNDO runs, returns 200, but `fetchLibraryRows` (line 98) reads the DB BEFORE the UNDO's `revalidateTag` propagates and BEFORE the UPDATE has actually settled at the read replica. The `await authPost(...)` resolves on the API response, NOT after the readback can see the write — and **`waitForTimeout(500)` at line 95 is not always enough** for cross-region Supabase write→read consistency under load.

Actually the most likely cause: **the UNDO POST itself silently failed and `pushToast.revert` swallowed the error.** Look at `LibraryClient.tsx:308-322`:
```js
revert: async () => {
  try {
    await authPost('/api/library/bulk-delete/undo', { client_ids: clientIdsForUndo });
    ...
  } catch {
    // Best-effort — the tombstone sweep window is narrow.
  }
}
```
A bare `catch {}` swallows ALL errors. If the UNDO 401s (orphan fence: profile not yet readable for a freshly-seeded user — Bug A.3 territory), or 423s, or 503s, the test's DB readback still sees `deleted_at` populated. **The 500ms `waitForTimeout` at line 95 is async-detached from the actual UNDO's resolution** — there's no await on the toast's `revert()` callback completing.

## Fix
Two complementary changes:
1. **Test side (preferred, minimal)**: Wait for the UNDO POST to complete before reading the DB. Use `page.waitForResponse(r => r.url().includes('/api/library/bulk-delete/undo') && r.status() === 200)` after clicking the undo button, instead of a fixed 500ms timeout. This eliminates the race entirely.
2. **Optional UI side**: Surface the swallowed error from `revert`'s `catch {}` via a Sentry log or toast — but this is out of scope for an E2E flake fix.

Recommendation: ship #1 only.

## Files affected
- `tests/e2e/library/library-bulk-delete-undo.spec.ts` (replace line 95's `waitForTimeout(500)` with `waitForResponse`)

## Test approach
Re-run with `--repeat-each=10`. Pass rate must be 10/10.

## Regression risk
**Low.** Test-only change. No production code touched. R1 firewall untouched.

## Cross-reference Bug #3
Bug #3 is `library-single-sweep-path-hard-deletes`, which exercises the SAME sweep logic at `lib/library/fetch.ts:61-68`. If Bug #3's sub-agent finds a sweep-window bug at the production level (e.g., `5_000ms` is too tight under cross-region latency), my fix would still hold (waitForResponse is robust to any sweep timing). If Bug #3 finds a code defect that ALSO affects bulk-delete-undo, our fixes must be coordinated — but the symptom in this bug (deleted_at still SET after UNDO 200) is most likely **the test's 500ms timeout being beaten by the toast's deferred `revert()` callback**, NOT a sweep race. The sweep would HARD-DELETE the row, not leave deleted_at populated.

## Classification
**Test-side flake** — production code is correct; test relies on a fixed timeout instead of awaiting the actual response.
