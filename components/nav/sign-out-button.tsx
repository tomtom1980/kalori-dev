'use client';

/**
 * <SignOutButton /> — POSTs to /api/auth/sign-out, then hard-navigates to /login.
 *
 * Two visual variants:
 *   - `sidebar` (default) — matches the original sidebar UserStrip button
 *     (uppercase label, no border, dust color, 44×44 min target).
 *   - `menuitem` — sized for use inside ProfileMenu's dropdown <ul role="menu">.
 *
 * Hard-nav (`window.location.href = '/login'`) is intentional: the API endpoint
 * clears session cookies via Set-Cookie on the outgoing response; a soft
 * router.push could preserve RSC cache rendered with the now-stale session.
 *
 * Codex E.CODEX Round 1 (B-H2) — verify the POST returned 2xx before
 * redirecting. The endpoint is intentionally idempotent and catches
 * `supabase.auth.signOut()` failures internally before returning 200, so we
 * rely on `response.ok` as the success signal. On non-2xx OR network throw,
 * we still redirect (idempotent UX requirement) but we surface the failure
 * to Sentry via console.error so a silent logout-failure surfaces in prod
 * observability rather than disappearing into the catch.
 *
 * Middleware re-validates the session on the next request — worst case is
 * "still signed in" and the next route-fence catches it; the post-redirect
 * /login route runs through the same auth gate that protects /dashboard.
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';

export interface SignOutButtonProps {
  variant?: 'sidebar' | 'menuitem';
}

export function SignOutButton({ variant = 'sidebar' }: SignOutButtonProps) {
  const [inFlight, setInFlight] = useState(false);

  async function handleClick() {
    if (inFlight) return;
    setInFlight(true);
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        // Codex E.CODEX Round 1 (B-H2) — non-2xx means the cookie-clearing
        // path likely did NOT complete. Log so prod observability surfaces
        // silent sign-out failures; still redirect (idempotent UX).
        console.error('[sign-out] non-2xx response', response.status);
      }
    } catch (err) {
      // Idempotent: proceed to redirect even on network failure. Log so
      // prod observability surfaces network-blip sign-outs.
      console.error('[sign-out] fetch failed', err);
    }
    window.location.href = '/login';
  }

  if (variant === 'menuitem') {
    return (
      <button
        type="button"
        role="menuitem"
        data-testid="profile-menu-sign-out"
        onClick={handleClick}
        disabled={inFlight}
        style={{
          width: '100%',
          textAlign: 'left',
          minHeight: '44px',
          padding: 'var(--spacing-3) var(--spacing-4)',
          background: 'transparent',
          borderWidth: '0',
          borderStyle: 'none',
          color: 'var(--color-sand)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: inFlight ? 'wait' : 'pointer',
        }}
      >
        {t.user.signOutLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={t.user.signOutA11y}
      data-testid="sidebar-sign-out"
      onClick={handleClick}
      disabled={inFlight}
      // Sidebar variant lives inside the 240px aside — opt out of the
      // sitewide hover-lift to avoid the same overflow-scrollbar bug the
      // nav links hit.
      data-no-hover-lift="true"
      style={{
        minHeight: '44px',
        minWidth: '44px',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: 0,
        color: 'var(--color-dust)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--type-label)',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: inFlight ? 'wait' : 'pointer',
      }}
    >
      {t.user.signOutLabel}
    </button>
  );
}
