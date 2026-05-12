/**
 * <Sidebar /> — Desktop (1280+) persistent primary nav.
 *
 * Shape (ui-design.md §6.2 + design-doc.md §9 ASCII):
 *   - 240px wide, `bg-1` surface, 1px `rule-strong` right edge
 *   - Brand row: "KALORI" serif wordmark + 7px oxblood square bullet
 *   - Four primary destination rows (56px height each)
 *   - Active state: 3px oxblood LEFT border + ivory text + bg-2 fill
 *   - User strip at bottom with persistently-visible Sign Out link
 *
 * Task 1.2 scope:
 *   - Routes are stub; no auth wiring (Task 2.1 owns profile + sign-out).
 *   - `pathname` prop is injected — the `app/(app)/layout.tsx` consumer reads
 *     `usePathname()` in a tiny client wrapper and passes the value down.
 *     That keeps <Sidebar /> itself a pure RSC-compatible function.
 *
 * Accessibility invariants (ui-design.md §6):
 *   - `<nav aria-label="Primary">` landmark
 *   - `aria-current="page"` on the matched row
 *   - All rows ≥ 44×44 tap target (actual 56px rows clear that easily)
 *   - Focus ring inherited from `app/globals.css :focus-visible`
 */
import Link from 'next/link';

import { t } from '@/lib/i18n/en';

import { IdentityRow } from './identity-row';
import { PRIMARY_DESTINATIONS, isRouteActive } from './primary-destinations';

import type { DisplayIdentity } from '@/lib/auth/get-display-identity';

/**
 * Default identity for chrome-level tests + unauthenticated mounts. Mirrors
 * the resolver's `user == null` branch (B0) so test setups that don't supply
 * an `identity` prop still render the GUEST visual state. Kept inline here
 * instead of exported from the resolver module to keep the auto-fix surface
 * minimal (Codex Round 1 #3 — DTO).
 */
const ANONYMOUS_IDENTITY: DisplayIdentity = {
  name: 'GUEST',
  handle: undefined,
  initials: '—',
  isAnonymous: true,
};

export interface SidebarProps {
  pathname: string;
  /**
   * Server-resolved display identity DTO drilled from `app/(app)/layout.tsx`.
   * Contains ONLY {name, handle, initials, isAnonymous} — never the full
   * Supabase `User` (Codex Round 1 #3 — DTO leakage fix). Optional so
   * chrome-level tests can mount <Sidebar /> without an auth fixture; the
   * default is the anonymous identity the resolver returns for `null` users.
   */
  identity?: DisplayIdentity;
}

export function Sidebar({ pathname, identity = ANONYMOUS_IDENTITY }: SidebarProps) {
  return (
    <aside
      className="kalori-sidebar"
      style={{
        width: '240px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg-1)',
        borderRightWidth: '1px',
        borderRightStyle: 'solid',
        borderRightColor: 'var(--color-rule-strong)',
      }}
    >
      <BrandRow />
      <nav
        aria-label={t.nav.a11y.primary}
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'var(--spacing-6)',
          paddingBottom: 'var(--spacing-6)',
          flex: 1,
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-bg-2)',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--color-rule)',
            paddingInline: 'var(--spacing-6)',
            paddingBlock: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          <h2
            style={{
              display: 'block',
              fontFamily: 'var(--font-serif)',
              fontSize: '22px',
              fontWeight: 400,
              color: 'var(--color-ivory)',
              margin: 0,
            }}
          >
            {t.nav.sectionHeading}
          </h2>
        </div>
        {PRIMARY_DESTINATIONS.map((destination) => {
          const active = isRouteActive(destination.href, pathname);
          return (
            <Link
              key={destination.href}
              // @nav-audit ignore
              // (href values are statically extracted from
              // components/nav/primary-destinations.ts)
              href={destination.href}
              data-testid={destination.testId}
              className="kalori-sidebar-link"
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '56px',
                paddingInline: 'var(--spacing-6)',
                paddingBlock: 'var(--spacing-3)',
                borderLeftWidth: '3px',
                borderLeftStyle: 'solid',
                borderLeftColor: active ? 'var(--color-oxblood)' : 'transparent',
                backgroundColor: active ? 'var(--color-bg-2)' : 'transparent',
                color: active ? 'var(--color-ivory)' : 'var(--color-dust)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--type-nav)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              {destination.label}
            </Link>
          );
        })}
      </nav>
      <UserStrip identity={identity} />
    </aside>
  );
}

function BrandRow() {
  return (
    <div
      className="kalori-sidebar-brand"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-2)',
        paddingInline: 'var(--spacing-6)',
        paddingBlock: 'var(--spacing-6)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-rule)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: '28px',
          letterSpacing: '-0.02em',
          color: 'var(--color-ivory)',
        }}
      >
        {t.brand.wordmark}
      </span>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '7px',
          height: '7px',
          backgroundColor: 'var(--color-oxblood)',
        }}
      />
    </div>
  );
}

/**
 * UserStrip — sidebar bottom block holding identity row + persistent SIGN OUT.
 * Task A.2 (US-STAB-A2): identity sub-block extracted into <IdentityRow />;
 * SIGN OUT button preserved verbatim (R1 firewall — Task 2.1 owns auth wiring).
 *
 * Codex Round 1 #3 (DTO): consumes the narrow DisplayIdentity DTO from the
 * server resolver, not the full Supabase `User`.
 */
function UserStrip({ identity }: { identity: DisplayIdentity }) {
  return (
    <div
      style={{
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-rule)',
        padding: 'var(--spacing-4) var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-2)',
      }}
    >
      <IdentityRow identity={identity} />
      <button
        type="button"
        aria-label={t.user.signOutA11y}
        className="kalori-sidebar-signout"
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
          cursor: 'pointer',
        }}
      >
        {t.user.signOutLabel}
      </button>
    </div>
  );
}

export default Sidebar;
