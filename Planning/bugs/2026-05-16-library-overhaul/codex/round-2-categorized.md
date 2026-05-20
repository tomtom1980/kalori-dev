# Codex Round 2 — Categorized Findings

**Batch:** `2026-05-16-library-overhaul`
**Base SHA:** `68a39497c081d5db9ecf78e4ce4b89454dd8ba58`
**Date:** 2026-05-16
**Verdict:** `critical_present` — escalation required

---

## Summary

| Severity     | Count |
|--------------|-------|
| Critical     | 1     |
| Improvement  | 1 (Codex tagged `medium`; per `bugfix-tomi`/`codex-review.md` taxonomy, `medium` maps to Improvement) |
| Minor        | 0     |

Round 2 is the LAST automated Codex round per the two-round cap. The presence of a Critical finding forces escalation to the user per Phase 5 protocol — Round-2 Critical findings are NOT silently auto-fixed.

---

## Critical findings (1)

### C1 — Claim step is not a one-winner lock (sketch pipeline race regression)

**File:** `lib/library/sketch-pipeline.ts` (lines 116–134)
**Function:** `claimSlot`

**The actual bug:** Round-1 replaced the read-check-write with a "conditional UPDATE + .select()" pattern intended to be atomic. But the new pattern still uses a stale preflight value:

1. Preflight reads `sketch_attempt_count = 0`
2. Worker A: `UPDATE ... SET sketch_attempt_count = 0 + 1 WHERE attempt_count < 3 AND generated_at IS NULL` → matches, writes 1, returns row. A starts Gemini call.
3. Worker B (same user, concurrent): preflight also read 0. Issues the SAME update: `SET sketch_attempt_count = 0 + 1 WHERE attempt_count < 3 AND generated_at IS NULL`. **Row still has attempt_count = 1 and generated_at = NULL**, so the predicate matches again, writes 1 (same value), returns 1 row. B also starts Gemini call.

**Why RLS doesn't save us:** Both updates are authorized for the same user. RLS only blocks cross-user access, not concurrent self-access.

**Why the "atomic UPDATE" framing was wrong:** Postgres only guarantees row-level atomicity *within* a single UPDATE statement (no torn writes). It does NOT serialize separate UPDATE statements against the same row at READ COMMITTED isolation. The second worker's UPDATE re-evaluates its WHERE clause against the post-first-update row state — and the predicate still matches.

**What Codex recommends:**
- Establish an exclusive in-progress *lease state* in the row (e.g., add a `sketch_claim_status` column or set `sketch_generated_at = sentinel` value to mark "claimed"), OR
- Move the claim into a Postgres RPC / advisory-lock path that atomically transitions from `eligible` → `claimed` and returns exactly one winner, OR
- Use `INSERT ... ON CONFLICT DO NOTHING` on a separate claims table, OR
- Use `SELECT ... FOR UPDATE` inside an RPC, OR
- Make the WHERE clause reference the stale value: `WHERE sketch_attempt_count = ${currentAttempts}` (compare-and-set semantics)

**Impact if shipped:** Concurrent retries (e.g., user double-clicks the sketch retry button, two tabs trigger backfill simultaneously, or N requests hit the per-user retry endpoint within a few hundred ms) can fire 2+ Gemini calls per item. The cost cap claimed in Bug 5 design is not actually enforced under contention. This is the EXACT bug Round 1 was supposed to fix.

**Recommended escalation framing for user:** "Round 2 found that the Round-1 'atomic UPDATE' fix is still vulnerable to duplicate Gemini calls under realistic concurrent retry scenarios — the predicate matches a second time after the first UPDATE because the WHERE clause doesn't pin the stale attempt_count value. Three options: (a) accept and ship — risk duplicate Gemini cost on contention edge cases; (b) override the 2-round cap and run a Round-3 auto-fix with a compare-and-set or status-lease approach; (c) abort + rollback to baseline."

---

## Improvement findings (1)

### I1 — Thumbnail signing fans out for every row before client pagination (N+1 at scale)

**File:** `lib/library/fetch.ts` (lines 93–109)
**Function:** `fetchLibraryPage`

**The actual issue:** `fetchLibraryPage` selects all active rows (no SQL `LIMIT` matching the displayed page), then signs every non-null thumbnail via `Promise.all` before returning to the RSC page. Pagination happens client-side. So a library with 100-200 backfilled items triggers 100-200 sequential-fanout storage signing calls per `/library` render.

**Why React `cache()` doesn't fix this:** Codex correctly notes that `cache()` dedupes within a single render tree, not across requests. Even with deduplication, the first render still pays full O(N) cost.

**Impact:** Latency scales linearly with library size, not page size. Real-world libraries will degrade over time. The current state is fine for an empty library / a small library; it gets bad past ~50 items.

**Codex recommendations:**
- Sign only the visible page's thumbnails (push pagination to the SQL layer with `LIMIT/OFFSET` before signing)
- Use Supabase bulk signed URL creation if available
- Add bounded concurrency around the signing fan-out
- Cache signed URLs (e.g., upstash KV) keyed by storage path with 1-hour TTL matching the signing TTL

**Status:** This is an Improvement (Codex tagged `medium`). Round 2 outcome with Improvement-only would normally trigger a final wrap-up auto-fix pass. But since Round 2 also has a Critical, the entire batch is escalated to the user — the Improvement will be addressed as part of the user's decision (e.g., if user picks Round-3 override, address both; if user picks ship-as-is, defer Improvement to `pending_minor_findings`).

---

## Minor findings (0)

None.

---

## Affected files (deduplicated)

- `lib/library/sketch-pipeline.ts` (Critical C1)
- `lib/library/fetch.ts` (Improvement I1)

---

## Round 2 outcome verdict

**`critical_present`** — Phase 5 protocol mandates escalation to user with 3 choices:
1. Force-commit (ship with Critical accepted as documented risk)
2. Round-3 override (extend the 2-round cap with explicit user authorization)
3. Abort + rollback to baseline `68a39497`
