# C1 fix — app/(app)/onboarding/page.tsx

## Change applied

Replaced the profileError branch's "best-effort signOut + redirect to /login" with a typed `ProfileLookupError` throw, so a transient profile-lookup error (PostgREST blip, RLS deploy, network) no longer destroys a valid user's session mid-wizard.

Diff summary:

- `app/(app)/onboarding/page.tsx`
  - Added import: `import { ProfileLookupError } from '@/lib/auth/orphan-profile-fence';`
  - Updated module JSDoc state-3 description to reflect the throw-contract (no signOut, no redirect)
  - Replaced the profileError block (lines 75-91 previously) with:
    ```ts
    if (profileError) {
      Sentry.captureException(profileError, {
        tags: { source: 'profile_lookup_guard', page: 'onboarding' },
      });
      throw new ProfileLookupError(
        'profile lookup failed during onboarding render',
        profileError,
      );
    }
    ```
  - Comment cites Codex R1 C1 and explains why session must be preserved (getUser already cryptographically validated upstream; forged cookies are caught by the `error || !user` branch on getUser()).

The `error || !user` branch on `getUser()` is unchanged — that still does signOut + redirect, which is correct because that branch is reached when auth itself failed (forged cookie, expired token, etc.).

## Test re-alignments

- `tests/integration/onboarding-page-profile-lookup.test.ts`
  - Updated module-level JSDoc to document the new throw-contract for state 3
  - Renamed test 1 from "fails closed: signOut + redirect" to "throws ProfileLookupError, preserving the session (Codex R1 C1)"
  - Test now asserts:
    - `await expect(invokePage()).rejects.toThrow(/profile lookup failed/i)` (the ProfileLookupError message)
    - `expect(mocks.signOut).not.toHaveBeenCalled()` — session preserved
    - `expect(mocks.redirect).not.toHaveBeenCalled()` — error boundary handles it
  - Tests 2 (data=null renders wizard) and 3 (onboarding_completed_at redirects to /dashboard) unchanged.

## Verification

- Integration tests (`tests/integration/onboarding-page-profile-lookup.test.ts`): **PASS** — 3/3 tests green
- E2E `auth-forged-cookie.spec.ts` (chromium): **PASS** — 2/2 tests green, both /dashboard and /onboarding forged-cookie scenarios still land on /login with redirect_to
- Typecheck (`pnpm typecheck`): **PASS** — no errors

## Notes

The E2E test required no adjustment. Forged cookies are caught by the upstream `getUser()` validation (the `error || !user` branch with signOut+redirect to /login) BEFORE reaching the profile lookup. This means:

1. The original Bug 1 concern ("forged-cookie traffic silently rendering the wizard") was not actually mitigated by the profileError branch — it was already mitigated by the getUser() branch. The previous signOut+redirect on profileError was redundant for forged-cookie defense.
2. The C1 fix correctly narrows the scope: profileError only triggers for genuinely-authenticated users hitting transient DB/RLS issues, where session destruction would be user-hostile.
3. Forged-cookie defense remains intact via three layers: middleware cookie validation → page-level getUser() crypto validation → (newly recoverable) profile lookup error boundary.
