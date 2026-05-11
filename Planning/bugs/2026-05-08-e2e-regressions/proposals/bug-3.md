# Bug #3 — `library-single-delete-undo` `toBeNull` flake (sibling-family of Bug #2)

## Spec
`tests/e2e/library/library-single-delete-undo.spec.ts` — two tests:
- **Test 1 (line 20-85):** "select → bulk delete (N=1) → undo restores row; separate sweep path hard-deletes" — the bug-list literal `library-single-...-sweep-path-hard-deletes` matches the trailing clause of this `test()` name. Failing assertion: **line 84** (`expect(restored!.deleted_at).toBeNull()`).
- **Test 2 (line 87-134):** "separate sweep path: tombstone past 5s is hard-deleted on next fetch" — toBeNull at line 128 is the seeded "Remain" row (untouched) → no race; toBeUndefined at line 124 is the swept victim. Test 2 is structurally robust but uses cross-region 6s + page reload → can also drift on CI.

## Reproduction
8/8 PASS locally with `--workers=1` (single test name filter). Same flake profile as Bug #2: passes locally, only fails on CI under cross-region Vercel iad1 ↔ Supabase ap-southeast-1 (~150–200ms RTT). Sibling Bug #2 reproduced 1/5 with `--repeat-each=5`; Bug #3's Test 1 follows the exact same pattern (UNDO → fixed `waitForTimeout(500)` → DB readback) and shares the symptom.

## Root cause (cross-referenced with Bug #2)
**Identical race to Bug #2.** Test 1 line 78:
```ts
await authedPage.getByTestId('undo-action').click();
await authedPage.waitForTimeout(500);  // ← same flaky pattern
const rows = await fetchLibraryRows(userId);
const restored = rows.find((r) => r.id === victim.id);
expect(restored).toBeDefined();
expect(restored!.deleted_at).toBeNull();  // line 84 — fails when undo POST hasn't settled
```

The toast button click is fire-and-forget — `LibraryClient.tsx`'s `revert()` callback POSTs `/api/library/bulk-delete/undo` async with a swallowed `catch {}`. The test's 500ms timeout is detached from the actual POST resolution. Under CI's cross-region latency the UPDATE may not have committed (or read replica may not have caught up) before `fetchLibraryRows` runs.

For Test 2, no undo race exists, but the 6s sweep wait + `goto('/library')` triggers `fetchLibraryPage` → DELETE sweep → SELECT. If the sweep's clock-skew check (`Date.now() - 5_000`) loses a few ms to the network round-trip from the bulk-delete POST timestamp, the row may not yet qualify for hard-delete and `survivor` is still in the result set (`toBeUndefined` fails). This is plausible but not the primary symptom of the bug-list entry.

## Fix

**Test 1 (primary, addresses bug-list "toBeNull failure"):** mirror Bug #2's fix — replace the fixed-timeout pattern with `page.waitForResponse` for the UNDO POST.

**Test 2 (defensive):** the 6s wait + page reload is structurally fine, but to harden against page-load / cross-region jitter, replace the 6s `waitForTimeout` with `waitForTimeout(5500)` + an explicit assertion-based wait on the post-reload `library-card-${victim.id}` having `count=0` (already there at line 132). Optionally swap to `expect.poll` for the DB readback so the run waits up to e.g. 3000ms for the sweep to be reflected.

Recommended: ship #1 only (Test 1 race-free), keep Test 2 unchanged unless CI surfaces a failure on its toBeUndefined / count=0 assertions specifically.

```ts
// BEFORE (line 76-78)
await authedPage.getByTestId('undo-action').click();
await authedPage.waitForTimeout(500);

// AFTER
const undoResp = authedPage.waitForResponse(
  (r) =>
    r.url().includes('/api/library/bulk-delete/undo') &&
    r.request().method() === 'POST' &&
    r.status() === 200,
);
await authedPage.getByTestId('undo-action').click();
await undoResp;
```

## Files affected
- `tests/e2e/library/library-single-delete-undo.spec.ts` (Test 1, replace lines 76-78 with `waitForResponse` pattern)

## Test approach
Re-run `pnpm test:e2e -- --project=chromium tests/e2e/library/library-single-delete-undo.spec.ts --repeat-each=10 --workers=1`. Pass rate must be 10/10 for both tests.

## Regression risk
**Low.** Test-only change. No production code touched. R1 firewall (`lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`) untouched. Production sweep + bulk-delete + undo routes unchanged.

## Cross-reference Bug #2
Identical fix shape. The two specs share the bulk-delete-undo POST contract; same `waitForTimeout(500)` antipattern at line 95 (Bug #2) and line 78 (Bug #3 Test 1). One implementation sub-agent could apply both fixes in one pass with copy-paste discipline. **No production code defect exists** — Bug #2's deep dive confirmed the route + sweep are correct; the symptom is a test-side timing problem.

## Classification
**Test-side flake** — production code is correct; test relies on a fixed timeout that is async-detached from the toast's deferred `revert()` POST resolution. Same family as Bug #2 (bulk-delete-undo); fix is identical pattern.

## TDD note
Spec is the test artifact itself; "TDD failing test first" doesn't apply — the failing test already exists. The fix is to make the test reliable. CI green on `--repeat-each=10` is the verification.
