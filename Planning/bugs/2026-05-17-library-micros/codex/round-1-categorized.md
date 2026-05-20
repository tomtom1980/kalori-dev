# Codex Round 1 — Categorized Findings

**Batch:** bugfix-tomi 2026-05-17-library-micros
**Review base:** 60e85c5 (origin/main pre-batch)
**Review HEAD:** 9361fe6 (origin/main post-batch)
**Commits in scope:** b51cad1 (Bugs 2+3 + i18n + test recovery), 45376f8 (Bug 1 production), 9361fe6 (FoodDetailMacros sugar_g push-unblock side-fix)
**Auto-retry signals:** none — gate-eligible review
**Verdict:** needs-attention — 1 Critical + 1 Improvement

---

## Critical (2)

### C1 — [Bug 2/3 scope leak] Canonical sodium is hidden from the always-visible sodium row

- **File:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`
- **Lines:** 96-97, 233-235, 537-558, 560-565
- **Bug:** Bug 2 + Bug 3 (canonical micro unit/DV resolution)
- **Severity:** Critical — broken contract on the surface that Bug 2/3 are explicitly fixing
- **Summary:** Library items written under canonical `DEFAULT_MICROS_LIST` keys (e.g. `micros.sodium`) — which is exactly what Bug 1's new ConfirmationScreen library-only collapsible produces — never hit the top-level sodium row. `FoodDetailMacros` line 97 reads only the legacy `micros.sodium_mg` key (`sodiumMg = typeof micros.sodium_mg === 'number' ? micros.sodium_mg : null`). A library item created via the new canonical editor with only sodium falls into the collapsible extras (and is filtered out at line 564 only for `sodium_mg`, NOT `sodium`, so it would render twice if both shapes coexisted). The edit form has the same drift: line 233 passes `savedSodiumMg={micros.sodium_mg ?? 0}`, so canonical sodium cannot be edited through the sodium input either.
- **Cross-bug interaction:** Direct cross-bug regression. Bug 1 writes canonical `sodium`; Bug 2/3 read only legacy `sodium_mg`. The two halves of the batch are not aligned.

### C2 — [Bug 1 scope, library-only batch save] Multi-row library-only create is not retry-safe — partial-failure can leave persisted orphan rows

- **File:** `app/(app)/log/_components/ConfirmationScreen.tsx`
- **Lines:** 751-814 (sequential POST loop in library-only save path)
- **Bug:** Bug 1 (touched the surrounding library-only save flow when adding the EDIT_ITEM_MICRO action and collapsible)
- **Severity:** Critical — data-loss / data-duplication risk on multi-row library-only save when a later row 409s or 5xx's
- **Summary:** The library-only save path posts each row sequentially via `POST /api/library/create` with a freshly minted `client_id` per attempt, then `return`s on the first non-OK response (lines 758-808). If row 0 succeeds and row 1 returns 409 (or 5xx), row 0 is already persisted while the modal is left in an error state. Because `client_id`s are regenerated on each save attempt and the duplicate dedup state is global, a retry can duplicate the already-created row 0 OR re-collide on it, instead of resuming only the failed row 1. The pre-flight dedup-check only inspects `row[0]`, so duplicates on rows 1+ surface only at POST time — exactly the scenario that triggers this path.
- **Recommendation framing:** Make library-only multi-row create atomic (server-side batch endpoint with transaction) OR persist stable per-row idempotency keys across retries and track row-level success/failure so retry only re-attempts unsent rows.

---

## Improvement (0)

None — both findings escalated to Critical given the data-correctness impact.

---

## Minor (0)

None reported by Codex this round.

---

## Cross-bug interaction summary

The two Critical findings are a single failure mode viewed from two angles:

- Bug 1 (ConfirmationScreen) writes canonical `sodium` into the new collapsible's payload.
- Bug 2/3 (FoodDetailMacros) only read legacy `sodium_mg` for the always-visible sodium row.

Net effect: a user who uses Bug 1's new library-only flow to save an item with sodium and then opens that item from /library sees sodium absent from the top-level row (or duplicated into the extras section depending on which keys end up in storage).

C2 is independent of C1 but lives on the same Bug 1 code surface; Bug 1's editing UX work touched the surrounding save loop without addressing the pre-existing partial-failure path.

---

## Disposition

- **C1** — must auto-fix in round 2 (sub-agent dispatched by main agent). The canonical helper path is already in place — the fix is to resolve sodium through the same helper and exclude both keys from the extras loop.
- **C2** — must auto-fix in round 2 (sub-agent dispatched by main agent). Atomic batch endpoint OR stable client-side idempotency keys + row-level error tracking.
- No Minor findings to defer.
