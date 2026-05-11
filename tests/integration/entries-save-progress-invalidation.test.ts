/**
 * @vitest-environment node
 *
 * Task 4.5 R1 Pass 2 C2 — `POST /api/entries/save` MUST invalidate all 6
 * canonical progress range tags on every success path (fresh insert, replay,
 * 23505 race-replay). Codex flagged the route for emitting only
 * `['24h','7d','30d']`, leaving D / 90d / 1y stale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TAGS } from '@/lib/cache/tags';

type Row = Record<string, unknown>;

describe('POST /api/entries/save — full progress range invalidation (Task 4.5 R1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
  });

  function buildMockSupabase(opts: { existingRow: Row | null; userId: string }) {
    const insertedRow: Row = {
      id: 'entry-1',
      user_id: opts.userId,
      client_id: 'c-1',
      logged_at: '2026-04-21T10:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: opts.userId } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { timezone: 'UTC' }, error: null }),
                maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
              }),
            }),
          };
        }
        if (table === 'food_entries') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: opts.existingRow, error: null }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({ data: insertedRow, error: null }),
              }),
            }),
          };
        }
        return {} as never;
      }),
    };
  }

  it('fresh insert path invalidates all 6 progress ranges', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildMockSupabase({ existingRow: null, userId: 'u-1' }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          logged_at: '2026-04-21T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        }),
      }),
    );
    expect(res.status).toBe(200);

    const tags = revalidateTag.mock.calls.map((c) => c[0] as string);
    expect(tags).toContain(TAGS.userProgress('u-1', '24h'));
    expect(tags).toContain(TAGS.userProgress('u-1', 'D'));
    expect(tags).toContain(TAGS.userProgress('u-1', '7d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '30d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '90d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '1y'));
  });

  it('replay path (existing row) invalidates all 6 progress ranges', async () => {
    const revalidateTag = vi.fn();
    vi.doMock('next/cache', () => ({ revalidateTag }));
    const existing: Row = {
      id: 'existing-1',
      user_id: 'u-1',
      client_id: '11111111-1111-4111-8111-111111111111',
      logged_at: '2026-04-21T10:00:00.000Z',
    };
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildMockSupabase({ existingRow: existing, userId: 'u-1' }),
    }));

    const { POST } = await import('@/app/api/entries/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/entries/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-4111-8111-111111111111',
          logged_at: '2026-04-21T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { replayed?: boolean };
    expect(json.replayed).toBe(true);

    const tags = revalidateTag.mock.calls.map((c) => c[0] as string);
    expect(tags).toContain(TAGS.userProgress('u-1', '24h'));
    expect(tags).toContain(TAGS.userProgress('u-1', 'D'));
    expect(tags).toContain(TAGS.userProgress('u-1', '7d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '30d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '90d'));
    expect(tags).toContain(TAGS.userProgress('u-1', '1y'));
  });
});
