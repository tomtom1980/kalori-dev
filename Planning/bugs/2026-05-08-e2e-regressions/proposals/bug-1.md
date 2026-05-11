# Bug 1 — `tests/e2e/auth-forged-cookie.spec.ts` C1-B regression guard (2 failing tests)

## Classification

**`known_fix`** — root cause obvious, two-line revert-and-narrow inside the fence + companion narrowing in onboarding page; safe; covered by existing spec.

## Root Cause

The C1-B regression guard relies on the contract: a forged session cookie reaching an authed RSC page MUST redirect to `/login?...&redirect_to=...`. Two recent commits silently broke that contract:

1. **`600eddf` (B.SWEEP, 2026-05-08)** — `lib/auth/orphan-profile-fence.ts:254-267`. The `lookup_error` branch of `requireProfileOrRedirect` was changed from `throw new ProfileLookupError(...)` to `redirect('/onboarding')`. The intent was F-PROFILE-LOOKUP-MISSING-ROW self-heal: a real, transient profile-row miss should send the user to onboarding (which re-inserts on submit) rather than crash. But this branch fires whenever the SELECT returns ANY error — including the RLS/auth errors a forged cookie produces downstream of `getUser()`'s validation.
2. **`d2e287c` (2026-05-01)** — `app/(app)/onboarding/page.tsx:75-87`. The onboarding page's inline `if (profileError)` was changed from `throw new Error('profile_lookup_failed')` to `Sentry.captureException(...) + continue with profile=null`. Same intent (avoid hard fail) but identical regression: a forged-cookie-induced RLS error now silently lets the wizard render.

Combined effect for the spec:

- **`/dashboard` test (line 118):** `getUser()` may return a transient/network rejection of the forged token → `runFence` returns `kind: 'unauthenticated'` (which still redirects to `/login` correctly) ✓ — OR `getUser()` happens to return a user from the forged JWT body, the profile SELECT throws an RLS error, `runFence` returns `kind: 'lookup_error'` → `redirect('/onboarding')`. Either path violates the test's "must reach `/login`" assertion. Actual observed final URL is `/dashboard`, which strongly suggests the page is rendering (kind: 'ok' from RLS-permissive read OR downstream throw caught by Next's error boundary preserving URL).
- **`/onboarding` test (line 133):** Onboarding page uses inline auth+profile check (NOT the fence). With forged cookie, `getUser()` either rejects (→ correct `/login` redirect) OR returns a fake user → profile error → silent swallow → renders WizardShell at `/onboarding`. Actual observed final URL is `/onboarding`, confirming the silent-swallow path.

The B.SWEEP commit message explicitly notes "5 pre-existing E2E regressions deferred to followups.md" — and `followups.md:1528-1537` already records this exact failure with diagnosis ("Phase A.3 fence-interaction regression"). The fix direction is documented; no fresh investigation needed.

## Proposed Change

Two-file, surgically narrow change. Preserve the F-PROFILE-LOOKUP-MISSING-ROW self-heal intent (genuine missing-row → onboarding) while restoring the C1-B contract (forged/invalid auth → `/login`):

### File 1 — `lib/auth/orphan-profile-fence.ts` (edit lines 254-267)

Distinguish "no row exists" (PostgREST `PGRST116` or `code === 'PGRST116'` / equivalent) from "RLS denied / DB error / network blip." The B.SWEEP self-heal applies ONLY to the former.

```ts
if (result.kind === 'lookup_error') {
  captureLookupError({
    error: result.error,
    anonymizedUserId: result.anonymizedUserId,
    route: opts.route,
  });
  // F-PROFILE-LOOKUP-MISSING-ROW: only redirect to onboarding for the
  // narrow "no row" case (PostgREST PGRST116 or maybeSingle-with-empty
  // semantics). RLS denials, network blips, and crypto-validation
  // failures must NOT silently land the user in onboarding (C1-B
  // forged-cookie contract).
  const errCode = (result.error as { code?: string } | null)?.code;
  if (errCode === 'PGRST116') {
    redirect('/onboarding');
  }
  // All other errors propagate to Next's error boundary (original
  // pre-B.SWEEP contract) so authed-but-broken sessions surface in
  // Sentry and forged-cookie tokens trip the unauthenticated branch
  // upstream rather than masquerading as orphans.
  throw new ProfileLookupError('profile lookup failed', result.error);
}
```

Note: with `.maybeSingle()`, a truly-missing row returns `data: null, error: null` (already handled by the `kind: 'orphan'` branch at line 269). So `lookup_error` here is exclusively NOT-the-missing-row case in practice — the narrowed condition above is a defense-in-depth check, and the dominant fallback is `throw ProfileLookupError` (which restores the pre-B.SWEEP contract). The B.SWEEP commit's stated motivation ("missing row triggers transient lookup_error") was likely a misdiagnosis — `maybeSingle` already handles missing rows via the `orphan` branch.

### File 2 — `app/(app)/onboarding/page.tsx` (edit lines 75-87)

Restore the fail-closed behavior for `profileError`, but keep the comment about loop avoidance accurate. Onboarding cannot redirect to itself, but it CAN redirect to `/login` when the auth context is suspect.

```ts
if (profileError) {
  // F-PROFILE-LOOKUP-MISSING-ROW + C1-B regression guard: an error
  // here means the auth context is suspect (forged cookie reaching
  // RLS) OR a real DB blip. Either way, do NOT silently render the
  // wizard — that masks forged-cookie traffic AND silently re-opens
  // onboarding for already-completed users on transient errors. Sign
  // out best-effort and bounce to /login so the user starts fresh.
  Sentry.captureException(profileError, {
    tags: { source: 'profile_lookup_guard', page: 'onboarding' },
  });
  try {
    await supabase.auth.signOut();
  } catch {
    // best-effort
  }
  redirect('/login?reason=session_expired&redirect_to=%2Fonboarding');
}
```

This mirrors the pattern already used a few lines above for the `error || !user` case (lines 55-64).

## Files Affected

- `lib/auth/orphan-profile-fence.ts` (1 hunk, ~10 lines)
- `app/(app)/onboarding/page.tsx` (1 hunk, ~10 lines)

**Count: 2 production files. Test file is not modified.**

## TDD Required

**Yes** (logic change in shared auth surface). The existing `tests/e2e/auth-forged-cookie.spec.ts` IS the failing test that the fix must turn green — that satisfies TDD's red→green requirement without writing a new test. Sub-agent should:

1. Confirm both lines (118 + 133) currently fail (red — already verified above).
2. Apply the fix.
3. Re-run only this spec to confirm both assertions pass (green).

Additionally, sub-agent should run any vitest unit tests that exercise `requireProfileOrRedirect`'s `lookup_error` branch (search: `grep -r "lookup_error\|ProfileLookupError" tests/`) to ensure the throw-restoration doesn't break the 5 vitest tests that B.SWEEP's commit message claims are GREEN under the redirect behavior.

## Test Approach

- Existing `tests/e2e/auth-forged-cookie.spec.ts` is the regression guard.
- Existing vitest tests under `tests/unit/lib/auth/orphan-profile-fence.*` (if present) — verify `lookup_error` paths still match expectations or update minimally per surgical-changes principle. The sub-agent should grep first; if vitest contracts assume `redirect('/onboarding')` on `lookup_error`, they were aligned to B.SWEEP and must be re-aligned to the C1-B contract (likely `expect(() => fence(...)).toThrow(ProfileLookupError)` for non-PGRST116 errors).
- No new tests needed.

## Risk

**Medium.** The fix touches shared auth code (`lib/auth/orphan-profile-fence.ts`) used by 6 page handlers (`dashboard`, `weight`, `settings`, `log`, `progress`, `library`). Restoring the throw means downstream pages will once again surface a Next error boundary on transient profile-lookup errors instead of redirecting to onboarding. This is the original contract pre-B.SWEEP; vitest contracts and 5 B.SWEEP-aligned tests must be re-checked.

The narrow PGRST116 branch is preserved as a safety valve for the genuine "missing row" case, though `.maybeSingle()` makes that branch effectively dead code (orphan branch handles it). Acceptable; defense-in-depth.

R1 firewall files (`refresh-interceptor.ts`, `cross-tab-signout.ts`, `authFetch.ts`, `ConfirmationScreen.tsx`) are NOT touched.

## Regression Sweep Needed

- `tests/e2e/auth-forged-cookie.spec.ts` — must turn green (target spec).
- All vitest tests matching `requireProfileOrRedirect|orphan-profile-fence|lookup_error|ProfileLookupError` — must continue passing OR be re-aligned if they were tightened to B.SWEEP semantics.
- E2E specs that exercise onboarding under valid auth — must continue passing (forged-cookie path is the only bug; valid-auth path through onboarding is unchanged).
- `pnpm exec playwright test tests/e2e/onboarding-*.spec.ts` (if present) — sanity check for valid-auth onboarding still working.

## UI Touching

**No.** No CSS, no component shape changes, no design tokens. Pure server-side redirect contract restoration.

## Open Questions

1. **Do any vitest tests assert `redirect('/onboarding')` on `lookup_error`?** If yes, they were tightened to B.SWEEP's behavior at `600eddf` and need re-alignment as part of this fix. The sub-agent should grep first and either:
   - Re-align expectations to `toThrow(ProfileLookupError)` for non-PGRST116 errors (preferred — matches restored contract), OR
   - Add a test for the PGRST116-narrow redirect path if it's exercised in production.

2. **Should the dashboard test's expected redirect target be `/login?reason=session_expired&redirect_to=%2Fdashboard` exactly?** The current spec asserts `toContain('/login')` and `toContain('redirect_to')` — both will be satisfied by the proposed `unauthenticated` and `lookup_error→throw→Next-error-boundary` paths IF middleware-side redirect to `/login` fires. Confirm via headed run after fix.

3. **The `getUser()` return value for forged tokens** — out of scope for this bug, but if `getUser()` is silently returning a fake user from the forged JWT body (skipping the `/auth/v1/user` network validation), that's a separate, more serious C1-B integrity issue that should be filed as a security followup. Sub-agent should NOT investigate further as part of this bug — surface as open question only.
