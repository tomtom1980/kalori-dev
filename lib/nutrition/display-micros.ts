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
 *
 * Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
 * RDA-unknown rows (rda === null OR rda === 0) now return `'unknown'`
 * instead of `'low'`. This is the discriminator the dashboard renderer
 * branches on to distinguish "no daily reference" rows (sugar, caffeine,
 * orphan keys) from actually-low measurable rows. The library surface
 * already handled `rda === null` separately via a `dvPct === null` branch;
 * this change brings the dashboard into parity by surfacing the same
 * semantic distinction through the status enum.
 */
export function microStatus(value: number, rda: number | null, ul?: number): MicroStatus {
  if (rda === null || rda === 0) return 'unknown';
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

// ---------------------------------------------------------------------------
// sortAndFilterMicrosByRdaPct — Bug 1 (bugfix-tomi 2026-05-17-micros-display-
// consistency). Single source of truth for the user-articulated cross-surface
// display rule:
//
//   1. Sort: descending by integer %RDA.
//   2. Filter: hide rows below `minPct` (default 1).
//   3. RDA-unknown (pct === null) rows are NOT filtered and sort to the END
//      (after all RDA-having rows), stable-sorted alphabetically by
//      `displayName`, so sugar / cholesterol / similar non-RDA quantities
//      remain visible even though they have no reference percent.
//
// Surface bindings:
//   - Dashboard `MicronutrientPanel` (via `aggregateMicros`):
//       sortAndFilterMicrosByRdaPct(rows)  // default { minPct: 1, includeUnknownRda: true }
//   - Confirmation `<ConfirmationItemMicros />` (library-only edit):
//       sortAndFilterMicrosByRdaPct(rows, { minPct: 0, includeUnknownRda: true })
//       — editable inputs must remain visible at every percent, including 0%.
//   - Library `<MicrosReadOnly />` view-mode:
//       sortAndFilterMicrosByRdaPct(rows)  // default
//       — sugar / orphan rows surface via the RDA-unknown branch (no
//       hardcoded carve-out needed; the rule does the work).
//
// Pure. No I/O. Row-shape agnostic via generic `T extends DisplayMicroRow` so
// every caller preserves its native row fields.
// ---------------------------------------------------------------------------

/**
 * Minimum row shape consumed by `sortAndFilterMicrosByRdaPct`. Callers may
 * extend with any additional fields (`unit`, `consumed`, `contributions`,
 * raw micro `code`, etc.) — the helper passes them through untouched.
 *
 * Fields:
 *   - `key` — stable identity for React keys / testids. Caller-defined shape
 *     (raw key, canonical code, display name, etc.).
 *   - `pct` — integer percent of RDA, OR `null` when the row's key has no
 *     known RDA reference. `null` rows survive filtering (unless
 *     `includeUnknownRda: false`) and sort to the end.
 *   - `displayName` — human-readable label. Used ONLY to stable-sort
 *     RDA-unknown rows among themselves; the helper does no display work.
 */
export interface DisplayMicroRow {
  key: string;
  pct: number | null;
  displayName: string;
}

export interface SortAndFilterMicrosOptions {
  /**
   * Filter threshold in integer percent. Rows with pct < minPct are dropped.
   * Default 1 (per user rule "anything which is less than 1% should not be
   * displayed"). Pass 0 to disable filtering (editable surfaces).
   */
  minPct?: number;
  /**
   * When true, rows with `pct === null` survive the filter and sort to the
   * end. Default `true` — the user rule explicitly keeps non-RDA quantities
   * (sugar etc.) visible. Pass `false` to drop them entirely (dashboard
   * variant that wants ONLY measurable rows).
   */
  includeUnknownRda?: boolean;
}

export function sortAndFilterMicrosByRdaPct<T extends DisplayMicroRow>(
  rows: T[],
  options?: SortAndFilterMicrosOptions,
): T[] {
  const minPct = options?.minPct ?? 1;
  const includeUnknownRda = options?.includeUnknownRda ?? true;

  // Partition the input into RDA-having and RDA-unknown buckets BEFORE
  // sorting. Use index-stable filtering so equal-pct rows preserve their
  // original input order — JS Array#sort is stable in modern engines but the
  // partition keeps the contract explicit and tested.
  const rdaHaving: T[] = [];
  const rdaUnknown: T[] = [];
  for (const row of rows) {
    if (row.pct === null) {
      rdaUnknown.push(row);
    } else if (row.pct >= minPct) {
      rdaHaving.push(row);
    }
  }

  rdaHaving.sort((a, b) => {
    // Non-null assertion is sound: only RDA-having rows reach this branch
    // and the partition above guarantees `pct !== null` for them.
    return (b.pct as number) - (a.pct as number);
  });

  if (!includeUnknownRda) {
    return rdaHaving;
  }

  // Stable-sort RDA-unknown rows alphabetically by displayName so the user
  // sees a predictable order at the end of the list. localeCompare gives a
  // locale-aware sort suitable for cross-locale displays.
  rdaUnknown.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return [...rdaHaving, ...rdaUnknown];
}
