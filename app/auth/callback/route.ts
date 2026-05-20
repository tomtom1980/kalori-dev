/**
 * `GET /auth/callback` — OAuth / magic-link redirect handler (Task 2.1c).
 *
 * Flow:
 *   1. Supabase (magic-link email OR Google OAuth) redirects here with `?code=…`.
 *   2. We exchange the code for a session via the SSR server client
 *      (`supabase.auth.exchangeCodeForSession(code)`), which writes the
 *      session cookies on the outgoing response.
 *   3. We then look up the user's `profiles.onboarding_completed_at` to
 *      decide where to land them:
 *        - row missing / `onboarding_completed_at IS NULL` → `/onboarding`
 *        - row present + completed              → `/dashboard`
 *   4. If an explicit `redirect_to` param was preserved across the OAuth
 *      round-trip, we respect it ONLY when the user has already completed
 *      onboarding. New users always start at `/onboarding` to avoid
 *      landing them on a surface that needs profile data.
 *
 * Error modes:
 *   - missing `code`                        → `/login?error=callback`
 *   - `exchangeCodeForSession` fails        → `/login?error=callback`
 *   - profile lookup returns an error       → `/login?error=profile_lookup_failed`
 *                                              (Phase 2 Codex R1 F2: DB/RLS errors
 *                                              must NOT silently bounce an
 *                                              already-onboarded user back into
 *                                              the wizard — which is what happened
 *                                              when we ignored `maybeSingle()` error)
 *   - profile lookup throws (network)       → same: `/login?error=profile_lookup_failed`
 *
 * Public route — middleware lets this through even when unauthenticated so
 * the code exchange can run. Every error surface explicitly reports to
 * Sentry (captureException with route + auth_flow tags) so production
 * magic-link / OAuth regressions are observable — historically this route
 * swallowed errors and a PKCE code_verifier cookie mismatch produced zero
 * Sentry events.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

import { safeRedirectTarget } from '@/lib/auth/safe-redirect';
import { getServerSupabase } from '@/lib/supabase/server';

/**
 * HEAD handler — prefetch defense.
 *
 * Email link scanners (Gmail, Facebook, Microsoft Defender, anti-phishing
 * services) send HEAD requests to validate magic-link URLs before delivery
 * or on link preview. If we let those requests fall through to the GET
 * handler, Next.js would execute the full verifyOtp/exchangeCodeForSession
 * flow, which consumes the one-time token. When the real user then clicks
 * (GET), the token is gone → "invalid or expired".
 *
 * Returning 200 with no body and zero side effects satisfies the prefetcher
 * without consuming the token. The user's real click (GET) still triggers
 * verification normally.
 *
 * Takes no arguments — the response is deterministic regardless of query
 * params or headers. Next.js will pass a Request when invoking; JS drops
 * the extra arg.
 */
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const redirectParam = safeRedirectTarget(url.searchParams.get('redirect_to'));
  const ua = request.headers.get('user-agent');
  const referer = request.headers.get('referer');

  if (!code) {
    Sentry.captureMessage('auth/callback hit without ?code parameter', {
      level: 'warning',
      tags: { route: 'auth/callback', auth_flow: 'oauth_or_pkce' },
      extra: { ua, referer },
    });
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const supabase = await getServerSupabase();

  const { data: exchangeData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    Sentry.captureException(exchangeError, {
      tags: { route: 'auth/callback', auth_flow: 'oauth_or_pkce' },
      extra: { code_present: true, ua },
    });
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }
  if (!exchangeData.session) {
    // PKCE / OAuth edge case: Supabase returns no error but a null session
    // (e.g. the code_verifier cookie was missing). Synthesize an Error so
    // the Sentry alert fires — silent failure here is what hid the recent
    // prod regression.
    Sentry.captureException(
      new Error('auth/callback: exchangeCodeForSession returned null session without error'),
      {
        tags: { route: 'auth/callback', auth_flow: 'oauth_or_pkce' },
        extra: { code_present: true, ua },
      },
    );
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const sessionUser = exchangeData.session.user;
  const userId = sessionUser.id;

  // Happy path so far — attribute subsequent Sentry events in this request
  // context to the authenticated user. Omit `email` rather than set it to
  // `undefined` because Sentry's `User` type rejects explicit `undefined`
  // under `exactOptionalPropertyTypes: true`.
  Sentry.setUser(
    sessionUser.email !== undefined ? { id: userId, email: sessionUser.email } : { id: userId },
  );

  // Look up onboarding completion to pick the right landing surface.
  //
  // Phase 2 Codex R1 F2: distinguish three states explicitly — previously
  // the ignored `maybeSingle()` error made a transient DB/RLS failure look
  // like "not onboarded" and bounced already-onboarded users back into the
  // wizard. The new contract:
  //   1. `error != null` (DB/RLS failure) → /login?error=profile_lookup_failed.
  //   2. `data == null` AND no error (row truly doesn't exist) → /onboarding.
  //   3. `data.onboarding_completed_at` truthy → /dashboard (or redirectParam).
  let profile: { onboarding_completed_at: string | null } | null = null;
  try {
    const { data, error: lookupError } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle();
    if (lookupError) {
      Sentry.captureException(lookupError, {
        tags: { route: 'auth/callback', auth_flow: 'profile_lookup' },
        extra: { ua },
      });
      return NextResponse.redirect(new URL('/login?error=profile_lookup_failed', request.url));
    }
    profile = data;
  } catch (err) {
    // Network / connection failure — same fallback as an explicit lookup
    // error. Do NOT silently treat as onboarded or not-onboarded.
    Sentry.captureException(err, {
      tags: { route: 'auth/callback', auth_flow: 'profile_lookup' },
      extra: { ua },
    });
    return NextResponse.redirect(new URL('/login?error=profile_lookup_failed', request.url));
  }

  if (!profile?.onboarding_completed_at) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  const destination = redirectParam ?? '/dashboard';
  return NextResponse.redirect(new URL(destination, request.url));
}
