/**
 * Task 5.1.2 — Service worker caching contract tests (RED → GREEN).
 *
 * The SW lives in `app/sw.ts` and is built by `@serwist/next`. We can't run
 * the SW in vitest (no real ServiceWorkerGlobalScope), but we CAN inspect
 * `lib/pwa/sw-runtime-caching.ts` — the routing config that the SW consumes —
 * and assert that:
 *   1. `/api/*` requests are routed to NetworkOnly (NEVER cached). This is
 *      load-bearing: SW caching of /api would serve stale 401s into the R1
 *      refresh-interceptor chain and break Task 2.1's contract.
 *   2. `/auth/*` and `/api/auth/**` are NetworkOnly (session integrity).
 *   3. Static assets (`/_next/static/**`) get StaleWhileRevalidate.
 *   4. Images / fonts get CacheFirst with sane TTLs.
 *   5. Document navigations are routed through the runtime table (NetworkOnly)
 *      so Serwist's `setCatchHandler` fires on failure and serves '/offline'
 *      from the precache. (Critical #1 fix — without a navigation route
 *      Serwist never calls `event.respondWith` and the browser failure page
 *      wins.)
 *   6. The runtime-caching list is exported so app/sw.ts can consume it.
 */
import { describe, expect, it } from 'vitest';

import {
  matchesApi,
  matchesAuth,
  matchesNavigation,
  matchesNextStatic,
  matchesNextImage,
  matchesThumbnail,
  runtimeCaching,
} from '@/lib/pwa/sw-runtime-caching';

describe('SW runtime caching matchers', () => {
  it('matches /api/* requests as API', () => {
    expect(matchesApi(new URL('https://kalori.app/api/entries/save'))).toBe(true);
    expect(matchesApi(new URL('https://kalori.app/api/library'))).toBe(true);
    expect(matchesApi(new URL('https://kalori.app/api/ai/text-parse'))).toBe(true);
  });

  it('does NOT match non-/api routes as API', () => {
    expect(matchesApi(new URL('https://kalori.app/dashboard'))).toBe(false);
    expect(matchesApi(new URL('https://kalori.app/log'))).toBe(false);
  });

  it('matches /auth/** and /api/auth/** as auth', () => {
    expect(matchesAuth(new URL('https://kalori.app/auth/callback'))).toBe(true);
    expect(matchesAuth(new URL('https://kalori.app/auth/refresh'))).toBe(true);
    expect(matchesAuth(new URL('https://kalori.app/api/auth/refresh'))).toBe(true);
    expect(matchesAuth(new URL('https://kalori.app/api/auth/signout'))).toBe(true);
  });

  it('matches /_next/static/** as next-static', () => {
    expect(matchesNextStatic(new URL('https://kalori.app/_next/static/chunks/main.js'))).toBe(true);
    expect(matchesNextStatic(new URL('https://kalori.app/_next/static/css/app.css'))).toBe(true);
  });

  it('matches /_next/image as next-image', () => {
    expect(matchesNextImage(new URL('https://kalori.app/_next/image?url=foo'))).toBe(true);
  });

  it('matches food-thumbnails as thumbnail', () => {
    expect(
      matchesThumbnail(
        new URL(
          'https://abc.supabase.co/storage/v1/object/sign/food-thumbnails/2026-04-25/uuid.webp',
        ),
      ),
    ).toBe(true);
  });
});

describe('SW runtime caching contract', () => {
  it('exposes a runtimeCaching array', () => {
    expect(Array.isArray(runtimeCaching)).toBe(true);
    expect(runtimeCaching.length).toBeGreaterThan(0);
  });

  it('routes /api/* requests to NetworkOnly (NEVER cached) — R1 dependency', () => {
    const apiRoute = runtimeCaching.find((r) => r.id === 'api');
    expect(apiRoute).toBeDefined();
    expect(apiRoute?.strategy).toBe('NetworkOnly');
    // matcher must catch /api/entries/save
    expect(apiRoute?.matcher(new URL('https://kalori.app/api/entries/save'))).toBe(true);
  });

  it('routes /auth/** to NetworkOnly (session integrity)', () => {
    const authRoute = runtimeCaching.find((r) => r.id === 'auth');
    expect(authRoute).toBeDefined();
    expect(authRoute?.strategy).toBe('NetworkOnly');
    expect(authRoute?.matcher(new URL('https://kalori.app/auth/callback'))).toBe(true);
    expect(authRoute?.matcher(new URL('https://kalori.app/api/auth/refresh'))).toBe(true);
  });

  it('routes /_next/static/** to StaleWhileRevalidate', () => {
    const staticRoute = runtimeCaching.find((r) => r.id === 'next-static');
    expect(staticRoute).toBeDefined();
    expect(staticRoute?.strategy).toBe('StaleWhileRevalidate');
  });

  it('routes /_next/image to CacheFirst with TTL', () => {
    const imageRoute = runtimeCaching.find((r) => r.id === 'next-image');
    expect(imageRoute).toBeDefined();
    expect(imageRoute?.strategy).toBe('CacheFirst');
    expect(imageRoute?.maxAgeSeconds).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  it('routes food-thumbnails to CacheFirst with TTL', () => {
    const thumbRoute = runtimeCaching.find((r) => r.id === 'thumbnails');
    expect(thumbRoute).toBeDefined();
    expect(thumbRoute?.strategy).toBe('CacheFirst');
  });

  it('does NOT have any rule that caches /api/* with a non-NetworkOnly strategy', () => {
    for (const route of runtimeCaching) {
      if (route.matcher(new URL('https://kalori.app/api/entries/save'))) {
        expect(route.strategy).toBe('NetworkOnly');
      }
      if (route.matcher(new URL('https://kalori.app/api/auth/refresh'))) {
        expect(route.strategy).toBe('NetworkOnly');
      }
    }
  });
});

describe('Navigation route (Critical #1 fix — offline fallback path)', () => {
  it('exposes a navigation route in the runtimeCaching table', () => {
    const navRoute = runtimeCaching.find((r) => r.id === 'navigation');
    expect(navRoute).toBeDefined();
    // NetworkOnly — every navigation MUST hit the network so the catch handler
    // fires on failure and serves /offline. Caching documents would mask both
    // session changes and offline state.
    expect(navRoute?.strategy).toBe('NetworkOnly');
  });

  it('orders the navigation route AFTER auth + api but BEFORE next-static (R1 invariant)', () => {
    const ids = runtimeCaching.map((r) => r.id);
    const authIdx = ids.indexOf('auth');
    const apiIdx = ids.indexOf('api');
    const navIdx = ids.indexOf('navigation');
    const staticIdx = ids.indexOf('next-static');
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeGreaterThan(authIdx);
    expect(navIdx).toBeGreaterThan(apiIdx);
    expect(staticIdx).toBeGreaterThan(navIdx);
  });

  it('navigation matcher matches document navigations and ignores subresources', () => {
    const navRoute = runtimeCaching.find((r) => r.id === 'navigation');
    expect(navRoute).toBeDefined();
    if (!navRoute) throw new Error('navigation route missing');

    // A document navigation MUST match.
    const docRequest = new Request('https://kalori.app/dashboard', { method: 'GET' });
    Object.defineProperty(docRequest, 'destination', { value: 'document', configurable: true });
    Object.defineProperty(docRequest, 'mode', { value: 'navigate', configurable: true });
    expect(matchesNavigation(new URL(docRequest.url), docRequest)).toBe(true);

    // A subresource (script, image) MUST NOT match — they belong to other rules.
    const scriptRequest = new Request('https://kalori.app/_next/static/chunks/x.js', {
      method: 'GET',
    });
    Object.defineProperty(scriptRequest, 'destination', { value: 'script', configurable: true });
    Object.defineProperty(scriptRequest, 'mode', { value: 'cors', configurable: true });
    expect(matchesNavigation(new URL(scriptRequest.url), scriptRequest)).toBe(false);

    // An /api/* fetch MUST NOT match navigation — caught by /api rule first.
    const apiRequest = new Request('https://kalori.app/api/foo', { method: 'GET' });
    Object.defineProperty(apiRequest, 'destination', { value: 'empty', configurable: true });
    Object.defineProperty(apiRequest, 'mode', { value: 'cors', configurable: true });
    expect(matchesNavigation(new URL(apiRequest.url), apiRequest)).toBe(false);
  });
});
