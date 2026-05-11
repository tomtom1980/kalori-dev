# Bug 1 — Implementation Output

## Files Touched

- `lib/auth/orphan-profile-fence.ts` (lines ~254-274) — Fix 1: revert
  `lookup_error` redirect to throw `ProfileLookupError`, with narrow
  PGRST116 carveout for the genuine missing-row case.
- `app/(app)/onboarding/page.tsx` (lines ~75-91) — Fix 2: replace silent
  Sentry-log-and-continue on `profileError` with fail-closed
  `signOut + redirect('/login?reason=session_expired&redirect_to=%2Fonboarding')`.
- `tests/integration/onboarding-page-profile-lookup.test.ts` (lines ~1-17,
  ~92-110) — Re-aligned docstring + first test case (`code: '42501'`) from
  "no redirect, renders wizard" to fail-closed contract assertion.
- `tests/integration/dashboard-orphan-profile.test.ts` — re-aligned by
  prior sub-agent (verified passing this session).
- `tests/integration/dashboard-page-onboarding-guard.test.ts` — re-aligned
  by prior sub-agent (line 196 expects `'profile lookup failed'` throw;
  verified passing this session).
- `tests/e2e/auth-forged-cookie.spec.ts` (lines ~117-150) — Replaced
  synchronous `expect(page.url()).toContain('/login')` with
  `await page.waitForURL(/\/login\?.*redirect_to=/, { timeout: 5000 })`
  on both tests. Production-side redirect contract is correct; the
  failure was a Next 16 RSC-redirect timing quirk where `page.goto()`
  resolves before the client-side router commits the `/login` URL. The
  redirect verifiably lands at
  `http://localhost:3000/login?reason=session_expired&redirect_to=%2Fdashboard`
  after ~ms (verified via probe spec).

## Tests Added/Modified

No new tests. Re-aligned existing:

- `tests/integration/onboarding-page-profile-lookup.test.ts` — first
  test now asserts `signOut()` called + `redirect('/login?...')` invoked
  (instead of "no redirect"). Two other tests (true row-missing,
  already-onboarded) unchanged.
- `tests/e2e/auth-forged-cookie.spec.ts` — both tests now use
  `page.waitForURL` to handle Next 16 RSC-redirect timing.

## Test Run Result

- **E2E `tests/e2e/auth-forged-cookie.spec.ts`** (chromium): 2/2 PASS
  (6.1s).
- **Vitest re-aligned integration tests** (5 files):
  - `tests/integration/dashboard-orphan-profile.test.ts`: PASS
  - `tests/integration/dashboard-page-onboarding-guard.test.ts`: PASS
  - `tests/integration/progress-page-profile-lookup-guard.test.ts`: PASS
  - `tests/integration/weight-page-profile-lookup-guard.test.ts`: PASS
  - `tests/integration/onboarding-page-profile-lookup.test.ts`: PASS
  - **Total: 5 files, 36/36 tests PASS** (4.30s).
- **Vitest unit suite** (`tests/unit`): 98 files, 801/801 tests PASS
  (74.51s) — baseline preserved.
- **Typecheck** (`pnpm typecheck` → `tsc --noEmit`): clean (no errors).

## Deviations from Proposal

1. **Spec file modification (`tests/e2e/auth-forged-cookie.spec.ts`).**
   The proposal said "test file is not modified" and the section "Files
   Affected" listed only the 2 production files. After applying Fix 1 +
   Fix 2 the production-side redirect contract was correct (verified via
   a temporary probe spec — `page.url()` after a 1s wait reads
   `http://localhost:3000/login?reason=session_expired&redirect_to=%2Fdashboard`),
   but the spec's synchronous `expect(page.url()).toContain('/login')`
   ran BEFORE the client-side router committed the new URL — a Next 16
   RSC-redirect quirk, not a contract failure. Replaced two sync
   `expect(page.url())` lines with `await page.waitForURL(...)` to wait
   for the URL commit. Surgical change, asserts the same contract; the
   open question #2 from the proposal explicitly anticipated this kind
   of post-fix timing alignment.

   No production behavior change — only the spec's reading of when
   `page.url()` reflects the redirected URL.

## Status

**implemented**

## Notes

- Onboarding page contract update means a transient profile-lookup error
  (e.g., RLS denial, network blip) now signs the user out + bounces to
  `/login` instead of silently rendering the wizard. This trades some
  user-friction-on-transient-errors for closing the C1-B forged-cookie
  bypass. Acceptable per proposal Risk section.
- PGRST116 narrow carveout in `requireProfileOrRedirect` is preserved as
  defense-in-depth, even though `.maybeSingle()` already routes the
  missing-row case through the `orphan` branch (the `kind: 'orphan'`
  result above the `lookup_error` block). Dead code in practice; kept
  for documentation / future-proofing.
- Open Question #3 in the proposal (whether `getUser()` is silently
  returning a fake user from forged JWT body) — investigated by probe
  spec. Confirmed: the redirect TO `/login?reason=session_expired&...`
  fires within ~ms of the dashboard `goto`, meaning `getUser()` IS
  rejecting the forged token and `runFence` returns
  `kind: 'unauthenticated'` (which calls `redirect` directly). NOT a
  C1-B integrity issue. No security followup needed.
- R1 firewall files untouched: `lib/auth/refresh-interceptor.ts`,
  `lib/auth/cross-tab-signout.ts`, `lib/auth/authFetch.ts`,
  `app/(app)/log/_components/ConfirmationScreen.tsx`.
- No commits made (per finisher hard rules).
