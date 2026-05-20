# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-17-library-card-and-micros-precision`
**Date:** 2026-05-17
**Verdict:** needs-attention (block ship)

---

## Counts

- **Critical:** 1
- **Improvement:** 1
- **Minor:** 0
- **Auto-retry signals:** none

---

## Critical (1)

### C1 — Initial `log_count: 1` conflicts with COUNT(*)-based re-log derivation
- **File:** `app/api/entries/save/route.ts:609-610`
- **Body verbatim:** The new save-to-library row is initialized with `log_count: 1`, but the entry created earlier in this same request is inserted with `library_item_id: body.library_item_id ?? null`, so it cannot point at this freshly-created library row. The re-log bump later derives `log_count` from `food_entries` rows where `library_item_id` equals the library row id. For an item created by this path, the first later re-log will count only that re-log entry and write `1` again instead of `2`; every subsequent count stays under by one. This is an invariant break between the new hardcoded base count and the existing COUNT-based recomputation path.
- **Codex recommendation:** Unify the invariant before shipping: either link the initial entry to the new library row and keep COUNT-based derivation, or make every later recomputation include the creation log/base count. Add a regression test for save-to-library followed by re-log.
- **Severity rationale:** Regression-causing logic error. The fix correctly displays "1" after first save, but the very next re-log will re-write `log_count = 1` (instead of `2`), permanently lagging by 1. The bug "0 on first save" is replaced with "stuck at 1 on first re-log, then off-by-one forever."
- **Auto-fix candidate:** YES

---

## Improvement (1)

### I1 — Concurrent duplicate first-save drops the loser's count update
- **File:** `app/api/entries/save/route.ts:600-617`
- **Body verbatim:** The repo has a partial unique index on active `(user_id, normalized_name)`, so two simultaneous save-to-library requests for the same food will not create duplicate library rows; one `food_library_items` insert will fail with 23505. This handler swallows `libError`, while the `food_entries` insert has already succeeded. With the new code, only the winning insert gets `log_count: 1`; the losing request contributes another logged entry but does not select the existing library row, bump its count, or invalidate the library cache. The race is not worsened into duplicate rows, but the current fix still fails the badge-correctness goal under a realistic two-tab first-save.
- **Codex recommendation:** Handle the 23505 duplicate path explicitly: select the existing active library row for that normalized name, reconcile/bump the count according to the chosen invariant, and invalidate the library view. Add a concurrency/duplicate-insert regression test.
- **Severity rationale:** Pre-existing race that the fix did NOT introduce (partial unique index already prevented row duplication), but the badge-correctness contract is still violated in the duplicate-first-save scenario. Concrete real-world impact: two-tab user sees a stale "0" badge until cache invalidates from another path.
- **Auto-fix candidate:** YES — same file, same diff region, same auto-fix sub-agent can resolve C1 + I1 together coherently.

---

## Minor (0)

None.

---

## Bug 2 (formatMilligrams) — Codex assessment

Codex did NOT flag any Critical or Improvement findings against the Bug 2 fix. The 4-tier threshold formatter, MicroBreakdownDialog independence, cholesterol sibling deferral, name semantics, and edge-case coverage were all silent in the verdict. Concerns (d) through (i) from the prompt were implicitly accepted.

---

## Recommendation

**Dispatch auto-fix sub-agents for `app/api/entries/save/route.ts`.**

Both findings co-locate in the save-to-library branch of the same file. A single auto-fix sub-agent can:
1. Resolve C1 by unifying the invariant — most likely by setting `library_item_id` on the just-inserted `food_entries` row to point at the new library row (so COUNT(*)-derivation will produce `1` on first save and `2` on first re-log).
2. Resolve I1 by adding a 23505-conflict handler that selects the existing row and bumps via COUNT(*).
3. Add a regression test in `tests/unit/api/entries-save.test.ts` for save-to-library → re-log producing `log_count = 2`.

Round 2 (re-review) will verify the unified invariant.
