/**
 * E2E smoke for the F-TEST-4 real-user auth fixture (Task 4.1 sub-step 0).
 *
 * Scope per reconciled spec §11.4:
 *   "Just the fixture + one smoke spec verifying the fixture signs in a real
 *    user and the authed page can load /dashboard without a login redirect."
 *
 * What this spec asserts:
 *   1. `authedPage` fixture produces a Playwright Page that is already signed
 *      in as a real Supabase user seeded against `kalori-dev`.
 *   2. Navigating that page to `/dashboard` resolves to `/dashboard` — NOT
 *      to `/login` (which is what middleware would do for an unauth'd hit)
 *      and NOT to `/onboarding` (which the dashboard RSC redirects to when
 *      `profiles.onboarding_completed_at IS NULL`). The fixture must seed an
 *      onboarded profile so the dashboard RSC renders.
 *   3. A signed-in artifact is visible on the rendered dashboard — we look
 *      for the sign-out button which the authed nav shell exposes and
 *      unauthenticated routes do not.
 *
 * Fixture teardown responsibility:
 *   The fixture's per-test teardown deletes the auth.users row via the
 *   Supabase Admin API; that cascade-deletes `profiles` via the FK in
 *   `0002_profiles.sql`. No test-side cleanup needed here.
 *
 * Coverage boundary (vs. `tests/e2e/helpers/auth-session.ts`):
 *   The existing `seedAuthSession` helper forges a cookie + intercepts
 *   browser-originated `/auth/v1/user` calls. It does NOT work for routes
 *   that server-validate via `supabase.auth.getUser()` because that call
 *   runs in the Next Node process, out of reach of the browser context's
 *   route table. THIS fixture uses a real Supabase session so both cookie-
 *   shape middleware checks AND server-side `getUser()` validation pass.
 */
import { expect } from '@playwright/test';

import { test } from './fixtures/auth';

test.describe('auth fixture · F-TEST-4', () => {
  test('authedPage lands on /dashboard without redirect (real Supabase session)', async ({
    authedPage,
  }) => {
    await authedPage.goto('/dashboard');

    // URL must settle on /dashboard — NOT /login (unauth) and NOT /onboarding
    // (profile row without onboarding_completed_at).
    await expect(authedPage).toHaveURL(/\/dashboard(?:\?.*)?$/);

    // Something that exists only when signed-in must render. The authed nav
    // shell exposes a sign-out affordance; the login/marketing surfaces do
    // not. Using a role-based locator keeps this robust to minor copy tweaks.
    await expect(authedPage.getByRole('button', { name: /sign[- ]?out/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
