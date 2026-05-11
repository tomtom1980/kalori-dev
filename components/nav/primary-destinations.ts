/**
 * Primary nav destinations — shared across Sidebar + BottomTabBar so both
 * surfaces always render the same 4 tabs in the same order.
 *
 * Log is intentionally absent: it launches as a modal from <LogFAB /> per
 * ui-design.md §6.1. A `/log` stub route exists (briefing §Nav Components)
 * so direct URL navigation doesn't 404 — but it is NOT a primary destination.
 *
 * Task 1.3: `label` + `shortLabel` route through `t.nav.*` so every
 * user-visible nav string lives in `lib/i18n/en.ts` (design-doc.md §12).
 * The rule `kalori/no-inline-user-strings` would not fire on this `.ts`
 * module (JSX-only scope), but we route through i18n anyway for
 * consistency per briefing §4 Option A.
 */
import { t } from '@/lib/i18n/en';

export interface PrimaryDestination {
  href: string;
  label: string;
  testId: string;
  shortLabel: string;
}

export const PRIMARY_DESTINATIONS: readonly PrimaryDestination[] = [
  {
    href: '/dashboard',
    label: t.nav.dashboard,
    shortLabel: t.nav.shortLabel.dashboard,
    testId: 'nav-dashboard',
  },
  {
    href: '/library',
    label: t.nav.library,
    shortLabel: t.nav.shortLabel.library,
    testId: 'nav-library',
  },
  {
    href: '/progress',
    label: t.nav.progress,
    shortLabel: t.nav.shortLabel.progress,
    testId: 'nav-progress',
  },
  {
    href: '/settings',
    label: t.nav.settings,
    shortLabel: t.nav.shortLabel.settings,
    testId: 'nav-settings',
  },
] as const;

/**
 * Is the given `pathname` considered "within" the nav destination `href`?
 * Exact match OR starts-with `${href}/` (so `/library/pho-bo` highlights
 * LIBRARY, per briefing + ui-design.md §6.6 sub-route rule).
 *
 * Root (`/`) is not a destination so we don't special-case it.
 */
export function isRouteActive(destinationHref: string, pathname: string): boolean {
  if (pathname === destinationHref) return true;
  return pathname.startsWith(`${destinationHref}/`);
}
