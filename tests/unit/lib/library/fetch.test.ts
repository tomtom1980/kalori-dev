/**
 * @vitest-environment node
 *
 * Bug 3 (library overhaul 2026-05-16) — unit tests for SIGN_LIMIT raise.
 *
 * Contract:
 *   - `fetchLibraryPage(uid)` runs a lazy tombstone sweep, SELECTs active
 *     rows ordered by `last_used_at DESC NULLS LAST`, and signs each row's
 *     `thumbnail_url` storage path with a 1-hour TTL.
 *   - Per-render signing fan-out is bounded by `SIGN_LIMIT`. Rows beyond
 *     that index have `thumbnail_url` set to `null` so the letter-mark
 *     fallback renders.
 *
 * Pre-fix cap: SIGN_LIMIT = 10. Pages 2+ of a >10-item library showed
 * letter-marks instead of sketches/photos — user-visible regression.
 * Post-fix cap: SIGN_LIMIT = 500. Covers a multi-year single-user library
 * comfortably; per-render JWT-sign cost is bounded (no network roundtrip
 * since Supabase signed URLs are JWT-only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Row = {
  id: string;
  client_id: string;
  display_name: string;
  normalized_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: Record<string, unknown>;
  thumbnail_url: string | null;
  thumbnail_kind: 'photo' | 'sketch' | null;
  log_count: number;
  last_used_at: string | null;
  user_edited_flag: boolean;
  created_from: 'text' | 'photo' | 'manual';
  created_at: string;
};

function buildRow(index: number): Row {
  return {
    id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    client_id: `11111111-1111-4000-8000-${index.toString().padStart(12, '0')}`,
    display_name: `Item ${index}`,
    normalized_name: `item ${index}`,
    default_portion: 100,
    default_unit: 'g',
    nutrition: { kcal: 100 },
    thumbnail_url: `u-1/sketch_item_${index}.webp`,
    thumbnail_kind: 'sketch',
    log_count: 0,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-05-16T00:00:00Z',
  };
}

function buildSupabaseMock(rows: Row[]) {
  const signSpy = vi.fn(async (path: string, _ttl: number) => ({
    data: { signedUrl: `https://signed.test/${path}` },
    error: null,
  }));
  const client = {
    from: (_table: string) => ({
      // DELETE chain for the lazy tombstone sweep.
      delete: () => ({
        eq: () => ({
          not: () => ({
            lt: () => ({
              select: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
      // SELECT chain for the active list.
      select: () => ({
        eq: () => ({
          is: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: signSpy }) },
  };
  return { client, signSpy };
}

describe('fetchLibraryPage — SIGN_LIMIT cap', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('Test F: signs items at positions 11-500 (previously null past 10)', async () => {
    // Build 500 rows; row indices 0-499 should ALL receive signed URLs
    // under the new cap (was null'd-out for indices 10+ under old cap).
    const rows = Array.from({ length: 500 }, (_, i) => buildRow(i));
    const { client, signSpy } = buildSupabaseMock(rows);
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage('u-1');

    expect(items).toHaveLength(500);

    // Spot-check positions previously null'd under the old cap of 10.
    expect(items[10]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_10.webp`);
    expect(items[100]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_100.webp`);
    expect(items[250]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_250.webp`);
    expect(items[499]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_499.webp`);

    // Boundary check: every row had its thumbnail signed (no null fallout
    // within the 500 cap).
    const signedCount = items.filter((it) => it.thumbnail_url !== null).length;
    expect(signedCount).toBe(500);
    expect(signSpy).toHaveBeenCalledTimes(500);
  });

  it('Test G: items at position 501+ fall back to thumbnail_url=null past the cap', async () => {
    // Build 502 rows; rows at indices 0..499 should be signed, rows at
    // indices 500..501 should be null'd out (one past the SIGN_LIMIT cap).
    const rows = Array.from({ length: 502 }, (_, i) => buildRow(i));
    const { client, signSpy } = buildSupabaseMock(rows);
    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage('u-1');

    expect(items).toHaveLength(502);

    // First 500 rows signed.
    expect(items[0]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_0.webp`);
    expect(items[499]!.thumbnail_url).toBe(`https://signed.test/u-1/sketch_item_499.webp`);

    // Rows 500 and 501 beyond the cap → null'd-out per Round-3 fallback.
    expect(items[500]!.thumbnail_url).toBeNull();
    expect(items[501]!.thumbnail_url).toBeNull();

    // Only 500 signs were issued (not 502).
    expect(signSpy).toHaveBeenCalledTimes(500);
  });

  // Bugfix R1 C2 — concurrency cap. Verify the library fetch helper does
  // not fan out 500 simultaneous signing calls. Max-in-flight must stay
  // bounded by the helper's cap (default 20).
  it('Test H: signing fan-out is bounded by concurrency cap (max in-flight <= 20)', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => buildRow(i));

    let inFlight = 0;
    let maxInFlight = 0;
    const slowSign = vi.fn(async (path: string, _ttl: number) => {
      inFlight += 1;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      // Yield to let queued signs pile up.
      await new Promise((r) => setTimeout(r, 3));
      inFlight -= 1;
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    });

    const client = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            not: () => ({ lt: () => ({ select: async () => ({ data: [], error: null }) }) }),
          }),
        }),
        select: () => ({
          eq: () => ({ is: () => ({ order: async () => ({ data: rows, error: null }) }) }),
        }),
      }),
      storage: { from: () => ({ createSignedUrl: slowSign }) },
    };

    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage('u-1');

    expect(items).toHaveLength(100);
    expect(slowSign).toHaveBeenCalledTimes(100);
    // Critical assertion — fan-out must be bounded.
    expect(maxInFlight).toBeLessThanOrEqual(20);
  });

  // Bugfix R1 C2 — graceful degradation. If a single thumbnail signing
  // call throws, the whole render must NOT crash — the row falls back
  // to thumbnail_url=null (letter-mark renders) and the rest proceed.
  it('Test I: per-item signing failure degrades to null, page render survives', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => buildRow(i));

    let callIndex = 0;
    const signFn = vi.fn(async (path: string, _ttl: number) => {
      const idx = callIndex++;
      if (idx === 2) throw new Error('transient supabase storage error');
      return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
    });
    const client = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            not: () => ({ lt: () => ({ select: async () => ({ data: [], error: null }) }) }),
          }),
        }),
        select: () => ({
          eq: () => ({ is: () => ({ order: async () => ({ data: rows, error: null }) }) }),
        }),
      }),
      storage: { from: () => ({ createSignedUrl: signFn }) },
    };

    vi.doMock('@/lib/supabase/server', () => ({ getServerSupabase: async () => client }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage('u-1');

    expect(items).toHaveLength(5);
    // Exactly one item has null thumbnail (the failed sign), others have
    // signed URLs. The non-failing items retain their original IDs.
    expect(items.filter((it) => it.thumbnail_url === null)).toHaveLength(1);
    expect(items.filter((it) => typeof it.thumbnail_url === 'string')).toHaveLength(4);
  });
});
