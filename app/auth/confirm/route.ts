/**
 * `GET /auth/confirm` — hybrid magic-link verification handler.
 *
 * Companion to `/auth/callback`. The PKCE flow in `callback.ts` requires the
 * `code_verifier` cookie set by the browser that initiated `signInWithOtp`.
 * When the user clicks the magic link in a different browser context — e.g.
 * requested from the Facebook Messenger in-app browser, clicked the link in
 * Gmail — the cookie is missing and the exchange fails silently.
 *
 * This route prefers `verifyOtp({ type, token_hash })` (PKCE-free, cross-
 * browser-safe). The Supabase email template points users here via
 * `?token_hash=...&type=email`, so cross-browser clicks Just Work.
 *
 * Hybrid fallback (Codex R2 F1) — to survive rollout / template-flip races
 * where an old-template link arrives at `/auth/confirm?code=...` (the PKCE
 * shape), the route ALSO accepts `?code=...` and falls back to
 * `exchangeCodeForSession(code)`. token_hash wins when both shapes are
 * present (newer, safer). The canonical `/auth/callback` route is left
 * UNCHANGED — it continues to serve OAuth + any in-flight legacy magic-links
 * pointing at `/auth/callback` until they expire.
 *
 * OTP-type guard (Codex R2 F3) — accepts ONLY `email` + `magiclink`.
 * `recovery`, `invite`, `signup`, `email_change` have different post-verify
 * semantics (password reset, invitation, etc.) and must NOT silently mint a
 * normal sign-in session via this route, even if a future template misroutes
 * them here. They are rejected with the same warning capture as missing
 * params, so misrouting is observable in Sentry.
 *
 * Mirrors the callback route's post-verification flow:
 *   - missing token_hash AND missing code     → /login?error=callback (warning breadcrumb)
 *   - token_hash present but type missing/bad → /login?error=callback (warning breadcrumb)
 *   - verify path (token_hash) fails          → /login?error=callback (captureException, auth_flow=magic_link)
 *   - exchange path (code) fails              → /login?error=callback (captureException, auth_flow=pkce_fallback)
 *   - profile lookup throws / errors          → /login?error=profile_lookup_failed (captureException)
 *   - success + null onboarding_completed_at  → /onboarding
 *   - success + onboarding ts                 → /dashboard (or safe ?next override)
 *
 * Sentry capture is mandatory on the failure paths because this route is the
 * production fix for a real cross-browser auth failure — without telemetry we
 * cannot tell expired tokens from template misconfiguration from a brand-new
 * provider regression.
 *
 * Public route — middleware lets this through unauthenticated so verification
 * can run.
 */
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type { EmailOtpType, User } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase/server';
import { safeRedirectTarget } from '@/lib/auth/safe-redirect';

// Restricted type guard (Codex R2 F3): only the two OTP types our current
// magic-link flow legitimately produces. Anything else is rejected — if a
// future Supabase template misroutes `recovery` (password reset) or `invite`
// here, this guard prevents the route from silently completing the session as
// a normal sign-in and bouncing the user to `/onboarding` or `/dashboard`.
const ACCEPTED_EMAIL_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  'email',
  'magiclink',
]);

function isAcceptedEmailOtpType(value: string): value is EmailOtpType {
  return ACCEPTED_EMAIL_OTP_TYPES.has(value as EmailOtpType);
}

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
  const tokenHash = url.searchParams.get('token_hash');
  const rawType = url.searchParams.get('type');
  const code = url.searchParams.get('code');
  const nextParam = safeRedirectTarget(url.searchParams.get('next'));
  const ua = request.headers.get('user-agent');

  // Decide which exchange path to use:
  //   1. token_hash + valid type  → verifyOtp (preferred)
  //   2. code (no token_hash)     → exchangeCodeForSession (PKCE fallback)
  //   3. neither usable           → /login?error=callback (warning)
  //
  // If BOTH token_hash AND code are present, token_hash wins — newer/safer
  // shape per Codex R2 F1.
  const canVerifyOtp = !!tokenHash && !!rawType && isAcceptedEmailOtpType(rawType);
  const canExchangeCode = !tokenHash && !!code;

  if (!canVerifyOtp && !canExchangeCode) {
    Sentry.captureMessage('auth_confirm_missing_params', {
      level: 'warning',
      extra: {
        has_token_hash: !!tokenHash,
        has_type: !!rawType,
        has_code: !!code,
        ua,
      },
    });
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const supabase = await getServerSupabase();

  // Both paths converge on the same User shape — we run a shared post-verify
  // flow (profile lookup + redirect) below. Keeping the single `supabase`
  // instance also satisfies the constraint of not double-instantiating the
  // server client.
  let user: User;

  if (canVerifyOtp) {
    // Non-null assertions are safe here: `canVerifyOtp` requires both
    // tokenHash and a valid rawType, and the type guard narrows rawType
    // to EmailOtpType.
    const type: EmailOtpType = rawType as EmailOtpType;
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash!,
    });

    if (error || !data.session) {
      Sentry.captureException(error ?? new Error('verifyOtp returned no session'), {
        tags: {
          route: 'auth/confirm',
          auth_flow: 'magic_link',
        },
        extra: {
          has_token_hash: true,
          type,
          ua,
        },
      });
      return NextResponse.redirect(new URL('/login?error=callback', request.url));
    }

    user = data.session.user;
  } else {
    // canExchangeCode === true here (PKCE fallback for rollout-race links).
    const { data, error } = await supabase.auth.exchangeCodeForSession(code!);

    if (error || !data.session) {
      Sentry.captureException(error ?? new Error('exchangeCodeForSession returned no session'), {
        tags: {
          route: 'auth/confirm',
          auth_flow: 'pkce_fallback',
        },
        extra: {
          has_code: true,
          ua,
        },
      });
      return NextResponse.redirect(new URL('/login?error=callback', request.url));
    }

    user = data.session.user;
  }

  // Both paths converge here. Sentry.setUser fires on either success path
  // (Codex R2 constraint).
  const userId = user.id;
  const userEmail = user.email;

  Sentry.setUser({
    id: userId,
    ...(userEmail ? { email: userEmail } : {}),
  });

  // Profile lookup mirrors callback.ts contract:
  //   - error from .maybeSingle() → /login?error=profile_lookup_failed
  //   - thrown exception          → same (network / connection failure)
  //   - data == null              → /onboarding (row truly missing)
  //   - onboarding_completed_at present → /dashboard (or nextParam override)
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      throw profileError;
    }

    if (!profile?.onboarding_completed_at) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    const destination = nextParam ?? '/dashboard';
    return NextResponse.redirect(new URL(destination, request.url));
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        route: 'auth/confirm',
        auth_flow: 'magic_link',
        stage: 'profile_lookup',
      },
      extra: { user_id: userId, ua },
    });
    return NextResponse.redirect(new URL('/login?error=profile_lookup_failed', request.url));
  }
}
