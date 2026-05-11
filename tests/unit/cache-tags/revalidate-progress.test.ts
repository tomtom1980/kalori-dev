/**
 * @vitest-environment node
 *
 * Task 4.5 R1 — `revalidateAllProgressRanges` helper unit test.
 *
 * Helper consolidates the canonical 6-range progress invalidation set so that
 * `app/api/library/merge/route.ts` (Pass 1 S1) AND `app/api/entries/save/route.ts`
 * (Pass 2 C2) cannot drift apart on the supported range tags. Codex flagged
 * both routes for emitting only a partial subset (24h/7d/30d) — missing D,
 * 90d, 1y. The helper enforces the full canonical set: `['24h','D','7d','30d','90d','1y']`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGS } from '@/lib/cache/tags';

const revalidateTagSpy = vi.fn();

vi.mock('next/cache', () => ({
  revalidateTag: (tag: string, profile?: 'max' | 'default') => revalidateTagSpy(tag, profile),
}));

describe('revalidateAllProgressRanges helper (Task 4.5 R1)', () => {
  beforeEach(() => {
    revalidateTagSpy.mockReset();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('emits revalidateTag for ALL 6 canonical progress ranges (24h, D, 7d, 30d, 90d, 1y) with max profile', async () => {
    const { revalidateAllProgressRanges } = await import('@/lib/cache/revalidate-progress');
    revalidateAllProgressRanges('user-1');

    // 6 calls in total — once per canonical range.
    expect(revalidateTagSpy).toHaveBeenCalledTimes(6);

    const expectedTags = [
      TAGS.userProgress('user-1', '24h'),
      TAGS.userProgress('user-1', 'D'),
      TAGS.userProgress('user-1', '7d'),
      TAGS.userProgress('user-1', '30d'),
      TAGS.userProgress('user-1', '90d'),
      TAGS.userProgress('user-1', '1y'),
    ];
    const actualTags = revalidateTagSpy.mock.calls.map((c) => c[0]);
    for (const tag of expectedTags) {
      expect(actualTags).toContain(tag);
    }

    // Every call uses the 'max' profile (matches existing call sites — the
    // `'max'` profile means "freshest possible — re-fetch on next request").
    for (const call of revalidateTagSpy.mock.calls) {
      expect(call[1]).toBe('max');
    }
  });

  it('scopes tags to the passed userId — never leaks across users', async () => {
    const { revalidateAllProgressRanges } = await import('@/lib/cache/revalidate-progress');
    revalidateAllProgressRanges('user-A');
    const calls = revalidateTagSpy.mock.calls.map((c) => c[0] as string);
    for (const tag of calls) {
      expect(tag.startsWith('user:user-A:')).toBe(true);
    }
  });
});
