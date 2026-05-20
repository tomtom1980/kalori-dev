/**
 * Unit tests for `lib/library/sketch-pending` — the isomorphic helper
 * that decides whether a library card should render the spinner
 * placeholder instead of the letter-mark fallback.
 */
import { describe, expect, it } from 'vitest';

import { PENDING_SKETCH_WINDOW_MS, isItemPendingSketch } from '@/lib/library/sketch-pending';

const NOW = Date.parse('2026-05-16T16:00:00Z');

function input(overrides: Partial<Parameters<typeof isItemPendingSketch>[0]>) {
  return {
    thumbnail_url: null,
    thumbnail_kind: null,
    created_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('isItemPendingSketch', () => {
  it('returns true for a brand-new thumbnail-less item', () => {
    expect(isItemPendingSketch(input({}), NOW)).toBe(true);
  });

  it('returns true while still inside the pending window', () => {
    const created = new Date(NOW - (PENDING_SKETCH_WINDOW_MS - 1)).toISOString();
    expect(isItemPendingSketch(input({ created_at: created }), NOW)).toBe(true);
  });

  it('returns false once the pending window has elapsed', () => {
    const created = new Date(NOW - PENDING_SKETCH_WINDOW_MS).toISOString();
    expect(isItemPendingSketch(input({ created_at: created }), NOW)).toBe(false);
  });

  it('returns false when a thumbnail_url is set (sketch already rendered)', () => {
    expect(isItemPendingSketch(input({ thumbnail_url: 'https://example.com/x.webp' }), NOW)).toBe(
      false,
    );
  });

  it('returns false once thumbnail_kind is committed (sketch or photo)', () => {
    expect(isItemPendingSketch(input({ thumbnail_kind: 'sketch' }), NOW)).toBe(false);
    expect(isItemPendingSketch(input({ thumbnail_kind: 'photo' }), NOW)).toBe(false);
  });

  it('returns false for an unparseable created_at', () => {
    expect(isItemPendingSketch(input({ created_at: 'not-a-date' }), NOW)).toBe(false);
  });

  it('uses Date.now() as the default clock when nowMs is omitted', () => {
    // Brand-new item with created_at = current real time → must be pending.
    const fresh = input({ created_at: new Date().toISOString() });
    expect(isItemPendingSketch(fresh)).toBe(true);
  });
});
