/**
 * @vitest-environment node
 *
 * Task 3.4 — `DELETE /api/entries/[id]` unit tests.
 *
 * Contract (synthesis §5.2):
 *   - Path param `id` is a UUID; validated via Zod.
 *   - Auth required.
 *   - Pre-delete SELECT to resolve day-bucket for cache-tag invalidation.
 *   - RLS scopes per-user; cross-user delete → 404.
 *   - revalidateTag(TAGS.userEntries(uid, day)) on success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGS } from '@/lib/cache/tags';

type Row = Record<string, unknown>;

function buildMocks(opts: { row?: Row | null } = {}) {
  const calls = { revalidated: [] as string[], deletedId: null as string | null };
  const row =
    opts.row === null
      ? null
      : (opts.row ?? {
          id: 'row-1',
          user_id: 'u-1',
          logged_at: '2026-04-21T10:00:00.000Z',
        });

  const profileTable = {
    // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at (fail-closed).
    select: (cols?: string) => ({
      eq: () => ({
        single: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
        },
        maybeSingle: async () => {
          if (cols && cols.includes('deleting_at')) {
            return { data: { deleting_at: null }, error: null };
          }
          return { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null };
        },
      }),
    }),
  };

  const entriesTable = {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
    delete: () => ({
      eq: (_k: string, v: string) => ({
        eq: () => {
          calls.deletedId = v;
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };

  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileTable;
    if (table === 'food_entries') return entriesTable;
    throw new Error(`unknown table: ${table}`);
  });

  const getUser = vi.fn(async () => ({
    data: { user: { id: 'u-1' } },
    error: null,
  }));

  return { from, getUser, calls };
}

describe('DELETE /api/entries/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  async function callDelete(id: string): Promise<Response> {
    const { DELETE } = await import('@/app/api/entries/[id]/route');
    return DELETE(new Request(`http://kalori.test/api/entries/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
  }

  it('200 with ok + fires revalidateTag for the row-day', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await callDelete('11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    // 2026-04-21 10:00 UTC = 17:00 VN → day 2026-04-21
    expect(calls.revalidated).toContain('user:u-1:entries:2026-04-21');
  });

  // Task 4.5 R2 S3 — DELETE must invalidate ALL 6 canonical progress range
  // tags via the shared `revalidateAllProgressRanges` helper. Pre-fix the
  // route emitted only 3 (24h/7d/30d), leaving D/90d/1y stale until natural
  // revalidation.
  it('Task 4.5 R2 S3 — DELETE invalidates all 6 progress range tags', async () => {
    const { from, getUser, calls } = buildMocks();
    const revalidateTag = vi.fn((tag: string) => calls.revalidated.push(tag));
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await callDelete('11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '24h'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', 'D'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '7d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '30d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '90d'));
    expect(calls.revalidated).toContain(TAGS.userProgress('u-1', '1y'));
  });

  it('404 when row not found (RLS hides cross-user rows)', async () => {
    const { from, getUser } = buildMocks({ row: null });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await callDelete('11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
  });

  it('400 when id is not a UUID', async () => {
    const { from, getUser } = buildMocks();
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await callDelete('not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('401 when unauthenticated', async () => {
    const { from } = buildMocks();
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'no session' },
    }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await callDelete('11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(401);
  });
});
