/**
 * Task 5.1.2 — Kalori service worker (Serwist runtime).
 *
 * Bundled by `scripts/build-sw.mjs` (esbuild) -> `public/sw.js`. We do NOT
 * use `@serwist/next`'s webpack plugin because Next 16 ships with Turbopack
 * by default and `@serwist/next` does not yet support it
 * (https://github.com/serwist/serwist/issues/54). The routing config lives
 * in `lib/pwa/sw-runtime-caching.ts` so vitest can verify it without booting
 * a SW context.
 *
 * NON-NEGOTIABLE contracts (R1 + session integrity):
 *   - `/api/*` and `/auth/**` use NetworkOnly. The SW MUST NEVER serve a
 *     cached 401 into the refresh-interceptor chain.
 *   - skipWaiting / clientsClaim are FALSE. The new SW stays in waiting state
 *     until the user opts in (Task 5.1.4 wires the affordance).
 *
 * Offline fallback:
 *   - Document navigation requests that miss the network fall back to '/offline'.
 *     The /offline route is server-rendered by Next.js; the SW serves it via
 *     a cache-fallback chain: try network -> on fail, return '/offline' from
 *     the runtime cache (populated on first successful navigation).
 *
 * @see Planning/.tmp/task-5.1-ui-architecture.md §D
 */
/// <reference lib="webworker" />
import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate, ExpirationPlugin } from 'serwist';
import type { RuntimeCaching } from 'serwist';

import { runtimeCaching as runtimeRoutes } from '@/lib/pwa/sw-runtime-caching';

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_CACHE = 'kalori-offline';
const OFFLINE_URL = '/offline';

/**
 * Map our string-strategy config into Serwist Strategy instances. Keeping
 * the strategy as a string in `lib/pwa/sw-runtime-caching.ts` lets vitest
 * assert the routing without importing `serwist` (which only loads in the
 * SW worker context).
 */
const serwistRuntimeCaching: RuntimeCaching[] = runtimeRoutes.map((route) => {
  // Pass the originating Request so navigation matchers can inspect
  // `request.destination` / `request.mode` (URL alone cannot distinguish a
  // top-level document navigation from a `fetch('/dashboard')` subresource).
  const matcher: RuntimeCaching['matcher'] = ({ url, request }) => route.matcher(url, request);
  const expirationOpts: { maxAgeSeconds?: number; maxEntries?: number } = {};
  if (route.maxAgeSeconds !== undefined) expirationOpts.maxAgeSeconds = route.maxAgeSeconds;
  if (route.maxEntries !== undefined) expirationOpts.maxEntries = route.maxEntries;
  const plugins =
    Object.keys(expirationOpts).length > 0 ? [new ExpirationPlugin(expirationOpts)] : [];

  switch (route.strategy) {
    case 'NetworkOnly':
      return { matcher, handler: new NetworkOnly() };
    case 'StaleWhileRevalidate':
      return {
        matcher,
        handler: new StaleWhileRevalidate({
          cacheName: route.cacheName ?? route.id,
          plugins,
        }),
      };
    case 'CacheFirst':
      return {
        matcher,
        handler: new CacheFirst({
          cacheName: route.cacheName ?? route.id,
          plugins,
        }),
      };
    default:
      // Defensive fallback — unknown strategy → NetworkOnly (safer than caching).
      return { matcher, handler: new NetworkOnly() };
  }
});

const serwist = new Serwist({
  // No precache manifest — runtime caching covers our static assets and the
  // /offline fallback is fetched on install + served from `kalori-offline`
  // cache via the `setCatchHandler` below.
  precacheEntries: [],
  // HARD CONTRACT: do NOT auto-activate a new SW. The user opts in via the
  // update affordance (Task 5.1.4) which calls SwRegister.triggerUpdate().
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching: serwistRuntimeCaching,
});

// Cache `/offline` once on install so it is always available, even if the
// user goes offline before visiting the page organically. We do this in a
// dedicated cache so the fallback survives runtime-cache eviction.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch {
        // Ignore install errors — the fallback handler tries network first
        // anyway, and a missing offline page is a soft-fail (Response.error
        // is the worst case, which is what browsers show without an SW).
      }
    })(),
  );
});

// Catch handler: a navigation request reached a NetworkOnly route and failed
// (e.g. fetch() rejected because the user went offline). Serve `/offline`
// from the dedicated cache. Non-document requests (images, fonts, etc.) get
// a bare `Response.error()` so they fail visibly and don't masquerade as
// real responses.
serwist.setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const cache = await caches.open(OFFLINE_CACHE);
    const cached = await cache.match(OFFLINE_URL);
    if (cached) return cached;
  }
  return Response.error();
});

// `addEventListeners()` installs Serwist's own SKIP_WAITING handler when
// `skipWaiting: false` is set on the constructor. SwRegister.triggerUpdate()
// posts that message and Serwist activates the waiting SW — we do NOT need
// (and previously had a redundant) `self.addEventListener('message', …)`
// block here. (Codex Minor #1 fix.)
serwist.addEventListeners();
