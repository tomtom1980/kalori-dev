# Codex Adversarial Review — Round 1

**Batch:** `2026-05-17-library-card-and-micros-precision`
**Date:** 2026-05-17
**Target:** branch diff against HEAD (uncommitted)
**Base:** HEAD
**Verbatim Codex output below.**

---

# Codex Adversarial Review

Target: branch diff against HEAD
Verdict: needs-attention

No-ship: the counter fix makes the initial badge nonzero, but it conflicts with the later count-recompute path and still loses count updates under duplicate first-save races.

Findings:
- [critical] Initial save count is overwritten by later re-log count derivation (app/api/entries/save/route.ts:609-610)
  The new save-to-library row is initialized with `log_count: 1`, but the entry created earlier in this same request is inserted with `library_item_id: body.library_item_id ?? null`, so it cannot point at this freshly-created library row. The re-log bump later derives `log_count` from `food_entries` rows where `library_item_id` equals the library row id. For an item created by this path, the first later re-log will count only that re-log entry and write `1` again instead of `2`; every subsequent count stays under by one. This is an invariant break between the new hardcoded base count and the existing COUNT-based recomputation path.
  Recommendation: Unify the invariant before shipping: either link the initial entry to the new library row and keep COUNT-based derivation, or make every later recomputation include the creation log/base count. Add a regression test for save-to-library followed by re-log.
- [high] Concurrent duplicate first-saves still drop the library count update (app/api/entries/save/route.ts:600-617)
  The repo has a partial unique index on active `(user_id, normalized_name)`, so two simultaneous save-to-library requests for the same food will not create duplicate library rows; one `food_library_items` insert will fail with 23505. This handler swallows `libError`, while the `food_entries` insert has already succeeded. With the new code, only the winning insert gets `log_count: 1`; the losing request contributes another logged entry but does not select the existing library row, bump its count, or invalidate the library cache. The race is not worsened into duplicate rows, but the current fix still fails the badge-correctness goal under a realistic two-tab first-save.
  Recommendation: Handle the 23505 duplicate path explicitly: select the existing active library row for that normalized name, reconcile/bump the count according to the chosen invariant, and invalidate the library view. Add a concurrency/duplicate-insert regression test.

Next steps:
- Block shipment until the `log_count` invariant is consistent across initial save, duplicate first-save, and re-log paths.
