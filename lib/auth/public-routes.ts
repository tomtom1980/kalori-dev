/**
 * Public route allowlist consumed by `middleware.ts` (Task 2.1c — I6 contract).
 *
 * Routes listed here are reachable WITHOUT an authenticated Supabase session.
 * Every other route requires a session; unauthenticated requests are
 * redirected to `/login` with a `redirect_to` query param preserving the
 * original path so post-sign-in lands the user back where they started.
 *
 * Contract (design-doc §6 + architecture.md §1.4):
 *   - `/`                 marketing landing (task 1.1)
 *   - `/login`            magic-link + Google OAuth (task 2.1c)
 *   - `/auth/callback`    OAuth/magic-link handler (task 2.1c)
 *   - `/auth/confirm`     PKCE-free magic-link verification (cross-browser fix)
 *   - `/api/auth/*`       server-owned auth endpoints (sign-out stub, future)
 *   - `/sw.js`            PWA service worker script (task 5.1.2)
 *   - `/manifest.json`    PWA web app manifest (task 5.1.2)
 *   - `/offline`          SW navigation fallback page (task 5.1.2)
 *
 * The PWA endpoints (`/sw.js`, `/manifest.json`, `/offline`) MUST be public so
 * the install ceremony + manifest fetch + offline shell can hydrate for
 * unauthenticated visitors — otherwise the SW install request 302s to
 * `/login`, the cached "offline" payload becomes the login page, and the
 * whole offline contract collapses (Codex Round 2 Critical #1).
 *
 * Static assets (`_next/static`, `_next/image`, `favicon.ico`, image
 * extensions) are excluded by the middleware matcher config, NOT listed here.
 * That separation keeps the allowlist semantic rather than file-extension-driven.
 *
 * Match semantics — a request path is public when it EXACTLY equals an entry
 * or starts with `entry + '/'`. `/login` matches `/login` and `/login/x` but
 * not `/loginish`. `/api/auth` matches `/api/auth/sign-out` and `/api/auth`.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  '/',
  '/login',
  '/auth/callback',
  '/auth/confirm',
  '/api/auth',
  '/sw.js',
  '/manifest.json',
  '/offline',
] as const;

/**
 * Returns `true` when `pathname` is a public route (no session required).
 * Exact match OR prefix-with-`/` match. Root `/` matches only the exact
 * root path; non-root entries also match sub-paths beneath them.
 */
export function isPublicRoute(pathname: string): boolean {
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
