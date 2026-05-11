# Security Review — Batch 2026-05-09-water-custom-button

## Summary

The aggregate diff for this batch (Zod cap relax to 5000ml for `unit:'ml'`, atomic RPC `log_water_with_cap`, EDIT popover/wheel surface, `router.refresh()` on FAB 409) introduces **no new exploitable security vulnerabilities**. The new RPC uses `SECURITY INVOKER` (RLS-respecting) with `REVOKE ALL FROM public` + `GRANT EXECUTE TO authenticated`, mirroring the sibling pattern in `0008_library_merge_rpc.sql`. The route preserves the existing 4-layer auth chain (middleware session check → `requireProfileOrJson401` → `rejectIfDeletingOrUnavailable` → RPC's defensive `auth.uid() IS NULL` raise). Input validation is correctly tightened via `discriminatedUnion` so `glass`/`bottle` retain `count.max(200)` and only `ml` lifts to `count.max(5000)`. No PII leakage, no injection vectors, no secret leaks. The previously-deferred CR2-1 RLS gap (direct table writes bypass the RPC cap) is acknowledged as a separate followup — out of scope per Codex round 2's deferral. Two informational items noted around DoS surface and Postgres NOTICE log content.

## Findings

### S-CRITICAL (count: 0)

None.

### S-HIGH (count: 0)

None.

### S-MEDIUM (count: 0)

None.

### S-INFO (count: 4)

#### S-INFO-1 — RPC `SECURITY INVOKER` choice is correct (verification, not a finding)
- **File:** `supabase/migrations/0018_water_log_atomic_cap.sql:81`
- **Observation:** Function declared `security invoker`. RLS policies on `water_log` (migration 0003 lines 174-191) enforce `auth.uid() = user_id` for select/insert/update/delete. Inside the RPC body, every SELECT/INSERT additionally filters by `user_id = v_user` where `v_user := auth.uid()` (line 84) — defense-in-depth on top of RLS. Defensive `if v_user is null then raise exception` at line 96 prevents NULL-user inserts even if some upstream auth path failed silently.
- **Posture grade:** Correct. `SECURITY DEFINER` would have bypassed RLS and required hand-rolled `auth.uid()` validation; `INVOKER` keeps the RPC inside the same security perimeter as the rest of the route handler.
- **GRANT posture (line 213):** `revoke all from public; grant execute to authenticated` — only authenticated callers can invoke. Anonymous callers cannot reach the RPC. Matches sibling `0008_library_merge_rpc.sql` pattern.

#### S-INFO-2 — DoS surface via advisory-lock contention is theoretical
- **File:** `supabase/migrations/0018_water_log_atomic_cap.sql:115-117`
- **Observation:** `pg_advisory_xact_lock(hashtext(v_user::text || ':water:' || p_date::text))` keys per-(user, date). A single user holding many concurrent connections cannot DoS *other* users (lock key is user-scoped). Self-DoS is bounded by the supabase connection pool / authFetch's lack of timeout — but `pg_advisory_xact_lock` releases on COMMIT/ROLLBACK so each query is bounded by Postgres's statement timeout, not held forever.
- **Theoretical concern:** A pathological client could open N concurrent POSTs holding N locks for the same (user, date). Each waits in line; total throughput drops to one-at-a-time for that user-day. This is the *intended* behavior (atomicity > throughput) and does not affect other users.
- **Recommendation:** No action. If rate limiting is added at any layer (Vercel Edge / middleware / upstash), the `/api/water/log` endpoint should be included; today there is no rate-limit middleware in `middleware.ts` or any upstream layer for this route.

#### S-INFO-3 — Postgres NOTICE/RAISE detail field carries `currentTotalMl` only (non-PII)
- **File:** `supabase/migrations/0018_water_log_atomic_cap.sql:154-159`
- **Observation:** `raise exception ... detail = v_current_ml::text` puts a numeric daily total into the error detail. The route reads `rpcError.details` and echoes it as `currentTotalMl` in the 409 body. Postgres logs the RAISE with the detail field; database logs may surface `currentTotalMl` (a small integer 0..5000) but no user_id, no email, no IP. Not PII.
- **Recommendation:** None. If verbose logging is enabled and DB logs are exfiltrated, the only leak is "this user drank N ml of water on date D" — already known to anyone with `water_log` SELECT access (which RLS limits to the user themselves).

#### S-INFO-4 — XSS surface unchanged; no unsafe-HTML APIs in new code
- **Files:** `components/dashboard/WaterTracker.tsx`, `components/primitives/PopoverInline.tsx`
- **Observation:** EDIT input is `type="number"` with `min/max/step`; numeric paste of "9999" is auto-clamped at the input layer. Server-side `count.max(5000)` for `unit:'ml'` Zod-rejects oversized values with 400. The popover/sheet renders only static i18n strings (no user-controlled text rendered as HTML). No raw-HTML injection sinks (e.g., the React unsafe-innerHTML prop) appear in any new file. No dynamic-code-evaluation primitives in new code. CSP-relevant: no inline scripts introduced.
- **Recommendation:** None. Existing static-string + numeric-input pattern is XSS-safe.

## Out-of-Scope Items Surfaced (for awareness)

1. **Codex round 2 CR2-1 — Direct INSERT/UPDATE/DELETE on `water_log` bypasses the RPC cap.** RLS policies (migration 0003) allow any authenticated user to insert/update their own rows directly via PostgREST. The 5000 ml cap exists *only* in the RPC — a user crafting a raw `POST /rest/v1/water_log` with `{count: 99999, unit: 'ml'}` would bypass the cap. Pre-existing condition (Codex acknowledged this is not a regression introduced by this batch). **Deferred to a separate followup batch per Phase 5 round 2 ruling.** Recommended fix path (out of scope here): tighten RLS policies on `water_log` to `with check` predicates that enforce the cap, OR remove direct table grants and route all writes through the RPC. See Codex round 2 output for full discussion.

2. **R1 firewall preserved.** The route uses `authFetch` (not `authPost`) on the client side specifically to read 409 status codes — `authPost` throws a generic Error that loses the status. Both consumers (chip + FAB) follow this pattern. The `lib/auth/refresh-interceptor.ts` module remains untouched, preserving the R1 contract.

3. **Idempotency replay does not re-evaluate cap.** Lines 119-139 of the RPC: when `(user_id, client_id)` already exists, the RPC returns `replayed=true` without checking the cap. This is intentional — replays add no new ml. A user *cannot* abuse this to bypass the cap because the cap only matters at first-insert time, when the row's ml were already counted under the cap state then.

4. **Race window post-23505 (line 170-191).** When concurrent inserts collide on `client_id`, the RPC re-SELECTs the racing row and returns it as a replay. If the race row is missing (theoretically impossible — the unique violation means it exists), the RPC `raise`s and the route returns 500. Fail-closed is correct.

5. **Migration safety.** Migration uses `create or replace function` (idempotent on re-apply). No DOWN migration — matches sibling 0008 (forward-only convention). Safe to apply to dev + prod.

## Gate Status

**Zero Critical, zero High → security gate PASSES.**

No fix sub-agents needed. Medium/Info items: 0 Medium, 4 Info — Info items are observations/verifications, not action items. None of the Info items roll into pending_minor_findings as actionable; they document posture for the audit trail.

The CR2-1 RLS gap (out-of-scope item #1) is the only meaningful security work left on this surface, but it is explicitly deferred to a separate batch per the Phase 5 ruling and is not a regression from this batch.
