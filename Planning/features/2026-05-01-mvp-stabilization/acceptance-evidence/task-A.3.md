# Task A.3 (US-STAB-A3) — Acceptance Evidence (Lean form)

> **Status: ✅ Completed (Codex 2-round cap reached: APPROVE-WITH-FOLLOWUPS)**
> Generated: 2026-05-07 (backfilled by Phase A Testing Sweep — A.SWEEP Step 5)
> Source records:
> - Implementation commit: `f5ef9d0` — `task A.3: orphan profile fallback — page 302 + API 401 + TOCTOU-safe LEFT JOIN`
> - Codex Round 1 fix: `3503f2f` — `fix: task A.3 — Codex Round 1 (redirect status assertion + missing API regression rows)`
> - Codex Round 2 fix: `84bb217` — `fix: task A.3 — Codex Round 2 (split error/null branches + rescope AC5 wording)`
> - Close commit: `0638e17` — `docs: backfill task A.3 commit hashes in CHANGELOG + continuation`
> - Full output / RED-GREEN log: `Planning/.tmp/task-A.3-output.md`
> - Codex transcripts: `Planning/.tmp/task-A.3-codex-review.md` (Round 1 + Round 2)
> - Verification report cross-reference: `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` (HEAD `0638e17`; F1 AC4, F6 AC7, F8 AC6, F16 AC4, F17 AC4 reference the A.3 fence)

---

## Header

| Field | Value |
|---|---|
| **ID** | A.3 |
| **Name** | US-STAB-A3 — Orphan-profile redirect to /onboarding |
| **User Story** | US-STAB-A3 |
| **Complexity** | Medium |
| **Codex review** | Per-task — 2 rounds (verdict: APPROVE-WITH-FOLLOWUPS) |
| **Type tags** | `[backend][API][FA][brownfield]` |
| **Branch baseline** | `main` @ `0ef2972` (post-A.2) |
| **TDD mode** | Two-red (brownfield) |
| **Acceptance evidence tier** | Lean (Medium non-UI) |

---

## Summary

Replaced legacy inline `profiles` SELECT + ad-hoc redirect/throw guard scattered across the (app) page handlers and aggregate-bearing `/api/**` routes with a single fence helper at `lib/auth/orphan-profile-fence.ts`. The helper exports `requireProfileOrRedirect()` (page flavor → 307 redirect to `/onboarding` on orphan) and `requireProfileOrJson401()` (API flavor → JSON 401 `{"error":"profile_lookup_failed"}` per US-STAB-D2 contract). Both call `getServerSupabase().auth.getUser()`, then issue exactly one `.from('profiles').select('id, onboarding_completed_at[, …extras]').eq('id', user.id).maybeSingle()` round trip. On orphan detection it emits a Sentry breadcrumb `dashboard.orphan-profile-fenced` carrying SHA-256 anonymized `user_id_hash` (raw UUID never appears in breadcrumb data, message, or extras). Wired into 6 page handlers (`dashboard`, `log`, `library`, `progress`, `weight`, `settings`) and 16 API routes.

Codex Round 2 resolved a Critical defect by splitting the result discriminant into 4 kinds (`unauthenticated` | `lookup_error` | `orphan` | `ok`) so transient PostgREST errors no longer cascade through the refresh interceptor as a forced sign-out. The `lookup_error` branch returns 503 `profile_lookup_unavailable` (API) or throws `ProfileLookupError` (page) and emits `Sentry.captureException` rather than the orphan breadcrumb.

---

## Acceptance Criteria — verification

| AC | Verified by | Result |
|---|---|---|
| AC1 — Page route 302 redirect on orphan | `tests/integration/dashboard-orphan-profile.test.ts` › AC1 describe block (line 345); parametrized over dashboard/log/library/progress/weight/settings | **PASS (with documented deviation: 307 not 302 — see §Deviations)** |
| AC2 — API endpoint JSON 401 `{"error":"profile_lookup_failed"}` | Same file, AC2 describe block (line 619); parametrized over all 16 fenced API routes | **PASS** |
| AC3 — Sentry breadcrumb `dashboard.orphan-profile-fenced` with hashed user_id (no raw UUID) | Same file, AC3 describe block (line 660) | **PASS** |
| AC4 — `auth.uid()` server-scoping enforced on every aggregate (smuggled foreign user-ids ignored) | Same file, AC4 describe block (line 715); two-user fixture (A orphan, B with rows) | **PASS** |
| AC5 — Two-step fence with auth.uid() server-scoping; exactly one `profiles` SELECT before redirect/401 | Same file, AC5 describe block (line 766); renamed from "single-pass / TOCTOU-safe" wording in Codex Round 2 (see §Deviations) | **PASS (with documented deviation: two-step, not single LEFT JOIN)** |
| AC6 — Fallback insert (pure-redirect chosen): no `profiles.insert` call observed; `/onboarding` self-heals | Same file, AC6 describe block (line 817) | **PASS** |
| Codex Round 2 NEW — Transient profile lookup error path: page throws `ProfileLookupError` (NOT redirect to `/onboarding`); API returns 503 `{error:'profile_lookup_unavailable'}` (NOT 401); `Sentry.captureException` called; NO orphan breadcrumb emitted | Same file, "AC1+AC2 — transient error path" describe block (added in `84bb217`) — 2 new tests | **PASS** |

**Final test results:** `npx vitest run tests/integration/dashboard-orphan-profile.test.ts` → 28/28 GREEN (Round 1 baseline 24/24 → Round 1 fix 26/26 → Round 2 fix 28/28).

Full Vitest suite at HEAD `84bb217`: 1788/1788 GREEN per resume sub-agent log; typecheck clean; lint clean (5 pre-existing warnings on UNTOUCHED files). See `Planning/.tmp/task-A.3-output.md` §7.

---

## Deviations from `tasks.md` (carried as docs followups)

1. **AC1 302 → 307 redirect status.** Next.js 16 Server Component `redirect()` cannot emit 302 (default `RedirectType.replace` = 307; `permanentRedirect` = 308). AC1 test asserts 307 explicitly. `tasks.md` AC1 wording "302" retained as a docs followup — does not require code change. Tracked alongside `F-A3-AC5-DOCS-RECONCILE`.
2. **AC5 "single LEFT JOIN, TOCTOU-safe single round trip" → "two-step fence with auth.uid() server-scoping".** Implementation does `auth.getUser()` followed by `profiles.select(...).eq('id', user.id).maybeSingle()` — two round trips. AC5 describe label and inner test name renamed in Codex Round 2 fix (`84bb217`). `tasks.md` AC5 wording retained pending user decision: reword AC5 OR commit to atomic-RPC follow-up. Tracked as `F-A3-AC5-DOCS-RECONCILE` and `F-A3-RPC-ATOMIC` in `Planning/followups.md`.

Both deviations were cleared by Codex Round 2 with documented rationale and test-side rescoping; the production behavior is correct under Next 16 + the chosen two-step fence design.

---

## Codex findings disposition

| Round | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | AC1 redirect-status assertion (URL-only, missing 307 status) | Critical | **Fixed** in `3503f2f` (test rewrite to assert 307) |
| 1 | API_CASES coverage gap (`export/json` + `export/zip`) | Improvement | **Fixed** in `3503f2f` (2 new parametrized cases) |
| 2 | `error || !data` collapses transient PostgREST errors into orphan 401 → forced sign-out via refresh interceptor | Critical | **Fixed** in `84bb217` (4-kind discriminant; 503 `profile_lookup_unavailable` for API; `ProfileLookupError` thrown for page; `Sentry.captureException` not breadcrumb; +2 tests) |
| 2 | Fence is two-step, not single LEFT JOIN; AC5 advertises TOCTOU-safe single round trip | Improvement | **Fixed** in `84bb217` as documentation correction (header docstring + AC5 wording rescope; production code unchanged) |

**Codex 2-round cap reached.** Verdict: **APPROVE-WITH-FOLLOWUPS.** 6 deferred adversarial threats / docs reconciliations recorded in `Planning/followups.md`:
- `F-A3-SHA256-AUDIT` — Salt SHA-256 user-id hash with HMAC server-side secret (privacy defense-in-depth).
- `F-A3-BREADCRUMB-NAME-VERIFY` — Cross-check breadcrumb category string against design-doc spec.
- `F-A3-DEDUP-MOCK-AUDIT` — Audit `buildSupabaseMock` permissive `passThrough` chain for false-GREEN risk.
- `F-A3-JWT-SPOOF-FENCE` — Document threat boundary for stale/forged JWT cookie reaching the fence.
- `F-A3-AC5-DOCS-RECONCILE` — Reword AC5 wording in `tasks.md` to match two-step reality.
- `F-A3-RPC-ATOMIC` — Replace two-step auth + profile lookup with security-invoker RPC for true atomicity (closes TOCTOU window). Complex follow-up.

---

## Files Created / Modified (final)

**Created (NEW):**
- `lib/auth/orphan-profile-fence.ts` — fence helper module (~218 lines net of Round-2 expansion)
- `tests/integration/dashboard-orphan-profile.test.ts` — AC1–AC6 + transient-error integration suite (~853 lines after Round 1 + Round 2 expansion)

**Modified — Page handlers (6):**
- `app/(app)/dashboard/page.tsx`
- `app/(app)/library/page.tsx`
- `app/(app)/log/page.tsx`
- `app/(app)/progress/page.tsx`
- `app/(app)/settings/page.tsx`
- `app/(app)/weight/page.tsx`

**Modified — API routes (16):**
- `app/api/ai/weekly-review/route.ts`
- `app/api/entries/[id]/route.ts`, `app/api/entries/copy-yesterday/route.ts`, `app/api/entries/save/route.ts`
- `app/api/export/csv/route.ts`, `app/api/export/json/route.ts`, `app/api/export/zip/route.ts`
- `app/api/library/[id]/delete/route.ts`, `app/api/library/[id]/update/route.ts`, `app/api/library/bulk-delete/route.ts`, `app/api/library/bulk-delete/undo/route.ts`, `app/api/library/dedup-check/route.ts`, `app/api/library/merge/route.ts`
- `app/api/storage/thumbnail/route.ts`
- `app/api/water/log/route.ts`
- `app/api/weight/log/route.ts`

**Modified — Tests (mock-widening, no logic change):**
- `tests/unit/api/dedup-check.test.ts` — added `profilesTable` registration to `from(table)` switch for the fence preflight.
- `tests/integration/weight-log-idempotency.test.ts` — widened `profiles.select(cols?)` switch to discriminate on `cols.includes('onboarding_completed_at')` (fence preflight, returns happy row) vs `cols.includes('deleting_at')` (Codex Round 2 NEW-I1 pre-existing fence) vs default `*` (recalc branch, kept legacy `data: null`).

**Process tracking — Modified:**
- `Planning/progress.md` — A.3 row → ✅ Completed at close commit.
- `Planning/CHANGELOG.md` — A.3 entry citing impl `f5ef9d0` + Codex Round 1 fix `3503f2f` + Codex Round 2 fix `84bb217` (added in close commit `0638e17`).
- `Planning/continuation.md` — handoff for A.VERIFY (added in close commit `0638e17`).
- `Planning/followups.md` — 6 new F-A3-* entries (added in close commit `0638e17`).

**Exemptions (intentionally NOT fenced):**
- `app/api/profile/save/route.ts` — profile creation path; fence would deadlock new-user signup.
- `app/api/account/delete/route.ts` — orphan delete is by-design.
- `app/auth/callback/route.ts` — already redirects to `/login?error=profile_lookup_failed` via existing logic.
- `app/(app)/onboarding/page.tsx` — deliberate exception (would create infinite redirect loop for orphans); uses raw `maybeSingle()` and tolerates null/error so wizard always renders.

---

## Cross-reference to A.VERIFY verification report

The A.VERIFY 19-feature AC-by-AC verification matrix at `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` (HEAD `0638e17`) independently re-verified the A.3 fence behavior across multiple features:

- **F1 AC4** (`/onboarding` for orphan-profile user) — PASS — confirms `app/(app)/onboarding/page.tsx` does NOT route through `requireProfileOrRedirect` (deliberate exception).
- **F6 AC7** (Orphan-profile user post-A.3 visits `/dashboard` → 307 redirect to `/onboarding`) — PASS — code-archaeology cite `lib/auth/orphan-profile-fence.ts:267-270` (`redirect('/onboarding')` defaults to RedirectType.replace → 307); test cite `tests/integration/dashboard-orphan-profile.test.ts:351,381-385`.
- **F8 AC6** (Orphan-profile user visits `/progress` → 307 redirect) — PASS — code-archaeology cite `progress/page.tsx:60-67`; `orphan-profile-fence.ts:269`.
- **F16 AC4** (A.3 fence + RLS together: aggregate APIs go through `requireProfileOrJson401`; orphan returns JSON 401, normal user sees only own rows) — PASS — code-archaeology cite `orphan-profile-fence.ts:139-156` (auth.getUser() + `.eq('id', user.id).maybeSingle()`).
- **F17 AC4** (Orphan-profile post-A.3: API returns JSON 401 with `error: 'profile_lookup_failed'`; first 401 triggers refresh; refresh succeeds; retry returns same 401; second 401 path → forceSignOut without infinite loop. Transient → 503 `profile_lookup_unavailable` evades 401 path) — PASS — code-archaeology cite `refresh-interceptor.ts:160-166`; `orphan-profile-fence.ts:300-313`.

A.VERIFY's "Crystallized invariants" section (line 274 of verification-report.md) summarizes: "A.3 fence is centrally enforced and uniformly observed. Every protected page (`dashboard|log|library|progress|weight|settings`) routes through `requireProfileOrRedirect` from `lib/auth/orphan-profile-fence.ts` (orphan → 307 to `/onboarding`); every aggregate API route through `requireProfileOrJson401` (orphan → JSON 401 `profile_lookup_failed`, transient → JSON 503 `profile_lookup_unavailable`). Verifiers correctly treated these as CORRECT, not bugs."

---

## Provenance

This evidence file was backfilled on 2026-05-07 by the Phase A Testing Sweep sub-agent (A.SWEEP Step 5) from existing project records. Authoritative sources:
1. `Planning/.tmp/task-A.3-output.md` (RED-GREEN log + Codex disposition + test results)
2. `Planning/.tmp/task-A.3-codex-review.md` (Round 1 + Round 2 verbatim transcripts)
3. `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` (independent A.VERIFY pass cross-references)
4. Git commit log: `f5ef9d0` (impl), `3503f2f` (Round 1 fix), `84bb217` (Round 2 fix), `0638e17` (close).
