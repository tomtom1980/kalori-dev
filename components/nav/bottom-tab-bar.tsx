/**
 * <BottomTabBar /> — Mobile-only (375–767px) 56px bottom tab strip.
 *
 * Contract (ui-design.md §6.1):
 *   - 4 primary destinations (DASH / LIB / PROG / SETTINGS)
 *   - Log is NOT a tab — it launches from the FAB above the bar
 *   - Active: 2px oxblood TOP border + ivory icon/label
 *   - Inactive: dust icon/label, transparent top border
 *   - Each tab ≥ 44×44 tap target (AC)
 *   - `<nav aria-label="Primary">` landmark
 *
 * Rendering strategy: layout-level `hidden md:hidden lg:hidden` responsive
 * classes decide which nav surface shows. The component itself has no
 * viewport awareness.
 */
import Link from 'next/link';

import { t } from '@/lib/i18n/en';

import { PRIMARY_DESTINATIONS, isRouteActive } from './primary-destinations';

export interface BottomTabBarProps {
  pathname: string;
}

export function BottomTabBar({ pathname }: BottomTabBarProps) {
  return (
    <nav
      aria-label={t.nav.a11y.primary}
      data-testid="bottom-tab-bar"
      className="kalori-bottom-tab-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '56px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        backgroundColor: 'var(--color-bg-1)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-rule-strong)',
        zIndex: 40,
      }}
    >
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
            className="kalori-bottom-tab-link"
            aria-current={active ? 'page' : undefined}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              borderTopWidth: '2px',
              borderTopStyle: 'solid',
              borderTopColor: active ? 'var(--color-oxblood)' : 'transparent',
              color: active ? 'var(--color-ivory)' : 'var(--color-dust)',
              fontFamily: 'var(--font-sans)',
              fontSize: '10.5px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            {destination.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomTabBar;
