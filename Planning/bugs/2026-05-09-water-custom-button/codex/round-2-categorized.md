# Codex Round 2 — Categorized Findings

## Pre-flight
- Diff size (full working tree): 684,019 bytes (~668 KB) — under 900 KB budget, in tight zone
- Diff size (code-only, in-scope files): 116,845 bytes (~114 KB)
- Files in diff: 79 total (10 production/test/SQL files in scope, 1 new SQL migration, 1 new component, plus screenshots/sw bundle/lockfile noise)
- Command used: `node "/c/Users/tamas/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs" adversarial-review --wait --base HEAD "<focus text>"`
- Auto-retry signals: **none** (verified — no `Input exceeded 1MB`, `Retrying with tighter scope`, `production files only`, or `spec context trimmed` strings in output)
- Codex verdict: `needs-attention` — "No-ship: the RPC fixes the route path, but the database still exposes a direct authenticated write path that bypasses the new cap entirely."

## Round 1 fix verification

Codex did not flag any regression in the round-1 fixes:
- C1 (fail-open on totals error): **fixed** — route.ts now uses RPC, no fail-open path
- C2 (SUM-then-insert race): **fixed** — RPC uses `pg_advisory_xact_lock` + atomic SUM-cap-INSERT
- I1 (FAB 409 missing parse+refresh): **fixed** — nav-shell.tsx now parses 409 body and calls `router.refresh()`
- I2 (EDIT silent off-step write): **fixed** — `hasUserInteracted` gate + `doneDisabled` prop on MobileWheelSheet

No re-introduction. All four round-1 fixes hold.

## Critical (count: 1)

### CR2-1: Daily cap is enforced only by the new RPC, not by the table write boundary (supabase/migrations/0018_water_log_atomic_cap.sql:74-213)

**Codex severity: high** — mapped to **Critical** per skill convention (Codex `high` = no-ship).

**Verbatim from Codex:**
> The migration adds `log_water_with_cap` and grants it to `authenticated`, but the cap/lock logic only runs for callers that voluntarily use this RPC. Existing `water_log` RLS still permits authenticated users to insert their own rows directly, as shown by the `water_log_insert_own` policy in migration 0003 and the integration tests that seed through `harness.user*.client.from('water_log').insert(...)`. A client with the Supabase anon key can therefore bypass `P0010`, the advisory lock, and the 5000 ml/day check by writing `water_log` directly. This undermines the claimed server-side cap invariant and can persist totals above the daily limit without touching `/api/water/log`.
> Recommendation: Move the invariant to the actual write boundary: either revoke direct authenticated INSERT/UPDATE on `public.water_log` and force writes through the RPC, or add a BEFORE INSERT/UPDATE trigger that uses the same per-user/day lock and cap check for every write path. Add an RLS/integration regression proving direct table insert cannot exceed the cap.

**Affected file(s):**
- `supabase/migrations/0018_water_log_atomic_cap.sql` (the new RPC grants insert via function but does not revoke direct table INSERT)
- `supabase/migrations/0003_*.sql` (defines `water_log_insert_own` RLS policy that still allows direct authenticated INSERT)
- Pre-existing `water_log` RLS policy chain (the security boundary that needs tightening)

**Important context for triage:**
This is **NOT** a regression introduced by round 1 fixes. The direct-table-write path has existed since migration 0003 and is the basis for the integration test harness (`harness.user*.client.from('water_log').insert(...)`). The new RPC adds a *second*, stronger path but does not close the existing one. Round 1 surfaced a route-level race; round 2 surfaces a longer-standing RLS-level architectural gap.

**Whether this should block the bugfix-tomi batch:**
- Pure interpretation: Codex says "no-ship," recommending revoke-and-trigger.
- Realistic interpretation: This is a **scope-expansion finding** — the fix requires (a) revoking direct INSERT on `water_log` for `authenticated` role, (b) updating ALL call sites that currently use direct insert (test harness + any seeding code) to use the RPC, (c) adding a regression test, (d) a separate Supabase migration. That is meaningfully larger scope than the original 2-bug bundle and crosses into general security-hardening territory.
- The two original bugs (custom mode crash + mobile FAB cap-toast UX) are fixed correctly by round-1 changes.
- The cap can still be exceeded via direct DB write — but that requires a malicious client deliberately calling the Supabase JS API instead of the API route, which is a separate threat model from the user-facing bugs in scope.

**Recommended fix (per Codex):**
1. Revoke `INSERT, UPDATE` on `public.water_log` from the `authenticated` role in migration 0018 (or new migration 0019).
2. Replace direct `client.from('water_log').insert(...)` calls in test harness + seeders with `client.rpc('log_water_with_cap', ...)` calls.
3. Add an integration regression: attempt direct INSERT as authenticated user, expect denial.
4. Confirm RPC `SECURITY DEFINER` (it currently is, per migration 0018) so it can write even after the role's direct-write privilege is revoked.

## Improvement (count: 0)

No Improvement-tier findings.

## Minor (count: 0)

No Minor-tier findings.

## Summary

- **1 Critical** (architectural: RLS still allows direct-table writes bypassing the new RPC cap; pre-existing, not a regression)
- **0 Improvement**
- **0 Minor**
- 0 auto-retry signals; review is complete

## Gate status

**Per skill: ESCALATE to main agent.** Round 2 cap is reached — no round 3. The remaining Critical finding requires a user decision:

1. **Force-commit** the bugfix batch as-is. Original 2 bugs are correctly fixed. Defer the direct-table-write hardening to a follow-up bugfix batch / security-hardening pass. Add to `Planning/followups.md`.
2. **Round 3 (skill-violating)** — explicitly authorize a third auto-fix round to address CR2-1 within this batch. Requires user override of the 2-round cap.
3. **Abort** the batch — do not commit anything from this batch until the RLS hardening is done first.

The recommended path is **option 1 (force-commit + followup)** because:
- The Critical finding is pre-existing architecture, not a regression introduced by this batch.
- The original two bugs are correctly fixed and verified.
- The RLS hardening is genuinely larger scope than this batch was sized for.
- Deferring it to a dedicated security-hardening batch is the cleaner path than ballooning this one.

Main agent should surface options to user.
