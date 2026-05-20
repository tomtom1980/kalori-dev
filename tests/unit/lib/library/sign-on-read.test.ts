/**
 * @vitest-environment node
 *
 * Codex Round 1 Critical #1 — sign-on-read coverage for the library
 * read helpers. Asserts that:
 *
 *   - `fetchLibraryPage` signs sketch rows that store a storage path
 *     in `thumbnail_url` and returns a temporary URL.
 *   - `getLibraryItemById` does the same for the single-item route.
 *   - Legacy URLs (pre-fix rows) pass through unchanged so a partial
 *     deployment doesn't break the read path.
 *
 * Mocks supabase + the signer so we can observe the call paths without
 * touching the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: (fn: unknown) => fn };
});

const UID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lib-1',
    client_id: 'cid-1',
    display_name: 'Avocado',
    normalized_name: 'avocado',
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 200, macros: { protein_g: 2, carbs_g: 10, fat_g: 18, fiber_g: 7 } },
    thumbnail_url: null as string | null,
    thumbnail_kind: null as string | null,
    log_count: 0,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-05-15T00:00:00Z',
    ...overrides,
  };
}

function makeSupabase(rowOrRows: unknown, opts: { signError?: boolean } = {}) {
  const signSpy = vi.fn(async (path: string, _ttl: number) => {
    if (opts.signError) return { data: null, error: { message: 'not_found' } };
    return { data: { signedUrl: `https://signed.test/${path}` }, error: null };
  });

  const supabase = {
    from: () => ({
      delete: () => ({
        eq: () => ({
          not: () => ({ lt: () => ({ select: async () => ({ data: [], error: null }) }) }),
        }),
      }),
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => {
                const row = Array.isArray(rowOrRows) ? (rowOrRows[0] ?? null) : rowOrRows;
                return { data: row, error: null };
              },
              order: () => ({
                then: (resolve: (v: unknown) => void) => {
                  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
                  resolve({ data: rows, error: null });
                },
              }),
            }),
          }),
          is: () => ({
            order: () => ({
              then: (resolve: (v: unknown) => void) => {
                const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
                resolve({ data: rows, error: null });
              },
            }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: signSpy,
      }),
    },
  };

  return { supabase, signSpy };
}

describe('Codex Critical #1 — fetchLibraryPage signs sketch paths on read', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('signs storage paths and returns a temporary URL', async () => {
    const rows = [
      makeRow({
        id: 'lib-sketch',
        thumbnail_url: `${UID}/sketch_cid-1.webp`,
        thumbnail_kind: 'sketch',
      }),
    ];
    const { supabase, signSpy } = makeSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);
    expect(items).toHaveLength(1);
    expect(items[0]!.thumbnail_url).toBe(`https://signed.test/${UID}/sketch_cid-1.webp`);
    expect(signSpy).toHaveBeenCalledOnce();
    const [, ttl] = signSpy.mock.calls[0]!;
    expect(ttl).toBe(60 * 60);
  });

  it('passes legacy http(s) URLs through unchanged (back-compat)', async () => {
    const legacyUrl = 'https://signed.legacy/old-sketch.webp';
    const rows = [
      makeRow({
        id: 'lib-legacy',
        thumbnail_url: legacyUrl,
        thumbnail_kind: 'sketch',
      }),
    ];
    const { supabase, signSpy } = makeSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);
    expect(items[0]!.thumbnail_url).toBe(legacyUrl);
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('rows with null thumbnail_url stay null (letter-mark renderer takes over)', async () => {
    const rows = [makeRow({ id: 'lib-no-thumb', thumbnail_url: null })];
    const { supabase, signSpy } = makeSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);
    expect(items[0]!.thumbnail_url).toBeNull();
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('sign-failure degrades gracefully to null (renderer falls back to letter-mark)', async () => {
    const rows = [
      makeRow({
        id: 'lib-sketch',
        thumbnail_url: `${UID}/sketch_cid-1.webp`,
        thumbnail_kind: 'sketch',
      }),
    ];
    const { supabase } = makeSupabase(rows, { signError: true });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);
    expect(items[0]!.thumbnail_url).toBeNull();
  });
});

/**
 * Codex Round 2 R2-I1 / Round 3 — pagination-aware signing.
 *
 * Round-1 signs every row's thumbnail via `Promise.all` BEFORE returning
 * to the RSC. A 100-item library produces 100 sequential-fanout
 * `createSignedUrl` calls per `/library` render, even though the client
 * paginates to 10 items per page. Round-3 fix: sign only the first
 * `signLimit` rows (matches client-side page size); rows beyond that
 * have `thumbnail_url` set to null so the letter-mark fallback renders.
 *
 * UX trade-off: pages 2+ show letter-mark thumbnails instead of full
 * sketches. This is acceptable for the MVP performance fix; a future
 * iteration can move pagination state to the URL + revalidate on page
 * navigation to fetch a fresh signed batch. Documented in the fix
 * report.
 */
describe('Codex R2-I1 — fetchLibraryPage pagination-aware signing', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  function makeMultiRowSupabase(rows: ReturnType<typeof makeRow>[]) {
    const signSpy = vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.test/${path}` },
      error: null,
    }));
    const supabase = {
      from: () => ({
        delete: () => ({
          eq: () => ({
            not: () => ({
              lt: () => ({ select: async () => ({ data: [], error: null }) }),
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                then: (resolve: (v: unknown) => void) => {
                  resolve({ data: rows, error: null });
                },
              }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ createSignedUrl: signSpy }) },
    };
    return { supabase, signSpy };
  }

  it('signs all rows up to the 500-row cap (Bug 3 raised cap from 10 to 500)', async () => {
    // Bug 3 (library overhaul 2026-05-16): SIGN_LIMIT raised from 10 →
    // 500 to cover a multi-year single-user library. 100 sketch rows now
    // sign ALL 100 (no null fallout under the cap).
    const rows = Array.from({ length: 100 }, (_, i) =>
      makeRow({
        id: `lib-${i}`,
        client_id: `cid-${i}`,
        thumbnail_url: `${UID}/sketch_cid-${i}.webp`,
        thumbnail_kind: 'sketch',
      }),
    );
    const { supabase, signSpy } = makeMultiRowSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);

    expect(items).toHaveLength(100);
    // Post-Bug-3 cap covers all 100 rows.
    expect(signSpy).toHaveBeenCalledTimes(100);

    // Every row has a signed URL — no null fallout under SIGN_LIMIT=500.
    for (let i = 0; i < 100; i++) {
      expect(items[i]!.thumbnail_url).toBe(`https://signed.test/${UID}/sketch_cid-${i}.webp`);
    }
  });

  it('signs all rows when library size <= signLimit (no degradation for small libraries)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({
        id: `lib-${i}`,
        client_id: `cid-${i}`,
        thumbnail_url: `${UID}/sketch_cid-${i}.webp`,
        thumbnail_kind: 'sketch',
      }),
    );
    const { supabase, signSpy } = makeMultiRowSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);
    expect(items).toHaveLength(5);
    expect(signSpy).toHaveBeenCalledTimes(5);
    items.forEach((it, i) => {
      expect(it.thumbnail_url).toBe(`https://signed.test/${UID}/sketch_cid-${i}.webp`);
    });
  });

  it('null thumbnails do not count against the signLimit budget', async () => {
    // Mix: 5 rows with thumbnails, 10 rows without, 7 with thumbnails =
    // 12 thumbnail-bearing rows total + 10 null rows = 22 rows. With
    // Bug 3's raised cap of 500 the entire 22-row mix sits well under
    // budget — `signSpy` is called only for thumbnail-bearing rows
    // (12 total).
    const rows: ReturnType<typeof makeRow>[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push(
        makeRow({ id: `t-${i}`, thumbnail_url: `${UID}/p${i}.webp`, thumbnail_kind: 'sketch' }),
      );
    }
    for (let i = 0; i < 10; i++) {
      rows.push(makeRow({ id: `n-${i}`, thumbnail_url: null }));
    }
    for (let i = 0; i < 7; i++) {
      rows.push(
        makeRow({ id: `t2-${i}`, thumbnail_url: `${UID}/p2-${i}.webp`, thumbnail_kind: 'sketch' }),
      );
    }

    const { supabase, signSpy } = makeMultiRowSupabase(rows);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { fetchLibraryPage } = await import('@/lib/library/fetch');
    const { items } = await fetchLibraryPage(UID);

    expect(items).toHaveLength(22);
    // Bug 3: cap raised to 500. With only 12 thumbnail rows, all sign.
    // Null rows short-circuit before reaching the signer.
    expect(signSpy).toHaveBeenCalledTimes(12);
  });
});

describe('Codex Critical #1 — getLibraryItemById signs path on read', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('signs storage path and returns a temporary URL', async () => {
    const row = makeRow({
      id: 'lib-detail',
      thumbnail_url: `${UID}/sketch_cid-1.webp`,
      thumbnail_kind: 'sketch',
    });
    const { supabase, signSpy } = makeSupabase(row);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { getLibraryItemById } = await import('@/lib/library/getItem');
    const item = await getLibraryItemById('lib-detail', UID);
    expect(item).not.toBeNull();
    expect(item!.thumbnail_url).toBe(`https://signed.test/${UID}/sketch_cid-1.webp`);
    expect(signSpy).toHaveBeenCalledOnce();
  });

  it('returns null when row does not exist (no signing attempted)', async () => {
    const { supabase, signSpy } = makeSupabase(null);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabase,
    }));

    const { getLibraryItemById } = await import('@/lib/library/getItem');
    const item = await getLibraryItemById('lib-missing', UID);
    expect(item).toBeNull();
    expect(signSpy).not.toHaveBeenCalled();
  });
});
