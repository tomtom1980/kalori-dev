/**
 * `lib/nutrition/display-micros.ts` — Task 3.5 micronutrient display helpers.
 *
 * Priority constant (briefing §5.6 line 382): protein > iron > vitamin D >
 * vitamin C > calcium > fiber > rest alphabetical. Used by the dashboard's
 * MicronutrientPanel to order the last-7-days union of micros.
 *
 * Status thresholds (ux-specialist §2 micro.* + briefing §5.6):
 *   - low   < 50% RDA
 *   - mid   50-100%
 *   - good  100-120%
 *   - over  >120% OR exceeds UL (when provided)
 */
import type { MicroStatus } from '@/lib/dashboard/types';

/**
 * Canonical priority. First 6 are explicitly ordered; any row whose name
 * is not in this prefix is sorted alphabetically after.
 */
export const MICRO_PRIORITY: readonly string[] = [
  'protein',
  'iron',
  'vitamin D',
  'vitamin C',
  'calcium',
  'fiber',
] as const;

/** Lookup of priority index for quick sort. Missing names → Infinity. */
const PRIORITY_INDEX: Map<string, number> = new Map(
  MICRO_PRIORITY.map((name, idx) => [name.toLowerCase(), idx]),
);

/** Returns the integer percent of RDA; null/zero RDA → 0; clamps negatives. */
export function formatMicroPercent(value: number, rda: number | null): number {
  if (rda === null || rda === 0) return 0;
  if (value < 0) return 0;
  return Math.round((value / rda) * 100);
}

/**
 * Status bucket for a micro value against its RDA + optional UL.
 * `over` fires if value > 120% RDA OR (ul provided AND value > ul).
 */
export function microStatus(value: number, rda: number | null, ul?: number): MicroStatus {
  if (rda === null || rda === 0) return 'low';
  if (ul !== undefined && value > ul) return 'over';
  const pct = (value / rda) * 100;
  if (pct > 120) return 'over';
  if (pct >= 100) return 'good';
  if (pct >= 50) return 'mid';
  return 'low';
}

/**
 * Sort micros by priority: the 6-element prefix first in order, the rest
 * alphabetical. Case-insensitive on names. Stable for tied priorities.
 */
export function sortMicrosByPriority<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ai = PRIORITY_INDEX.get(a.name.toLowerCase()) ?? Infinity;
    const bi = PRIORITY_INDEX.get(b.name.toLowerCase()) ?? Infinity;
    if (ai !== bi) return ai - bi;
    // Both outside the priority prefix → alphabetical.
    if (ai === Infinity) return a.name.localeCompare(b.name);
    return 0;
  });
}
