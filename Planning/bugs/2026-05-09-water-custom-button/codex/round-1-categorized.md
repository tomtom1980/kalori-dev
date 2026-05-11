# Codex Round 1 — Categorized Findings

## Pre-flight
- Diff size (full): 644,481 bytes (~629 KB) — under 900 KB budget
- Diff size (code-only, excluding screenshots/sw.js/lockfile/next-env): 77,733 bytes (~76 KB)
- Files in diff: 78 total (9 code/test/config, 1 new file, 1 lockfile, 2 sw bundle, 65 screenshots, 1 next-env)
- Command used: `node "/c/Users/tamas/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs" adversarial-review --wait "<focus text>"` (working-tree review, no `--base`)
- Auto-retry signals: none (verified via Grep on round-1.md)
- Codex verdict: `needs-attention` — "No-ship: the cap is not actually server-authoritative under failure or concurrency, and the mobile FAB violates the stated 409 resync contract."

## Critical (count: 2)

### C1: Cap check fails open when totals SELECT fails (app/api/water/log/route.ts:128-130)
**Verbatim from Codex:**
> The pre-write cap check treats `computeDayTotalMl(...)` returning `null` as `0`. That helper returns `null` on any totals SELECT error, so a transient Supabase/read-policy/error path turns an unknown current total into an empty day and allows the insert. Impact: the new server-authoritative 5000 ml cap can be bypassed exactly during degraded dependency conditions, corrupting the daily total past the limit.
> Recommendation: Do not reuse the post-write best-effort total helper for enforcement; make the pre-write cap read fail closed with a 5xx/503 or move enforcement into an atomic database operation that cannot proceed without the current total.

**Affected file(s):** `app/api/water/log/route.ts` (lines 128-130, the pre-write cap check that consumes `computeDayTotalMl(...)`)

**Recommended fix:** Distinguish "totals helper returned null due to error" from "no entries today." For the cap-enforcement read, fail closed: return 503 (or 500) when the totals SELECT errors out, instead of treating null as 0. Alternatively replace the read+check pattern with an atomic DB operation (RPC / trigger / unique constraint at day boundary).

### C2: SUM-then-insert cap enforcement is not atomic (app/api/water/log/route.ts:128-153)
**Verbatim from Codex:**
> The route reads the current day total, checks it, then performs a separate insert. Distinct concurrent requests can both observe the same pre-write total and both pass. The exact `current=4750, delta=300` case rejects individually, but `current=4750` with two 250 ml requests or `current=4500` with two 300 ml requests can both pass their local checks and leave the day over 5000 ml. Impact: the cap is race-prone under double-taps, multi-tab usage, and FAB/chip overlap.
> Recommendation: Enforce the cap in a single database-side transaction/RPC with a per-user-day lock, serializable isolation, or equivalent constraint so the total used for the decision and the insert commit are one atomic operation.

**Affected file(s):** `app/api/water/log/route.ts` (lines 128-153, full read-check-insert window)

**Recommended fix:** Move enforcement into an atomic DB operation — a Postgres function/RPC that locks the user-day row, computes total, and inserts only if total + delta <= cap, all within one transaction. Without atomicity, contemporaneous chip + FAB taps or multi-tab use can overflow the cap.

## Improvement (count: 2)

### I1: Mobile FAB 409 handler ignores currentTotalMl and leaves stale dashboard (components/nav/nav-shell.tsx:244-265)
**Verbatim from Codex:**
> The FAB 409 handler dismisses the optimistic toast and shows a cap toast, but it never parses the 409 body and explicitly avoids `router.refresh()`. If the user is on the dashboard with stale visible water state, the server can return `currentTotalMl: 5000` while the WaterTracker still shows the old lower value. That contradicts the batch contract that the client re-syncs from `currentTotalMl` on 409.
> Recommendation: Consume the 409 response body and propagate `currentTotalMl` to the visible water state, or refresh the dashboard data on 409 when the current UI can display water totals.

**Affected file(s):** `components/nav/nav-shell.tsx` (mobile water FAB 409 handler ~lines 244-265)

**Recommended fix:** Parse the 409 body in the FAB handler and either (a) call a shared resync hook so WaterTracker re-renders with `currentTotalMl`, or (b) trigger `router.refresh()` when the user is on a dashboard route that surfaces water totals. The chip path already does this; the FAB path must match the contract.

### I2: EDIT default at off-step totals silently adds water (components/dashboard/WaterTracker.tsx:190-203)
**Verbatim from Codex:**
> For off-step totals, `editLowerBoundMl` rounds up and `editDraftMl` is reset to that rounded value. At 4775 ml, simply opening EDIT and pressing Save posts a positive 25 ml delta even though the user did not choose a higher total; the exact current value is not selectable in the wheel. Impact: the edit surface can create surprising, accidental data changes.
> Recommendation: Make the initial draft represent the exact current total as a no-op, or disable Save until the user explicitly selects a higher value; keep the wheel/input able to express the current value even when it is not on a 50 ml boundary.

**Affected file(s):** `components/dashboard/WaterTracker.tsx` (lines 190-203, `editLowerBoundMl` / `editDraftMl` initialization)

**Recommended fix:** One of:
1. Disable Save until the user actively touches the wheel/input (track `isDirty`).
2. Allow current exact value as the wheel's bottom row regardless of step alignment.
3. Initialize the draft to current value (no-op default), and treat Save with `delta=0` as a no-op.

## Minor (count: 0)

No minor findings.

## Summary

- 2 Critical (data-correctness on cap enforcement — fail-open + race)
- 2 Improvement (FAB 409 contract drift + EDIT default that creates accidental writes)
- 0 Minor
- 0 auto-retry signals; review is complete

**Gate status: needs auto-fix sub-agents.** All four findings should be auto-fixed before re-review (round 2). C1 and C2 are no-ship; I1 violates the stated batch contract; I2 produces silent data mutation on a UI surface added by this batch.
