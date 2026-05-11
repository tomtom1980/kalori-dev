/**
 * `/onboarding` — Task 2.2 8-step wizard entrypoint.
 *
 * RSC auth guard (preserved verbatim from Task 2.1e, per R1 Round 3):
 *   - `supabase.auth.getUser()` cryptographically validates the access
 *     token against Supabase (never `getSession()`). Forged cookies
 *     fail here even if middleware's cookie-shape check let them pass.
 *   - On rejection: best-effort `signOut()` + redirect to
 *     `/login?reason=session_expired&redirect_to=/onboarding`.
 *
 * Task 2.2 addition (architecture §11):
 *   - After auth succeeds, SELECT `onboarding_completed_at` from
 *     `profiles`. If non-null, the user has already onboarded —
 *     `redirect('/dashboard')` to prevent returning to the wizard.
 *     RLS gates the SELECT to the user's own row.
 *
 * Phase 2 Codex R1 F2: profile lookup errors no longer silently re-open
 * the wizard. Three states distinguished explicitly:
 *   1. `error != null` (DB/RLS failure or transient blip) — throw a
 *      typed `ProfileLookupError` so Next's error boundary catches it.
 *      Do NOT signOut: auth has already cryptographically validated via
 *      getUser(), so the user holds a real session and a transient
 *      profile-lookup blip should not destroy it (Codex R1 C1).
 *   2. `data == null` AND no error (row truly doesn't exist) — render
 *      the wizard (the intended not-onboarded path).
 *   3. `data.onboarding_completed_at` truthy — redirect to /dashboard.
 *
 * The wizard body is a `<WizardShell />` client component; all state
 * lives in `useOnboardingStore`. This page passes no props — the
 * client hydrates from sessionStorage on mount.
 *
 * `dynamic = 'force-dynamic'` (Task 2.4 Phase 2 Testing Sweep fix):
 *   Same reasoning as `/dashboard` — the RSC auth guard calls
 *   `getServerSupabase()` + `auth.getUser()` and the follow-up profile
 *   SELECT both require a real per-request cookie context. Static
 *   prerender at `next build` time would hit the Supabase client factory
 *   with empty env vars (the build job intentionally omits Supabase
 *   secrets so prerendered HTML can never leak test credentials), so
 *   this route must render on each request.
 */
import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';

import { ProfileLookupError } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';

import { WizardShell } from './_components/WizardShell';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // Best-effort sign-out — avoids an infinite onboarding↔login bounce
    // when a stale-but-shape-valid cookie reaches this page.
    try {
      await supabase.auth.signOut();
    } catch {
      // swallow — the redirect below is the safety net.
    }
    redirect('/login?reason=session_expired&redirect_to=%2Fonboarding');
  }

  // Redirect-if-already-onboarded: a returning user with
  // `onboarding_completed_at` set should bypass the wizard entirely.
  // RLS restricts this SELECT to `auth.uid() = id`.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    // Codex R1 C1: getUser() above already cryptographically validated
    // the session against Supabase, so we hold a real authenticated
    // user. A profile-lookup error after that point means a transient
    // DB/RLS blip — destroying the session via signOut+redirect would
    // boot a valid user mid-wizard. Throw a typed ProfileLookupError so
    // Next's error boundary surfaces a recoverable error page. Forged
    // cookies are caught upstream by the `error || !user` branch above
    // (and by middleware), not by this branch.
    Sentry.captureException(profileError, {
      tags: { source: 'profile_lookup_guard', page: 'onboarding' },
    });
    throw new ProfileLookupError('profile lookup failed during onboarding render', profileError);
  }

  if (profile?.onboarding_completed_at) {
    redirect('/dashboard');
  }

  return <WizardShell />;
}
