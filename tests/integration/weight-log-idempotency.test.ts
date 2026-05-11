/**
 * @vitest-environment node
 *
 * Task 4.3b — POST /api/weight/log I11 idempotency (mocked-Supabase unit).
 *
 * Proves that a duplicate POST with the same `client_id` returns 200 + the
 * existing row + `replayed: true`, and does NOT re-insert. This is the
 * per-task gate for I11 invariant on the weight path.
 *
 * Codex R1 C-1 + I-3 hardening: the replay path MUST NOT re-invalidate cache
 * tags, MUST NOT re-insert rows, MUST NOT re-update profiles. The original
 * Phase 2 impl did call `revalidateTag` on replay, which defeated idempotency
 * by thrashing downstream readers. These negative assertions catch any
 * future regression.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/weight/log — I11 idempotent replay', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('duplicate client_id returns 200 + existing row + replayed:true + NO insert + NO revalidate + NO profile update', async () => {
    const calls = {
      selectCount: 0,
      insertCount: 0,
      profileUpdateCount: 0,
      revalidatedTags: [] as string[],
    };
    const existingRow = {
      id: 'w-existing',
      user_id: 'user-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      date: '2026-04-24',
      weight_kg: 71.4,
      note: null,
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'weight_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => {
                      calls.selectCount += 1;
                      return { data: existingRow, error: null };
                    },
                  }),
                }),
              }),
              insert: () => {
                calls.insertCount += 1;
                throw new Error('insert should not have been called on replay');
              },
            };
          }
          if (table === 'profiles') {
            // Codex Round 2 NEW-I1 — fence helper reads profiles.deleting_at
            // BEFORE the replay short-circuit. Allow that read; reject any
            // OTHER profile select that would indicate the recalc branch ran.
            // Task A.3 — orphan-profile fence reads profiles with cols
            // `'id, onboarding_completed_at'` PRIOR to the deleting_at fence.
            // Allow that read; reject only the recalc branch's `*` select.
            return {
              select: (cols?: string) => {
                if (cols && cols.includes('onboarding_completed_at')) {
                  return {
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: { id: 'user-1', onboarding_completed_at: '2026-01-01T00:00:00.000Z' },
                        error: null,
                      }),
                    }),
                  };
                }
                if (cols && cols.includes('deleting_at')) {
                  return {
                    eq: () => ({
                      maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                    }),
                  };
                }
                throw new Error('profile select should not have been called on replay');
              },
              update: () => {
                calls.profileUpdateCount += 1;
                throw new Error('profile update should not have been called on replay');
              },
            };
          }
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    }));

    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn((tag: string) => {
        calls.revalidatedTags.push(tag);
      }),
    }));

    const { POST } = await import('@/app/api/weight/log/route');
    const res = await POST(
      new Request('http://kalori.test/api/weight/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          date: '2026-04-24',
          weight_kg: 71.4,
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { row: typeof existingRow; replayed?: boolean };
    expect(body.replayed).toBe(true);
    expect(body.row.id).toBe('w-existing');

    // C-1 + I-3: replay path must NOT rewrite rows, invalidate tags, or
    // touch the profile. The previous impl fired all 8 revalidations on
    // every replay, which thrashed downstream readers.
    expect(calls.insertCount).toBe(0);
    expect(calls.profileUpdateCount).toBe(0);
    expect(calls.revalidatedTags).toEqual([]);
  });

  it('fresh POST fires the EXACT expected tag set (profile + 6 userProgress + 1 userEntries)', async () => {
    // I-2 hardening: the prompt referenced `D/W/M/Q/Y/A` but the canonical
    // `lib/cache/tags.ts` range union is `24h | D | 7d | 30d | 90d | 1y`.
    // Code is authoritative; this test freezes the exact set so future
    // drift gets caught.
    const revalidated: string[] = [];
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-freeze' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'weight_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'w-fresh',
                      client_id: '44444444-4444-4444-8444-444444444444',
                      date: '2026-04-24',
                      weight_kg: 70.0,
                      note: null,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: (cols?: string) => {
                // Task A.3 — fence preflight needs a non-null profile row
                // so the orphan branch doesn't fire a 401. Return a happy
                // shape only for the fence's cols; for the recalc branch
                // (`*`) keep the legacy "profile missing" semantics so no
                // recalc runs but revalidations still fire.
                if (cols && cols.includes('onboarding_completed_at')) {
                  return {
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: 'user-freeze',
                          onboarding_completed_at: '2026-01-01T00:00:00.000Z',
                        },
                        error: null,
                      }),
                    }),
                  };
                }
                return {
                  eq: () => ({
                    // profile missing for recalc branch → no recalc runs,
                    // but revalidations still fire per the post-insert tag
                    // guarantee.
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                };
              },
              update: () => ({ eq: async () => ({ error: null }) }),
            };
          }
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    }));
    vi.doMock('next/cache', () => ({
      revalidateTag: vi.fn((tag: string) => {
        revalidated.push(tag);
      }),
    }));

    const { POST } = await import('@/app/api/weight/log/route');
    const res = await POST(
      new Request('http://kalori.test/api/weight/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '44444444-4444-4444-8444-444444444444',
          date: '2026-04-24',
          weight_kg: 70.0,
        }),
      }),
    );
    expect(res.status).toBe(200);

    // Exactly 8 tags: profile + 6 progress ranges + today's entries bucket.
    expect(revalidated).toContain('user:user-freeze:profile');
    expect(revalidated).toContain('user:user-freeze:progress:24h');
    expect(revalidated).toContain('user:user-freeze:progress:D');
    expect(revalidated).toContain('user:user-freeze:progress:7d');
    expect(revalidated).toContain('user:user-freeze:progress:30d');
    expect(revalidated).toContain('user:user-freeze:progress:90d');
    expect(revalidated).toContain('user:user-freeze:progress:1y');
    // Today's entries bucket (YYYY-MM-DD prefix just has to match, exact
    // day depends on the server clock — assert the prefix).
    expect(
      revalidated.some((tag) => /^user:user-freeze:entries:\d{4}-\d{2}-\d{2}$/.test(tag)),
    ).toBe(true);
    // Defensive upper-bound — ensure NO extra tags leaked.
    expect(revalidated.length).toBe(8);
  });
});
