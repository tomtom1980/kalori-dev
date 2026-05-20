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
import { BookOpen, LayoutDashboard, LineChart, Settings, type LucideIcon } from 'lucide-react';

import { t } from '@/lib/i18n/en';

export interface PrimaryDestination {
  href: string;
  label: string;
  testId: string;
  shortLabel: string;
  iconAccent: string;
  /**
   * Lucide-react icon component rendered in the bottom tab bar (mobile, <768px).
   *
   * Bugfix-tomi 2026-05-17 bug #1 — ui-design.md §6.4 prescribes a 3-column
   * state table for each bottom-tab slot: `Icon | Label | Top bar`. Sidebar
   * (≥1280px) + Tablet Rail (768-1279px) intentionally do NOT render this
   * field — those surfaces are text-led per ui-design.md §6.2 / §6.3.
   *
   * Icon picks (final, per Phase 2 user approval gate):
   *   - Dashboard → LayoutDashboard (matches "dashboard panels" semantic)
   *   - Library   → BookOpen        (Ledger metaphor: editorial broadsheet)
   *   - Progress  → LineChart       (matches /progress chart-heavy route;
   *                                  v1.8.0 exports LineChart as alias
   *                                  for ChartLine — see lucide-react v1)
   *   - Settings  → Settings        (no controversy)
   */
  icon: LucideIcon;
}

export const PRIMARY_DESTINATIONS: readonly PrimaryDestination[] = [
  {
    href: '/dashboard',
    label: t.nav.dashboard,
    shortLabel: t.nav.shortLabel.dashboard,
    testId: 'nav-dashboard',
    icon: LayoutDashboard,
    iconAccent: 'var(--color-ember)',
  },
  {
    href: '/library',
    label: t.nav.library,
    shortLabel: t.nav.shortLabel.library,
    testId: 'nav-library',
    icon: BookOpen,
    iconAccent: 'var(--color-ochre)',
  },
  {
    href: '/progress',
    label: t.nav.progress,
    shortLabel: t.nav.shortLabel.progress,
    testId: 'nav-progress',
    icon: LineChart,
    iconAccent: 'var(--color-moss)',
  },
  {
    href: '/settings',
    label: t.nav.settings,
    shortLabel: t.nav.shortLabel.settings,
    testId: 'nav-settings',
    icon: Settings,
    iconAccent: 'var(--color-slate)',
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
