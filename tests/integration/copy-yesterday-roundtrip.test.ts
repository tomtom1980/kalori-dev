/**
 * @vitest-environment node
 *
 * Task 3.4 AC10 (integration) — copy-yesterday DB round-trip.
 *
 * Contract (tasks.md AC10, design-doc §10.4): the copy-yesterday route
 * inserts N new rows whose `meal_category` inherits each source row's
 * value, whose `logged_at` is now() (within a reasonable tolerance), and
 * whose `client_id` is the matching `new_client_ids[i]` by index.
 *
 * Unit coverage in `tests/unit/api/copy-yesterday.test.ts` already asserts
 * the route's shape on a per-call basis; this integration spec exercises a
 * multi-row source set with varied meal_category values under a single
 * persistent in-closure store, proving the index-pairing contract end-to-end.
 *
 * Backing-store note: the mock here is intentionally narrow — source rows
 * are seeded once in a Map, the insert terminal pushes new rows with the
 * paired client_id by source-id lookup, and the SELECT chain returns the
 * seeded source rows in insertion order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

describe('POST /api/entries/copy-yesterday — multi-row round-trip (integration)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('copies 3 yesterday rows → 3 new rows with correct meal_category + new client_ids + logged_at=now', async () => {
    const userId = 'u-1';
    const sourceRows: Row[] = [
      {
        id: '55555555-5555-4555-8555-555555555551',
        user_id: userId,
        client_id: '99999999-9999-4999-8999-999999999991',
        logged_at: '2026-04-20T10:00:00.000Z',
        meal_category: 'breakfast',
        source: 'text',
        items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        ai_reasoning: null,
        library_item_id: null,
      },
      {
        id: '55555555-5555-4555-8555-555555555552',
        user_id: userId,
        client_id: '99999999-9999-4999-8999-999999999992',
        logged_at: '2026-04-20T13:00:00.000Z',
        meal_category: 'lunch',
        source: 'photo',
        items: [{ name: 'pho', portion: 1, unit: 'bowl', kcal: 420 }],
        ai_reasoning: 'pho bo — Hanoi style',
        library_item_id: null,
      },
      {
        id: '55555555-5555-4555-8555-555555555553',
        user_id: userId,
        client_id: '99999999-9999-4999-8999-999999999993',
        logged_at: '2026-04-20T15:00:00.000Z',
        meal_category: 'snack',
        source: 'library',
        items: [{ name: 'banana', portion: 1, unit: 'unit', kcal: 105 }],
        ai_reasoning: null,
        library_item_id: 'lib-banana',
      },
    ];

    const newClientIds = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    ];

    const inserted: Row[] = [];
    const calls = { revalidated: [] as string[] };

    const revalidateTag = vi.fn((tag: string) => {
      calls.revalidated.push(tag);
    });
    vi.doMock('next/cache', () => ({ revalidateTag }));

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: userId } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'profiles') {
            // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at (fail-closed).
            return {
              select: (cols?: string) => ({
                eq: () => ({
                  single: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null },
                  maybeSingle: async () =>
                    cols && cols.includes('deleting_at')
                      ? { data: { deleting_at: null }, error: null }
                      : { data: { timezone: 'Asia/Ho_Chi_Minh' }, error: null },
                }),
              }),
            };
          }
          if (table === 'food_entries') {
            return {
              select: () => ({
                // Route chains: .eq('user_id', …).in('id', ids).order(...)
                eq: () => ({
                  in: () => ({
                    order: async () => ({ data: sourceRows, error: null }),
                  }),
                }),
              }),
              insert: (payload: Row | Row[]) => ({
                select: async () => {
                  const rows = Array.isArray(payload) ? payload : [payload];
                  for (const r of rows) {
                    inserted.push({
                      ...r,
                      id: `new-${inserted.length + 1}`,
                    });
                  }
                  return {
                    data: inserted.slice(-rows.length),
                    error: null,
                  };
                },
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
      }),
    }));

    const { POST } = await import('@/app/api/entries/copy-yesterday/route');
    const tBefore = Date.now();
    const res = await POST(
      new Request('http://kalori.test/api/entries/copy-yesterday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: sourceRows.map((r) => r.id),
          new_client_ids: newClientIds,
        }),
      }),
    );
    const tAfter = Date.now();

    expect(res.status).toBe(200);
    const json = (await res.json()) as { created: Row[] };
    expect(json.created).toHaveLength(3);

    // Verify each inserted row matches the pairing contract:
    //   - client_id = new_client_ids[i] by index-into-ids
    //   - meal_category = source[i].meal_category
    //   - logged_at ≈ now()
    sourceRows.forEach((src, i) => {
      const out = inserted[i]!;
      expect(out.client_id).toBe(newClientIds[i]);
      expect(out.meal_category).toBe(src.meal_category);
      expect(out.user_id).toBe(userId);
      // logged_at is now() — should sit within the [tBefore, tAfter] window
      // plus a small tolerance for clock skew across the await boundary.
      const loggedAtMs = Date.parse(String(out.logged_at));
      expect(loggedAtMs).toBeGreaterThanOrEqual(tBefore - 1000);
      expect(loggedAtMs).toBeLessThanOrEqual(tAfter + 1000);
      // items + library_item_id carry through unchanged.
      expect(out.items).toEqual(src.items);
      expect(out.library_item_id).toBe(src.library_item_id);
    });

    // revalidateTag fires 7× on copy-yesterday insert (Task 4.5 R2 S3):
    //   1× user:<uid>:entries:<YYYY-MM-DD>        (today bucket)
    //   6× user:<uid>:progress:{24h,D,7d,30d,90d,1y} (canonical progress set)
    // F-UI-3.6-B-5: target_date param removed from API contract; server
    // computes day from the profile timezone. Task 4.5 R2 S3 extended from
    // 3 progress ranges to the full canonical 6 via the shared
    // `revalidateAllProgressRanges` helper.
    expect(calls.revalidated).toHaveLength(7);
    // First call = entries tag.
    expect(calls.revalidated[0]).toMatch(
      new RegExp(`^user:${userId}:entries:\\d{4}-\\d{2}-\\d{2}$`),
    );
    // Remaining 6 are progress tags across all canonical ranges.
    expect(calls.revalidated).toContain(`user:${userId}:progress:24h`);
    expect(calls.revalidated).toContain(`user:${userId}:progress:D`);
    expect(calls.revalidated).toContain(`user:${userId}:progress:7d`);
    expect(calls.revalidated).toContain(`user:${userId}:progress:30d`);
    expect(calls.revalidated).toContain(`user:${userId}:progress:90d`);
    expect(calls.revalidated).toContain(`user:${userId}:progress:1y`);
    expect(revalidateTag).toHaveBeenCalledTimes(7);
  });
});
