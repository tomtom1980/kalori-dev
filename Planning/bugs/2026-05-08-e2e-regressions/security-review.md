# Security Review — bugfix-tomi 2026-05-08-e2e-regressions

**Reviewer:** Phase 6 security sub-agent (read-only)
**Date:** 2026-05-08 17:02 GMT+7
**Scope:** Aggregate uncommitted diff for the e2e-regressions bug bundle. Production files: `lib/auth/orphan-profile-fence.ts`, `app/(app)/onboarding/page.tsx`. Test files: 3 integration specs, 5 E2E specs.

## Findings

### Critical
none

### High
none

### Medium
none

### Informational

1. **`requireProfileOrJson401` retains misleading function name.** The function still returns 422 for orphan and 503 for transient lookup errors but is named `requireProfileOrJson401`. This is documented in the source as a deferred follow-up (lines 304–306). No security impact; pure naming hygiene. Existing follow-up — do not block on this.

2. **Forged-cookie E2E spec relies on `waitForURL(/\/login\?.*redirect_to=/)` regex.** The regex matches any `/login?...redirect_to=...` URL — does not pin the redirect target value. Acceptable for the test's intent (verify a redirect happened, not the specific target), but if a future regression sent the user to e.g. `/login?error=xyz&redirect_to=/admin` it would still pass. No security impact today; flagged as informational.

3. **`SKIP_REASON_FORGED_SESSION` rationale documented inline in test.** The onboarding spec correctly notes that the smoke test (positive auth-guard canary) prevents a fully-broken auth guard from skipping the suite green. This is good defensive testing and a documented mitigation for the absence of F-TEST-4 (real Supabase test fixture). No security finding — calling out that the mitigation is documented, not silent.

## Per-file review

### lib/auth/orphan-profile-fence.ts

**Auth/authz impact (Bug 1 fix):**
- The change replaces the previous `redirect('/onboarding')` for ALL `lookup_error` cases with a narrower contract:
  - PGRST116 (PostgREST "row not found") → still redirect to `/onboarding` (defense-in-depth for the genuine missing-row case the orphan branch normally handles via `maybeSingle()`'s `data:null,error:null` shape).
  - Any other error (RLS denial code `42501`, network blip, crypto-validation failure, unknown DB error) → throw `ProfileLookupError` so Next's error boundary catches it.
- The earlier `unauthenticated` branch above this code still handles forged-cookie / missing-session cases via `signOut()` + `/login?reason=session_expired&redirect_to=...`. This means:
  - **Forged cookies with valid shape but invalid signature** → `getUser()` rejects → `kind: 'unauthenticated'` → `/login` redirect (verified by the now-passing C1-B Playwright test). NOT routed to `/onboarding`.
  - **Valid user, transient profile-row RLS denial** → `kind: 'lookup_error'`, code != PGRST116 → `ProfileLookupError` thrown, NOT redirected to `/onboarding`. The session is preserved (no `signOut()` call). This closes the C1-B forged-cookie-masquerading-as-orphan attack surface that the old broad redirect introduced.
  - **Valid user, transient profile-row PGRST116** → narrow defense-in-depth redirect to `/onboarding` (the orphan branch normally catches missing rows; PGRST116 reaches `lookup_error` only in edge cases where Supabase returns the no-row condition as an error rather than as `data: null`).

The error code check uses a defensive cast: `(result.error as { code?: string } | null)?.code`. This is read-only, won't throw on unexpected shapes, and only fires the narrow PGRST116 redirect. Authz impact: positive — narrows the redirect surface and preserves the session for valid users.

**PII handling:**
- `captureLookupError` (lines 188–204) sends to Sentry: `tags: { source: 'orphan-profile-fence', op: 'profile-lookup' }` and `contexts.profile_lookup: { user_id_hash, route }`. The `user_id_hash` is `hashUserId(user.id)`, NOT the raw UUID. No email, no name, no IP, no auth token. Clean.
- The `Sentry.captureException(profileError, ...)` call in `app/(app)/onboarding/page.tsx` line 87 sends only the underlying `profileError` plus tags `{ source: 'profile_lookup_guard', page: 'onboarding' }`. No user identifier in tags. Sentry default scrubbing should handle any accidental PII inside `profileError.message`. Clean.
- The thrown `ProfileLookupError` carries `cause: profileError` which propagates to Next's error boundary. Next 16's default error boundary in production renders a generic 500 page WITHOUT the cause/message — this is the same default behavior the codebase has relied on since the original Codex R1 F2 contract. Confirmed: no internals leak to the user.

**Issues:** none.

### app/(app)/onboarding/page.tsx

**Auth/authz impact (Bug 1 fix, mirror change):**
- The page-handler change parallels the fence change: on `profileError` (any cause), throw `ProfileLookupError` rather than silently rendering the wizard. The previous "render the wizard despite error" behavior was the broader risk — it meant a transient RLS error could re-show the wizard to an already-onboarded user, who might then submit the wizard a second time and overwrite their profile.
- The unauthenticated branch (lines 58–67) is unchanged: `getUser()` rejection → `signOut()` + `/login?reason=session_expired&redirect_to=%2Fonboarding`. Forged cookies still bounce to `/login` from this page (verified by the AC1 C1-B forged-cookie spec).
- Crucially, the new throw path does NOT call `signOut()`. This is the correct contract per Codex R1 C1: `getUser()` already cryptographically validated the session, so the user holds a real session and a transient profile-lookup blip should not destroy it. Forged cookies are caught upstream by the `error || !user` branch BEFORE we get to the profile lookup, so the no-signOut decision here doesn't weaken the forged-cookie defense.

**PII handling:**
- Sentry capture is identical to the fence: profileError + 2 tags, no PII in tags.
- The `redirect()` calls use static paths (`/login?reason=session_expired&redirect_to=%2Fonboarding`, `/dashboard`). The query string carries no user-specific data — `reason=session_expired` and `redirect_to=%2Fonboarding` are both static literals. No session metadata, no token fragments, no email. URL-encoded `%2Fonboarding` is `/onboarding`. Clean.

**Issues:** none.

### Test files

**Integration tests (3 files):**
- `dashboard-orphan-profile.test.ts`, `dashboard-page-onboarding-guard.test.ts`, `onboarding-page-profile-lookup.test.ts` — assertions re-aligned to match the new contract (throw vs. redirect on non-PGRST116 errors). The mocked error code `42501` (PostgreSQL `permission denied` for RLS denial) correctly exercises the non-PGRST116 path. Tests verify:
  - Throw happens with the expected message
  - No `/onboarding` redirect occurs
  - `signOut()` is NOT called (session preserved)
  - Sentry capture is invoked with the underlying error
- All assertions are observability-positive — they prevent regressions to either the silent-render bug (old contract) or the boot-the-user bug (alternative wrong fix).

**E2E tests (5 files):**
- `auth-forged-cookie.spec.ts` — adds `waitForURL` race for the RSC-redirect timing issue; preserves the substantive assertion that forged tokens land on `/login`. Verified to still test the security contract.
- `library-{single,bulk}-delete-undo.spec.ts` — replaces `waitForTimeout(500)` with `waitForResponse(...)` for the undo POST. Pure reliability fix, no security surface.
- `onboarding-completion.spec.ts` — adds outcome-tracking + `afterAll` hook + `waitForOnboardingReady` helper. The afterAll logs to stderr if 100% of tests skipped via the login-redirect path. This is a defense-in-depth signal so a future auth-guard regression that breaks the forged-cookie acceptance path doesn't silently green the suite. The skip behavior is honest about its limitation (forged cookies + real Supabase = expected skip until F-TEST-4).
- `reduced-motion.spec.ts` — visual-regression baseline updates only. No security surface.

**Issues:** none.

## Cross-cutting checks

| Check | Result |
|---|---|
| Input validation weakened? | No — the lookup_error branch is narrowed, not widened. Malformed profile data still cannot enter the OK path because `runFence()` requires `data` truthy. |
| AuthN/Z change? | Yes — narrowed the `/onboarding` redirect to PGRST116-only. Strictly tighter than before. Forged cookies still caught at `unauthenticated` branch upstream. |
| New PII in logs? | No — Sentry tags and contexts only carry `user_id_hash`, route, op, source. No email, name, raw UUID, or token. |
| New injection vectors? | No string concatenation into queries / commands / templates introduced. |
| Secret leakage? | No — redirect URLs are static literals. ProfileLookupError thrown to Next's error boundary; production renders generic 500. |
| XSS / CSRF? | No HTML rendering of user input added. Onboarding page still uses Server Components + Server Actions (built-in CSRF). The throw path goes to Next's error boundary, not to a user-rendered string. |
| Race conditions (security-relevant)? | No — `waitForResponse` and `afterAll` changes are purely test-side. The production code path is unchanged in concurrency model. |
| Error message disclosure? | `ProfileLookupError` message is `'profile lookup failed'` (fence) or `'profile lookup failed during onboarding render'` (page). Neither contains user IDs, emails, or DB internals. The `cause` propagates but Next 16's default production error boundary does not render it. |

## Verdict
clean
