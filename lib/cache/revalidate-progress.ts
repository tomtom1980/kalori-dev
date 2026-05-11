/**
 * Task 4.5 R1 — canonical progress-range cache invalidation helper.
 *
 * Codex Phase 4 review flagged TWO sites that were emitting only a partial
 * subset of the canonical progress range tags after a mutation:
 *   - `app/api/library/merge/route.ts` (Pass 1 S1)
 *   - `app/api/entries/save/route.ts`  (Pass 2 C2)
 *
 * Both routes were enumerating `['24h','7d','30d']` only — leaving the D,
 * 90d, and 1y range caches stale until the next natural revalidation. Since
 * the canonical range set lives in `lib/cache/tags.ts` (TAGS.userProgress
 * union: `'24h' | 'D' | '7d' | '30d' | '90d' | '1y'`), the duplicate
 * enumeration sites were a future-bug magnet — extending the union without
 * updating both routes would silently regress correctness.
 *
 * This helper centralizes the full canonical set. Every mutation that
 * affects ANY progress aggregate MUST go through `revalidateAllProgressRanges`.
 *
 * Profile note: every call uses `'max'` (the freshest setting, matching the
 * existing `revalidateTag(..., 'max')` calls in both routes prior to this
 * consolidation). Higher-cost than `'default'`, but progress is dashboard-
 * critical and aggregates are cheap to recompute.
 */
import { revalidateTag } from 'next/cache';

import { TAGS } from '@/lib/cache/tags';

/**
 * Canonical progress range set — keep exactly in sync with the
 * `TAGS.userProgress` union in `lib/cache/tags.ts`.
 */
const PROGRESS_RANGES = ['24h', 'D', '7d', '30d', '90d', '1y'] as const;

/**
 * Invalidate every per-user progress-range cache tag. Called by mutation
 * routes whose work affects aggregated entries / weight / nutrition that
 * the `/progress` page renders across any range.
 */
export function revalidateAllProgressRanges(userId: string): void {
  for (const range of PROGRESS_RANGES) {
    revalidateTag(TAGS.userProgress(userId, range), 'max');
  }
}
