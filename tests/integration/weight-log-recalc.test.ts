/**
 * @vitest-environment node
 *
 * Task 4.3b — POST /api/weight/log recalc pipeline integration test.
 *
 * Verifies that a fresh weight POST (auto mode, above-threshold delta):
 *   1. Inserts a weight_log row.
 *   2. Loads profile, runs pure recalc, UPDATEs profile with
 *      current_weight_kg + bmr + tdee + calorie_target + last_target_recalc_at.
 *   3. Returns `recalc: { newBmr, newTdee, newTarget }` in the response body.
 *   4. Revalidates TAGS.profile + TAGS.userProgress across the active union.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/weight/log — recalc pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  it('fresh POST in auto mode above threshold → recalc fires + profile updated', async () => {
    const calls = {
      insertedRow: null as Record<string, unknown> | null,
      profileUpdates: [] as Record<string, unknown>[],
      revalidatedTags: [] as string[],
    };

    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-auto' } }, error: null }),
        },
        from: (table: string) => {
          if (table === 'weight_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
              insert: (payload: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => {
                    calls.insertedRow = { id: 'w-new', ...payload };
                    return { data: calls.insertedRow, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      target_mode: 'auto',
                      current_weight_kg: 70,
                      recalc_threshold_pct: 2.0,
                      bio_sex: 'female',
                      age: 30,
                      height_cm: 165,
                      activity_level: 'moderate',
                      goal_weight_kg: 65,
                      goal_pace: 'moderate',
                    },
                    error: null,
                  }),
                }),
              }),
              update: (patch: Record<string, unknown>) => ({
                eq: async () => {
                  calls.profileUpdates.push(patch);
                  return { error: null };
                },
              }),
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
          client_id: '22222222-2222-4222-8222-222222222222',
          date: new Date().toISOString().slice(0, 10),
          weight_kg: 72.0, // 2.86% delta from 70 → above 2% threshold
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      row: Record<string, unknown>;
      recalc?: { newBmr: number; newTdee: number; newTarget: number };
    };
    expect(body.recalc).toBeDefined();
    expect(typeof body.recalc?.newTarget).toBe('number');
    expect(calls.profileUpdates.length).toBe(1);
    const patch = calls.profileUpdates[0]!;
    expect(patch.current_weight_kg).toBe(72.0);
    expect(patch.last_target_recalc_at).toBeDefined();
    expect(calls.revalidatedTags).toContain('user:user-auto:profile');
    expect(calls.revalidatedTags.some((tag) => tag.startsWith('user:user-auto:progress:'))).toBe(
      true,
    );
  });

  it('manual mode POST — weight_log row written + NO profile update + no recalc block', async () => {
    const calls = {
      insertCount: 0,
      profileUpdates: [] as Record<string, unknown>[],
      revalidatedTags: [] as string[],
    };
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-manual' } }, error: null }),
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
                  single: async () => {
                    calls.insertCount += 1;
                    return {
                      data: { id: 'w-manual' },
                      error: null,
                    };
                  },
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      target_mode: 'manual',
                      current_weight_kg: 70,
                      recalc_threshold_pct: 2.0,
                      bio_sex: 'male',
                      age: 40,
                      height_cm: 180,
                      activity_level: 'light',
                      goal_weight_kg: 75,
                      goal_pace: 'moderate',
                    },
                    error: null,
                  }),
                }),
              }),
              update: (patch: Record<string, unknown>) => ({
                eq: async () => {
                  calls.profileUpdates.push(patch);
                  return { error: null };
                },
              }),
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
          client_id: '33333333-3333-4333-8333-333333333333',
          date: new Date().toISOString().slice(0, 10),
          weight_kg: 80, // huge swing — would trigger in auto mode
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { row: Record<string, unknown>; recalc?: unknown };
    expect(body.recalc).toBeUndefined();
    expect(calls.insertCount).toBe(1);
    expect(calls.profileUpdates.length).toBe(0);
  });

  it('Codex R1 C-4: profile update error → 500 + NO recalc block + NO tag invalidation', async () => {
    // C-4: the recalc branch previously ignored `{ error }` from
    // `profiles.update(...)` and returned a `recalc` block regardless.
    // This meant the client would see "target updated to X kcal" while
    // the DB still held the old target. Fix: error from the profile
    // update short-circuits the response with a 500, omits recalc, and
    // skips cache-tag invalidation (since nothing was actually persisted
    // that downstream readers would want invalidated).
    const calls = {
      insertCount: 0,
      revalidatedTags: [] as string[],
    };
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-c4' } }, error: null }),
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
                  single: async () => {
                    calls.insertCount += 1;
                    return { data: { id: 'w-c4' }, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      target_mode: 'auto',
                      current_weight_kg: 70,
                      recalc_threshold_pct: 2.0,
                      bio_sex: 'female',
                      age: 30,
                      height_cm: 165,
                      activity_level: 'moderate',
                      goal_weight_kg: 65,
                      goal_pace: 'moderate',
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: { code: '42501', message: 'rls denied' } }),
              }),
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
          client_id: '55555555-5555-4555-8555-555555555555',
          date: new Date().toISOString().slice(0, 10),
          weight_kg: 72.0,
        }),
      }),
    );
    // C-4 contract: failed profile update MUST surface as 5xx.
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; recalc?: unknown };
    expect(body.error).toBeDefined();
    // No phantom recalc block — client must not see "target updated" when
    // the DB row was never updated.
    expect(body.recalc).toBeUndefined();
    // No cache thrash from a failed persistence — readers would just
    // re-read the stale row.
    expect(calls.revalidatedTags).toEqual([]);
  });
});
