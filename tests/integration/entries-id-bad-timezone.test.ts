/**
 * @vitest-environment node
 *
 * Task C.CODEX Round 1 Finding (HIGH) — `/api/entries/[id]` (PATCH + DELETE)
 * profile timezone normalization parity with `/api/library/[id]/log-now`.
 *
 * Symptom: both PATCH (line ~99) and DELETE (line ~183) read
 * `profiles.timezone` as `string` and pass the raw value into
 * `userTzDayFrom`. A malformed legacy value would throw uncontrolled before
 * a controlled JSON response is returned, leaving the user unable to
 * edit/delete entries while Log Now still works (the asymmetry the Codex
 * finding called out).
 *
 * Contract (matches log-now's behavior):
 *   - Bad/malformed IANA → fall back to UTC, route proceeds normally.
 *   - NEVER throw 500 from inside `userTzDayFrom`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const ROW_ID = '22222222-2222-4222-8222-222222222222';

describe('PATCH /api/entries/[id] — profile timezone normalization (Codex C.CODEX HIGH)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildPatchMocks(badTimezone: unknown) {
    const entryRow: Row = {
      id: ROW_ID,
      logged_at: '2026-05-10T10:00:00.000Z',
    };
    const updatedRow: Row = {
      ...entryRow,
      meal_category: 'lunch',
      items: [{ name: 'rice', portion: 1, unit: 'bowl', kcal: 200 }],
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols?: string) => ({
            eq: () => ({
              single: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                return { data: { timezone: badTimezone }, error: null };
              },
              maybeSingle: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                return { data: { timezone: badTimezone }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'food_entries') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: entryRow, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: updatedRow, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
    return { from, getUser };
  }

  async function patchBody(body: unknown): Promise<Response> {
    const { PATCH } = await import('@/app/api/entries/[id]/route');
    return PATCH(
      new Request(`http://kalori.test/api/entries/${ROW_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: ROW_ID }) },
    );
  }

  const validBody = {
    meal_category: 'lunch' as const,
    items: [{ name: 'rice', portion: 1, unit: 'bowl', kcal: 200 }],
  };

  it('returns 200 when profile.timezone is malformed (UTC fallback, no 500 from Intl)', async () => {
    const { from, getUser } = buildPatchMocks('NotARealZone/Bogus');
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await patchBody(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 200 when profile.timezone is empty string', async () => {
    const { from, getUser } = buildPatchMocks('');
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await patchBody(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 200 when profile.timezone is a non-string type (boolean)', async () => {
    const { from, getUser } = buildPatchMocks(true);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await patchBody(validBody);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/entries/[id] — profile timezone normalization (Codex C.CODEX HIGH)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildDeleteMocks(badTimezone: unknown) {
    const entryRow: Row = {
      id: ROW_ID,
      logged_at: '2026-05-10T10:00:00.000Z',
      library_item_id: null,
    };

    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols?: string) => ({
            eq: () => ({
              single: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                return { data: { timezone: badTimezone }, error: null };
              },
              maybeSingle: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                return { data: { timezone: badTimezone }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'food_entries') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: entryRow, error: null }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });

    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
    return { from, getUser };
  }

  async function deleteRow(): Promise<Response> {
    const { DELETE } = await import('@/app/api/entries/[id]/route');
    return DELETE(new Request(`http://kalori.test/api/entries/${ROW_ID}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ROW_ID }),
    });
  }

  it('returns 200 when profile.timezone is malformed (UTC fallback, no 500 from Intl)', async () => {
    const { from, getUser } = buildDeleteMocks('America/Bogus_City');
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await deleteRow();
    expect(res.status).toBe(200);
  });

  it('returns 200 when profile.timezone is empty string', async () => {
    const { from, getUser } = buildDeleteMocks('');
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await deleteRow();
    expect(res.status).toBe(200);
  });

  it('returns 200 when profile.timezone is a non-string type (number)', async () => {
    const { from, getUser } = buildDeleteMocks(123);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await deleteRow();
    expect(res.status).toBe(200);
  });
});
