/**
 * @vitest-environment node
 *
 * Task C.CODEX Round 1 Finding (HIGH) — `POST /api/entries/save` profile
 * timezone normalization parity with `/api/library/[id]/log-now`.
 *
 * Symptom: `/api/library/[id]/log-now` normalizes `profiles.timezone` via
 * the shared `normalizeProfileTimezone()` helper (lib/time/device-timezone.ts).
 * `/api/entries/save` reads the same DB column but casts it as `string` and
 * passes the raw value straight into `userTzDayFrom`. A malformed legacy
 * value (e.g. `'invalid/zone'`, `'America/Bogus_City'`) trips
 * `Intl.DateTimeFormat` and throws BEFORE the route returns a controlled
 * JSON error, so affected users cannot save entries while Log Now succeeds
 * with the UTC fallback.
 *
 * Contract (matches log-now's behavior):
 *   - Bad IANA value → fall back to UTC, route proceeds normally to 200.
 *   - NEVER throw 500 from inside `userTzDayFrom`.
 *
 * Mock topology mirrors `entries-save-30day-window.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('POST /api/entries/save — profile timezone normalization (Codex C.CODEX HIGH)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  async function postBody(body: unknown): Promise<Response> {
    const { POST } = await import('@/app/api/entries/save/route');
    return POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  function buildFromMock(badTimezone: unknown) {
    const insertRow: Row = {
      id: 'row-1',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: new Date(Date.now() - 60 * 1000).toISOString(),
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
      ai_reasoning: null,
    };

    return vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols?: string) => ({
            eq: () => ({
              single: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                // Inject the bad/malformed timezone value into the row the
                // route reads. The route's previous code cast this as
                // `string` and passed it raw into `userTzDayFrom`.
                return { data: { id: 'u-1', timezone: badTimezone }, error: null };
              },
              maybeSingle: async () => {
                if (cols && cols.includes('deleting_at')) {
                  return { data: { deleting_at: null }, error: null };
                }
                return { data: { id: 'u-1', timezone: badTimezone }, error: null };
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
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: insertRow, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unknown table: ${table}`);
    });
  }

  const validBody = {
    client_id: '11111111-1111-4111-8111-111111111111',
    logged_at: new Date(Date.now() - 60 * 1000).toISOString(),
    meal_category: 'breakfast' as const,
    source: 'text' as const,
    items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
  };

  it('returns 200 + falls back to UTC when profile.timezone is a malformed IANA string', async () => {
    const from = buildFromMock('NotARealZone/Bogus');
    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    // Contract: a malformed legacy timezone must NOT crash the route —
    // log-now's behavior is to fall back to UTC and proceed. Save must
    // honor the same contract for parity.
    expect(res.status).toBe(200);
  });

  it('returns 200 + falls back to UTC when profile.timezone is empty string', async () => {
    const from = buildFromMock('');
    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(200);
  });

  it('returns 200 + falls back to UTC when profile.timezone is a non-string type (number)', async () => {
    const from = buildFromMock(42);
    const getUser = vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn() }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from }),
    }));

    const res = await postBody(validBody);
    expect(res.status).toBe(200);
  });
});
