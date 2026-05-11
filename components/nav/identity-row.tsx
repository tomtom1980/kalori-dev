/**
 * `<IdentityRow />` — Sidebar identity surface (Task A.2 / US-STAB-A2).
 *
 * Replaces the inline `UserStrip()` block in `components/nav/sidebar.tsx`
 * (lines 145–211) so the identity row can be unit-tested in isolation and
 * the resolver contract is exercised at the component boundary.
 *
 * Boundary: pure RSC (no `'use client'`). The Sign Out button is rendered by
 * the parent `Sidebar` itself; this component owns ONLY the avatar + name
 * sub-block. No client-side state, no event handlers, no animations — the
 * row paints once on the server and never re-renders without a full
 * navigation (per ux-style §4 + §5.4).
 *
 * Contract sources:
 *   - `Planning/.tmp/task-A.2-ui-frontend.md` §1, §5 (extraction + composition)
 *   - `Planning/.tmp/task-A.2-ui-style.md` §1, §3, §5.1, §6.2 (visual states)
 *   - `lib/auth/get-display-identity.ts` (resolver + decision tree)
 *
 * Codex Round 1 #3 (DTO): this component now consumes the narrow
 * `DisplayIdentity` DTO directly rather than the full Supabase `User`. The
 * resolver runs server-side in `app/(app)/layout.tsx` so the full Supabase
 * payload (provider_metadata, identities[], phone, app_metadata, etc.)
 * never crosses the server→client boundary.
 *
 * `prefers-reduced-motion` note: nothing animates. Future contributors must
 * NOT add fade-in / transition behavior here without re-reviewing the
 * Quick-Pick Decision Table (web-ui-guide.md §1).
 */
import { t } from '@/lib/i18n/en';

import type { DisplayIdentity } from '@/lib/auth/get-display-identity';

export interface IdentityRowProps {
  /**
   * Server-resolved display identity DTO drilled from `app/(app)/layout.tsx`.
   * Contains ONLY the four narrowly-scoped display fields — never the full
   * Supabase `User`. Resolver-branch coverage lives in the resolver unit
   * tests; this component just renders the DTO.
   */
  identity: DisplayIdentity;
}

export function IdentityRow({ identity }: IdentityRowProps) {
  const ariaLabel = identity.isAnonymous
    ? t.user.notSignedIn
    : `${t.user.signedInAs} ${identity.name}`;

  return (
    <div
      data-testid="sidebar-identity-row"
      aria-label={ariaLabel}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}
    >
      <span
        data-testid="sidebar-identity-row-monogram"
        aria-hidden="true"
        style={{
          width: '32px',
          height: '32px',
          backgroundColor: 'var(--color-oxblood)',
          color: 'var(--color-ivory)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          fontWeight: 400,
          flexShrink: 0,
        }}
      >
        {identity.initials}
      </span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          data-testid="sidebar-identity-row-name"
          data-anonymous={identity.isAnonymous ? 'true' : 'false'}
          style={
            identity.isAnonymous
              ? {
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '10.5px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-dust)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }
              : {
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '12px',
                  color: 'var(--color-ivory)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }
          }
        >
          {identity.name}
        </span>
      </div>
    </div>
  );
}

export default IdentityRow;
