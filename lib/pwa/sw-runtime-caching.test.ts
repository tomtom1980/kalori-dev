/**
 * @vitest-environment node
 *
 * Task D.2 (US-STAB-D2) — Service Worker 401 caching regression guard.
 *
 * Design-doc §10 P-4 mitigation contract:
 *   The service worker MUST NEVER cache 401 responses on `/api/*`. A cached
 *   stale 401 served to a fresh session would loop back into the R1 refresh
 *   interceptor and break the canonical refresh-retry path.
 *
 * Implementation note: `/api/*` and `/api/auth/**` are already declared
 * `NetworkOnly` in `runtimeCaching` (see this file's top contract). Workbox
 * `NetworkOnly` never calls `cache.put`, so 401 responses cannot be persisted
 * regardless of status. These tests assert the matchers + strategy bindings
 * stay locked so a future edit cannot accidentally downgrade `/api/*` to a
 * cache-bearing strategy. The Serwist `setCatchHandler` only fires on network
 * rejection — a returned 401 Response does NOT trigger it, so no separate
 * fetch-handler test is needed.
 */
import { describe, expect, it } from 'vitest';

import {
  matchesApi,
  matchesAuth,
  runtimeCaching,
  type RuntimeCacheRoute,
  type SwStrategy,
} from './sw-runtime-caching';

/**
 * Resolves the first runtime-caching route whose matcher accepts `url`.
 * Mirrors Serwist's "first-match-wins" runtime ordering — without it, asserting
 * "/api/* is NetworkOnly" by-string would silently pass even if `auth` were
 * accidentally reordered to swallow non-auth /api paths.
 */
function routeFor(url: URL, request?: Request): RuntimeCacheRoute | null {
  return runtimeCaching.find((r) => r.matcher(url, request)) ?? null;
}

describe('Task D.2 — SW does NOT cache 401 on /api/* (design-doc §10 P-4 regression guard)', () => {
  it('matchesApi: matches representative /api/* paths', () => {
    expect(matchesApi(new URL('http://localhost/api/water/log'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/entries/save'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/profile/save'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/account/delete'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/ai/text-parse'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/library/foo/update'))).toBe(true);
    expect(matchesApi(new URL('http://localhost/api/export/csv'))).toBe(true);
    // Non-API paths MUST NOT match.
    expect(matchesApi(new URL('http://localhost/dashboard'))).toBe(false);
    expect(matchesApi(new URL('http://localhost/_next/static/foo.js'))).toBe(false);
  });

  it('routeFor: /api/* (non-auth) resolves to the `api` rule with NetworkOnly + cacheName: null', () => {
    const route = routeFor(new URL('http://localhost/api/water/log'));
    expect(route).not.toBeNull();
    const r = route as RuntimeCacheRoute;
    expect(r.id).toBe('api');
    expect(r.strategy satisfies SwStrategy).toBe('NetworkOnly');
    // NetworkOnly with cacheName: null is the load-bearing pair — NetworkOnly
    // never calls cache.put; cacheName: null means no plugin can attach a
    // cache to this route. Either drift would re-introduce 401 caching.
    expect(r.cacheName).toBeNull();
  });

  it('routeFor: /api/auth/* resolves to the `auth` rule (also NetworkOnly + cacheName: null), beating the generic /api/* match', () => {
    const route = routeFor(new URL('http://localhost/api/auth/sign-out'));
    expect(route).not.toBeNull();
    const r = route as RuntimeCacheRoute;
    expect(r.id).toBe('auth');
    expect(r.strategy).toBe('NetworkOnly');
    expect(r.cacheName).toBeNull();
  });

  it('every /api/* route is mapped to a NetworkOnly entry — no /api/* path may fall through to a cache-bearing strategy', () => {
    const apiUrls = [
      'http://localhost/api/water/log',
      'http://localhost/api/weight/log',
      'http://localhost/api/entries/save',
      'http://localhost/api/library/list',
      'http://localhost/api/library/foo/update',
      'http://localhost/api/library/foo/delete',
      'http://localhost/api/ai/text-parse',
      'http://localhost/api/ai/vision',
      'http://localhost/api/ai/weekly-review',
      'http://localhost/api/export/csv',
      'http://localhost/api/export/json',
      'http://localhost/api/export/zip',
      'http://localhost/api/profile/save',
      'http://localhost/api/account/delete',
      'http://localhost/api/auth/sign-out',
      'http://localhost/api/storage/thumbnail',
    ];
    for (const u of apiUrls) {
      const route = routeFor(new URL(u));
      expect(route, `Expected ${u} to match a runtime-caching route`).not.toBeNull();
      const r = route as RuntimeCacheRoute;
      expect(r.strategy, `${u} mapped to ${r.strategy}`).toBe('NetworkOnly');
      expect(r.cacheName, `${u} has cacheName=${r.cacheName}`).toBeNull();
    }
  });

  it('matchesAuth: covers /auth/** and /api/auth/** so session-bearing routes are also NetworkOnly', () => {
    expect(matchesAuth(new URL('http://localhost/auth/callback'))).toBe(true);
    expect(matchesAuth(new URL('http://localhost/api/auth/sign-out'))).toBe(true);
    expect(matchesAuth(new URL('http://localhost/auth'))).toBe(true);
    expect(matchesAuth(new URL('http://localhost/dashboard'))).toBe(false);
  });

  it('routing-table ordering: `auth` rule appears BEFORE the generic `api` rule (first-match-wins)', () => {
    const authIdx = runtimeCaching.findIndex((r) => r.id === 'auth');
    const apiIdx = runtimeCaching.findIndex((r) => r.id === 'api');
    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeLessThan(apiIdx);
  });
});
