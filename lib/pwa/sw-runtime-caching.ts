/**
 * Task 5.1.2 — Service worker runtime caching configuration.
 *
 * This module is the SINGLE SOURCE OF TRUTH for what the service worker does
 * with each request. It is consumed by `app/sw.ts` (Serwist runtime) and is
 * also exercised directly by unit tests (vitest cannot host a real SW, so we
 * test the routing config instead of running the SW).
 *
 * HARD CONTRACT (load-bearing for R1):
 *   - `/api/*` is `NetworkOnly`. The SW MUST NEVER cache /api responses.
 *     Caching them would let the SW return a stale 401 from a previous session
 *     into the R1 refresh-interceptor chain, which would then try to refresh
 *     against a cached header and break Task 2.1's idempotency contract.
 *   - `/auth/**` and `/api/auth/**` are `NetworkOnly` (session integrity).
 *   - `/_next/static/**` is `StaleWhileRevalidate` (immutable hashed assets).
 *   - `/_next/image` and Supabase `food-thumbnails/**` are `CacheFirst` with
 *     a 30-day / 7-day TTL respectively.
 *
 * Offline fallback: document navigations are matched by the `navigation` route
 * (NetworkOnly), so when the network is unavailable Serwist's `setCatchHandler`
 * fires and serves '/offline' from the dedicated `kalori-offline` cache that
 * was populated by the SW install hook (`app/sw.ts`). Without a navigation
 * route in this table Serwist would never call `event.respondWith()` for
 * `/dashboard` etc., the browser would handle the navigation directly, and
 * the catch handler would never run — so this entry is load-bearing for the
 * offline UX (Codex Critical #1 fix).
 *
 * @see Planning/.tmp/task-5.1-ui-architecture.md §D Service Worker Scope
 * @see Planning/architecture.md §11 (R1 refresh-interceptor)
 */

/**
 * Strategy enum — kept as string literals so vitest can assert without
 * importing the full Serwist runtime (which only loads in the SW context).
 */
export type SwStrategy =
  | 'NetworkOnly'
  | 'NetworkFirst'
  | 'StaleWhileRevalidate'
  | 'CacheFirst'
  | 'CacheOnly';

export interface RuntimeCacheRoute {
  /** Stable identifier used by sw.ts to map config → Serwist Strategy. */
  id: string;
  /** Cache name (used by CacheFirst / SWR). NetworkOnly entries set null. */
  cacheName: string | null;
  /** Routing strategy. */
  strategy: SwStrategy;
  /**
   * Predicate over a parsed URL plus the optional originating Request. Runs
   * in both vitest and SW contexts; `request` is undefined in URL-only tests
   * but always defined inside Serwist (so navigation matchers can inspect
   * `request.destination` / `request.mode`).
   */
  matcher: (url: URL, request?: Request) => boolean;
  /** Optional max age (seconds) for CacheFirst / SWR with ExpirationPlugin. */
  maxAgeSeconds?: number;
  /** Optional max entries for the bound cache. */
  maxEntries?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure URL matchers — exported separately so tests can verify each predicate.
// ─────────────────────────────────────────────────────────────────────────────

/** True if the URL is `/api/...` (any sub-path, same-origin or otherwise). */
export function matchesApi(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/**
 * True if the URL is auth-bearing — covers both `/auth/**` (Supabase server
 * routes) and `/api/auth/**` (refresh-interceptor + signout).
 */
export function matchesAuth(url: URL): boolean {
  return (
    url.pathname === '/auth' ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/auth/')
  );
}

/** True if the URL is `/_next/static/**` (immutable hashed bundle assets). */
export function matchesNextStatic(url: URL): boolean {
  return url.pathname.startsWith('/_next/static/');
}

/** True if the URL is the `/_next/image` optimization endpoint. */
export function matchesNextImage(url: URL): boolean {
  return url.pathname === '/_next/image';
}

/**
 * True if the URL targets the Supabase Storage `food-thumbnails` bucket
 * (matches both signed and public read paths). Cross-origin (different
 * Supabase project hostnames between dev / prod), so we match on path.
 */
export function matchesThumbnail(url: URL): boolean {
  return /\/storage\/v1\/object\/(?:sign|public)\/food-thumbnails\//.test(url.pathname);
}

/** True if the URL is `/manifest.json` or `/icons/**`. */
export function matchesManifestOrIcons(url: URL): boolean {
  return url.pathname === '/manifest.json' || url.pathname.startsWith('/icons/');
}

/**
 * True if the request is a top-level document navigation. We test this with a
 * defence-in-depth pair: `request.mode === 'navigate'` is the canonical signal
 * for the SW navigation case, and `request.destination === 'document'` covers
 * environments that surface destination but not mode. The url is unused but
 * kept positional so this matcher fits the same `(url, request)` shape as the
 * rest of the table.
 *
 * Subresource fetches (script/image/style/font/empty) MUST NOT match — they
 * have their own rules upstream and downstream of this entry.
 */
export function matchesNavigation(_url: URL, request?: Request): boolean {
  if (!request) return false;
  return request.mode === 'navigate' || request.destination === 'document';
}

// ─────────────────────────────────────────────────────────────────────────────
// Routing table — order matters: first match wins inside Serwist.
// ─────────────────────────────────────────────────────────────────────────────

export const runtimeCaching: RuntimeCacheRoute[] = [
  // 1. Auth FIRST — must beat the generic /api rule below.
  {
    id: 'auth',
    cacheName: null,
    strategy: 'NetworkOnly',
    matcher: matchesAuth,
  },
  // 2. /api/* — never cached. Mutations route via outbox when offline.
  {
    id: 'api',
    cacheName: null,
    strategy: 'NetworkOnly',
    matcher: matchesApi,
  },
  // 3. Document navigations — NetworkOnly so the SW always tries the network
  //    and falls through to `setCatchHandler` on failure (which serves the
  //    precached `/offline` page from the `kalori-offline` cache). Without
  //    this entry Serwist never calls `event.respondWith()` for navigations
  //    and the browser's default failure UI wins. Ordered AFTER /auth/** and
  //    /api/* so those auth-bearing rules continue to take priority (they
  //    won't normally trigger here because navigations don't target /api/*,
  //    but the ordering is the R1 invariant we test for).
  {
    id: 'navigation',
    cacheName: null,
    strategy: 'NetworkOnly',
    matcher: matchesNavigation,
  },
  // 4. Hashed JS / CSS assets — SWR is correct because filenames change on every deploy.
  {
    id: 'next-static',
    cacheName: 'next-static',
    strategy: 'StaleWhileRevalidate',
    matcher: matchesNextStatic,
  },
  // 4. Optimized images — CacheFirst with 30-day TTL.
  {
    id: 'next-image',
    cacheName: 'next-image',
    strategy: 'CacheFirst',
    matcher: matchesNextImage,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    maxEntries: 60,
  },
  // 5. Food thumbnails — 7-day TTL (signed URLs expire after 7 days).
  {
    id: 'thumbnails',
    cacheName: 'food-thumbnails',
    strategy: 'CacheFirst',
    matcher: matchesThumbnail,
    maxAgeSeconds: 7 * 24 * 60 * 60,
    maxEntries: 200,
  },
  // 6. Manifest + icons — precached, but if a fetch slips through use CacheFirst.
  {
    id: 'manifest-icons',
    cacheName: 'manifest-icons',
    strategy: 'CacheFirst',
    matcher: matchesManifestOrIcons,
    maxAgeSeconds: 30 * 24 * 60 * 60,
  },
];

// Offline fallback wiring lives in `app/sw.ts`: the install hook precaches
// '/offline' into a dedicated `kalori-offline` cache, and `setCatchHandler`
// serves it when the navigation route above fails. No standalone fallback
// helper is needed — Serwist's catch handler is the single contract.
