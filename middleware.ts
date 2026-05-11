/**
 * Kalori middleware — Task 2.1c I6 redirect enforcement.
 *
 * Replaces the Task 1.2 pass-through shell. Task 2.1 OWNS all redirect +
 * session-bridging logic per R1 mitigation contract (see
 * `Planning/tasks.md` §R1 + `Planning/progress.md` R1 block).
 *
 * Contract (design-doc §6 + architecture.md §1.4 lines 88–93):
 *   1. Reads the Supabase session via `@supabase/ssr` `createServerClient` +
 *      `supabase.auth.getSession()` — cookie-only, no network roundtrip.
 *   2. Public routes (`lib/auth/public-routes.ts`) pass through for everyone.
 *   3. Signed-in users on `/login` are redirected to `/dashboard` so they
 *      don't sit on the sign-in screen. The onboarding-vs-dashboard split
 *      is decided downstream (auth callback + dashboard page) once we
 *      actually read `profiles.onboarding_completed_at`; doing it here
 *      would require a DB round-trip on every request, which breaks the
 *      Edge-middleware latency budget.
 *   4. Unauthenticated hits on any non-public route redirect to
 *      `/login?redirect_to=<original>` so post-sign-in lands the user back
 *      where they started.
 *   5. Static assets are excluded by the matcher config (`_next/static`,
 *      `_next/image`, `favicon.ico`, image extensions) — those never hit
 *      the middleware function at all.
 *
 * R1 compliance:
 *   - This file uses Supabase's own cookie refresh plumbing (the setAll
 *     branch of `createServerClient`) — no local 401-retry shim.
 *   - The canonical F12 refresh interceptor at
 *     `lib/auth/refresh-interceptor.ts` is Layer 2.1d's scope; middleware
 *     here does NOT duplicate that logic.
 *   - Failure modes: if Supabase env vars are missing OR `getSession()`
 *     throws, we fall back to "treat as unauthenticated" so a misconfigured
 *     environment never leaks authed content. The env-missing branch
 *     specifically lets public routes through (so /login still renders in
 *     dev if the user forgot to set up `.env.local`) but redirects
 *     authed-route hits to /login.
 *
 * PII note: this file logs nothing. The Sentry `beforeSend` scrubber from
 * Task 1.1 handles any breadcrumbs Next injects implicitly.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/auth/callback',
  '/api/auth',
  '/sw.js',
  '/manifest.json',
  '/offline',
] as const;

function isPublicRoute(pathname: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (route === '/') {
      if (pathname === '/') return true;
      continue;
    }
    if (pathname === route) return true;
    if (pathname.startsWith(`${route}/`)) return true;
  }
  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicRoute(pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Env-missing fallback: public routes still render (so /login + / work in
  // a fresh checkout), authed routes bounce to /login. This is strictly a
  // safety rail; in practice Vercel + `.env.local` always supply these vars.
  if (!url || !key) {
    if (isPublic) return response;
    return redirectToLogin(request);
  }

  // ─── C1-B hybrid auth pattern (Codex fix, approach C1-B) ─────────────────
  //
  // Middleware performs a CHEAP cookie-shape check via `getSession()` — this
  // is `@supabase/ssr`'s cookie-only path (no network roundtrip), which is
  // the right tool for redirect routing at the Edge. A forged cookie with
  // the correct shape + unexpired `expires_at` will pass this check.
  //
  // SECURITY INVARIANT — authed Server Components and Route Handlers MUST
  // validate the session server-side by calling `supabase.auth.getUser()`
  // before rendering sensitive data or mutating state. `getUser()` makes a
  // network call to Supabase's `/auth/v1/user` endpoint, which cryptograph-
  // ically verifies the access token. This is Supabase's officially
  // recommended SSR pattern (see https://supabase.com/docs/guides/auth/
  // server-side/nextjs — "Never trust `getSession` in server code").
  //
  // See `app/(app)/onboarding/page.tsx` and `app/(app)/dashboard/page.tsx`
  // for the canonical page-level pattern. `/api/profile/save` already
  // validates via `getSession()` + RLS; the sign-out route is intentionally
  // tolerant of invalid sessions (idempotent cleanup).
  // ─────────────────────────────────────────────────────────────────────
  let hasSession = false;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options });
          }
        },
      },
    });

    // @ts-ignore - Vercel Edge TS compiler occasionally misses getSession on SupabaseAuthClient
    const { data } = await supabase.auth.getSession();
    hasSession = data.session !== null;
  } catch {
    // Cookie parse error or Supabase SDK throw — treat as unauthenticated
    // rather than leaking authed content. Browsers will reach /login and
    // can start a fresh sign-in.
    hasSession = false;
  }

  // Signed-in user tries to visit /login → kick them to /dashboard. The
  // onboarding-vs-dashboard split happens inside the dashboard page itself
  // (or in the auth callback route), so we don't DB-fetch here.
  //
  // Exception: when an authed RSC page's `getUser()` validation fails
  // (C1-B forged-cookie path), the page redirects here with
  // `?reason=session_expired` to force the user back to sign-in. We must
  // NOT bounce that redirect back to `/dashboard` — the cookie is still
  // present but server-unverifiable, so the loop would be infinite.
  // Letting `/login` render allows the user to start a fresh sign-in,
  // which replaces the bad cookie.
  if (hasSession && pathname === '/login') {
    const reason = request.nextUrl.searchParams.get('reason');
    if (reason !== 'session_expired') {
      const target = new URL('/dashboard', request.url);
      return NextResponse.redirect(target);
    }
  }

  // Public routes (including unauthed /login, /, /auth/callback, /api/auth/*)
  // pass through for everyone else.
  if (isPublic) return response;

  // Protected route + no session → redirect to login with redirect_to.
  if (!hasSession) return redirectToLogin(request);

  // Protected route + session → pass through.
  return response;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const target = new URL('/login', request.url);
  // Preserve the original path (and query) so post-sign-in can restore it.
  const originalPath = request.nextUrl.pathname + request.nextUrl.search;
  target.searchParams.set('redirect_to', originalPath);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
