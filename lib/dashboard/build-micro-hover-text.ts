/**
 * `lib/dashboard/build-micro-hover-text.ts` — Phase 2B hover-tooltip helper.
 *
 * Mirrors `buildHoverText` from `MacroBars.tsx` but is unit-aware: micros
 * carry their unit string on `MicroRow.unit` + each `MicroContribution`, so
 * "Top contributors: Pho 120mg, Bread 60mg" needs the `unit` suffix appended
 * after each amount.
 *
 * The helper is extracted into its own module so the tooltip copy can be
 * unit-tested without booting Radix + React in jsdom. The interactive
 * client component (`MicrosOverflowToggle.tsx`) imports + calls it.
 */
import { truncateItemName } from '@/lib/dashboard/build-hover-text-utils';
import { t } from '@/lib/i18n/en';
import type { MicroRow } from '@/lib/dashboard/types';

/** Format a numeric amount the same way macros do: integers stay integer, decimals get 1 fractional digit. */
function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Build the tooltip / `title` text shown on micro-row hover.
 *
 * - 0 contributors → "No <name> entries yet."
 * - 1..3 contributors → "Top contributors: <name> <amount><unit>, ..."
 * - 4+ contributors → only the top 3 are listed.
 *
 * Contributor names are truncated to 20 graphemes via `truncateItemName`
 * (grapheme-aware) so the tooltip stays under its 280px maxWidth even at
 * 768–900px viewport widths where MicronutrientPanel sits in a half-width
 * column next to WaterTracker.
 *
 * Robust to legacy fixtures where `contributions` is undefined.
 */
export function buildMicroHoverText(row: MicroRow): string {
  const contribs = row.contributions ?? [];
  if (contribs.length === 0) {
    return t.dashboard.micro.breakdownHoverEmpty.replace('{name}', row.name);
  }
  const items = contribs
    .slice(0, 3)
    .map((c) => `${truncateItemName(c.itemName)} ${formatAmount(c.amount)}${c.unit ?? ''}`)
    .join(', ');
  return t.dashboard.micro.breakdownHoverTop.replace('{items}', items);
}
