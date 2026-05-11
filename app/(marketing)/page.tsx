/**
 * (marketing)/page.tsx — root `/` contract (Task B.1 / US-STAB-B1).
 *
 * Contract:
 *   - Authenticated visitor → server-side `redirect('/dashboard')`. The
 *     dashboard's own onboarding guard handles the wizard split if
 *     `onboarding_completed_at` is null.
 *   - Anonymous visitor (or auth-error visitor — fail-closed by treating
 *     like anon, NEVER expose authed-only routes) → render
 *     `<MarketingLanding deleted={...} />` inline. NO redirect call.
 *
 * `?deleted=1` handling:
 *   - Authed branch forwards the flag through to `/dashboard?deleted=1` so
 *     the dashboard surface can acknowledge a recently-deleted-account
 *     redirect (rare — auth has typically been revoked by then).
 *   - Anon branch passes the boolean to the landing component, which
 *     renders the account-deletion success banner inline above the
 *     wordmark. AccountDeleteFlow lands the browser on `/?deleted=1` after
 *     the cascade succeeds; the banner here is the user-visible confirmation.
 *   - Any other `deleted` value (e.g. `deleted=other`) is treated as
 *     `false` and the banner is omitted from the DOM entirely.
 *
 * `/` is in `lib/auth/public-routes.ts` so the middleware doesn't bounce
 * the request before we can decide.
 */
import { redirect } from 'next/navigation';

import { MarketingLanding } from '@/components/marketing/MarketingLanding';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface MarketingLandingPageProps {
  searchParams?: Promise<{ deleted?: string | string[] }>;
}

export default async function MarketingLandingPage({
  searchParams,
}: MarketingLandingPageProps = {}) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const resolved = (await searchParams) ?? {};
  const rawDeleted = Array.isArray(resolved.deleted) ? resolved.deleted[0] : resolved.deleted;
  const deleted = rawDeleted === '1';

  if (!error && user) {
    redirect(deleted ? '/dashboard?deleted=1' : '/dashboard');
  }

  // Anon branch (and auth-error branch — fail-closed but render-anon, since
  // the alternative is a `/login` redirect that itself reads `getUser()` and
  // could ping-pong under transient outages).
  return <MarketingLanding deleted={deleted} />;
}
