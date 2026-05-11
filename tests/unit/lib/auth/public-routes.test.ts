/**
 * Task 5.1.2 Codex Round 2 — public-routes allowlist regression tests.
 *
 * The PWA shell (Service Worker, Web App Manifest, offline fallback) MUST
 * remain reachable for unauthenticated visitors so the install ceremony +
 * offline shell can hydrate before any sign-in. The middleware's public-route
 * allowlist (`lib/auth/public-routes.ts`) is the auth-bypass layer; this
 * suite asserts the three PWA endpoints are listed AND that the existing
 * authed-route guards are still firing.
 */
import { describe, expect, it } from 'vitest';

import { isPublicRoute, PUBLIC_ROUTES } from '@/lib/auth/public-routes';

describe('isPublicRoute — Task 5.1.2 PWA shell allowlist', () => {
  it('treats /sw.js as public (Service Worker install fetch)', () => {
    expect(isPublicRoute('/sw.js')).toBe(true);
  });

  it('treats /manifest.json as public (PWA manifest fetch)', () => {
    expect(isPublicRoute('/manifest.json')).toBe(true);
  });

  it('treats /offline as public (SW navigation fallback target)', () => {
    expect(isPublicRoute('/offline')).toBe(true);
  });

  // Regression guards — pre-existing authed routes MUST stay protected.
  it('keeps /dashboard non-public', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('keeps /api/profile/save non-public', () => {
    expect(isPublicRoute('/api/profile/save')).toBe(false);
  });

  it('keeps /onboarding non-public', () => {
    expect(isPublicRoute('/onboarding')).toBe(false);
  });

  it('lists the three PWA endpoints in PUBLIC_ROUTES', () => {
    expect(PUBLIC_ROUTES).toContain('/sw.js');
    expect(PUBLIC_ROUTES).toContain('/manifest.json');
    expect(PUBLIC_ROUTES).toContain('/offline');
  });
});
