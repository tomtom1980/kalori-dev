# Codex R2 (RETRY) — Categorized Findings

**Batch:** bugfix-tomi 2026-05-17-library-card-and-micros-precision
**Round:** 2 (RETRY after stash recovery)
**Verdict:** `needs-attention`

## Counts
- Critical: **1**
- Improvement: **1** (Codex labeled "medium" — maps to Improvement per the project severity rule: not blocking but worth fixing)
- Minor: **0**

## Findings

### CRITICAL #1 — Link failure still publishes a successful library bump
- **Location:** `app/api/entries/save/route.ts:668-742`
- **Codex severity:** critical
- **Evidence path:** post-INSERT link UPDATE at 668-674 → fall-through into COUNT at 697-704 → `Math.max(1, trueCount ?? 1)` floors COUNT to 1 → bump UPDATE at 718-728 → `revalidateTag(userLibrary)` at 741-742. Trigger conditions for the fall-through:
  - `linkError` truthy (RLS denial, transient DB error, schema drift)
  - `linkError === null` BUT UPDATE matched 0 rows (entry tombstoned in the window by a sibling tab — rare but possible since `.eq('id', insertedId).eq('user_id', userId)` returns no error on 0-row match)
  - `inserted.id` not a string (typeof guard at 666 skips the link UPDATE entirely; loops through to bump path nonetheless)
- **Invariant broken:** `log_count == COUNT(food_entries WHERE library_item_id = id)`. R1 introduced this invariant; the failure path violates it permanently on first observation.
- **Impact:** Library badge displays "1 log" while the food_entries row remains orphaned (`library_item_id=null`). All future COUNT-derived re-log bumps undercount from that point — the next re-log writes `log_count=1` (the new entry alone) instead of `2`. The user-visible badge stays stuck under-count until the orphaned entry is manually relinked.
- **Codex recommendation:** Gate bump/invalidate/enqueue behind confirmed link (transaction/RPC, or make link UPDATE return affected count and skip bump on 0).
- **Severity rationale:** Critical — the R1 fix's correctness invariant is broken under a real failure mode, the failure is silent (200 OK, false badge), and the corruption is permanent for that library row.

### IMPROVEMENT #1 — COUNT-then-UPDATE can lose newest count under 3+ request concurrency
- **Location:** `app/api/entries/save/route.ts:697-723`
- **Codex severity:** medium (maps to Improvement per project severity rule)
- **Evidence path:** Separate SELECT at 697-701 → literal UPDATE at 718-723. The COUNT is captured in a JS variable (`trueCount`) and used as a literal in the UPDATE statement, NOT as a subquery.
- **Race scenario:** Request A counts 1 → Request B counts 2 → Request C counts 3 → Request B updates `log_count=2` → Request C updates `log_count=3` → Request A finishes last and overwrites `log_count=1`. Final state: `log_count=1`, but true COUNT=3.
- **Codex acknowledgment:** "The two-request convergence case is not enough to prove safety when a stale writer can complete last." This widens R1's accepted lost-update tolerance from 2-request convergence to 3+ request divergence.
- **Codex recommendation:** Move COUNT derivation into the database write boundary — `UPDATE food_library_items SET log_count = (SELECT COUNT(*) FROM food_entries WHERE library_item_id = $1)`.
- **Self-healing note:** The next re-log via `/api/library/[id]/log-now` or the in-file re-log path runs the same COUNT-derive pattern and would correct the stuck `log_count=1` to the true value. Not permanent corruption.
- **Severity rationale:** Improvement — same lost-update pattern that R1 already accepted for the 2-request case; the 3+ request widening is unlikely for a single user but is a real divergence path. Self-healing on next re-log mitigates the duration of incorrect display.

## Cross-cutting notes (from Codex's pre-finding probe)

Codex acknowledged the R1 fix IS on disk (sanity check passed at Codex's end too — "The R1 code is back on disk").

Codex did NOT flag concerns about (concerns 7-10 from the framing):
- 23505 recovery SELECT user_id scoping (line 634 — `.eq('user_id', userId)` — correctly scoped)
- RLS on the link UPDATE (line 672 — `.eq('user_id', userId)` — defense-in-depth present)
- Cache invalidation correctness on bump-success vs error branches (only the bump-success branch invalidates; non-23505 error path correctly skips)
- Bug 2 formatMilligrams tier boundaries (0.05, 1 thresholds — no banker's rounding concerns surfaced)
- Bug 2 mcg unit reuse semantics (4-tier thresholds applied to mcg — no surprising display concerns surfaced)
- Tests rigor for the R1 fix (new RED tests exercise 23505 recovery path realistically — no concern raised)

These concerns from the R2 framing came back clean — Codex found no issue in those areas after reading the code.

## Recommendation

**ESCALATE — Critical after R2.** Per `~/.claude/rules/codex-review.md`: "C>0 → ESCALATE — Critical after R2".

- The Critical is a **new finding** (R1 closed C1's "missing link UPDATE" but introduced C2's "link UPDATE error not gated"). It is not the same finding re-surfaced.
- The Improvement is a **widening** of R1's accepted lost-update tolerance (2-request → 3+-request concurrency). Self-healing on next re-log.
- The 2-round cap is reached. No R3 is permitted by the policy.
- Main agent decides:
  - Accept the Critical as a known edge case (link UPDATE errors are rare; document in `Planning/followups.md`)
  - Dispatch one final file-scoped auto-fix to gate bump behind confirmed link (this would technically be outside the 2-round cap — main agent's call whether the cap is hard for THIS gate type)
  - Halt the batch and re-plan

## Stash recovery confirmation

The R1 fix is fully restored on disk. Recovery was successful. The previous R2 attempt's finding ("R1 fix absent") is now obsolete and superseded by this RETRY review. The two findings here (Critical + Improvement) are genuine R2 findings against the recovered tree, not artifacts of the stash incident.
