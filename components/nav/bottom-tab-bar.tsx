/**
 * <BottomTabBar /> — Mobile-only (375–767px) 72px bottom tab strip.
 *
 * Contract (ui-design.md §6.1 + §6.4):
 *   - 4 primary destinations (DASH / LIB / PROG / SETTINGS)
 *   - Log is NOT a tab — it launches from the FAB above the bar
 *   - Each tab slot renders Icon-above-Label (3-col state table §6.4)
 *   - Active: 2px oxblood TOP border + ivory icon/label
 *   - Inactive: dust icon/label, transparent top border
 *   - Each tab ≥ 44×44 tap target (AC); icon decorative (aria-hidden)
 *   - `<nav aria-label="Primary">` landmark
 *
 * Rendering strategy: layout-level `hidden md:hidden lg:hidden` responsive
 * classes decide which nav surface shows. The component itself has no
 * viewport awareness.
 *
 * Bugfix-tomi 2026-05-17 bug #1: icon column added per §6.4 state table.
 * Icons use destination-specific palette accents while labels keep the
 * dust/ivory nav state contract.
 */
import Link from 'next/link';
import type { CSSProperties } from 'react';

import { t } from '@/lib/i18n/en';

import { PRIMARY_DESTINATIONS, isRouteActive } from './primary-destinations';

export interface BottomTabBarProps {
  pathname: string;
}

type BottomTabStyle = CSSProperties & {
  '--tab-accent': string;
};

export const BOTTOM_TAB_BAR_HEIGHT_PX = 72;

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
        height: `${BOTTOM_TAB_BAR_HEIGHT_PX}px`,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        zIndex: 40,
      }}
    >
      {PRIMARY_DESTINATIONS.map((destination) => {
        const active = isRouteActive(destination.href, pathname);
        const Icon = destination.icon;
        return (
          <Link
            key={destination.href}
            // @nav-audit ignore
            // (href values are statically extracted from
            // components/nav/primary-destinations.ts)
            href={destination.href}
            data-testid={destination.testId}
            aria-current={active ? 'page' : undefined}
            // §6.4 state-table color contract — Codex R2 cascade-priority fix.
            // All three color states (inactive default / active flip /
            // focus-visible flip) live in `app/globals.css` under the
            // `.kalori-bottom-tab` scoped class. Inline `style.color`
            // would have specificity 1000 and defeat `:focus-visible`'s
            // class-level rule (specificity 010-020). `data-active`
            // routes the active flip through an attribute selector at
            // the same class-tier specificity as `:focus-visible`, so
            // the cascade resolves correctly for keyboard focus on an
            // inactive tab.
            className="kalori-bottom-tab"
            data-active={active ? 'true' : 'false'}
            style={
              {
                '--tab-accent': destination.iconAccent,
                minWidth: '44px',
                minHeight: '64px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                borderTopWidth: '2px',
                borderTopStyle: 'solid',
                borderTopColor: active ? 'var(--color-oxblood)' : 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              } as BottomTabStyle
            }
          >
            <Icon
              className="kalori-bottom-tab-icon"
              aria-hidden="true"
              focusable="false"
              width={34}
              height={30}
              strokeWidth={1.9}
              style={{ pointerEvents: 'none' }}
            />
            {destination.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomTabBar;
