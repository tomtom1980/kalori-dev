/**
 * @vitest-environment node
 *
 * ai_response_cache 30-day TTL contract (Task 3.2 RED).
 *
 * Proves:
 *   - On cache miss, the route writes a new row with:
 *       * `expires_at` = `created_at` + 30 days
 *       * `call_type`, `user_id`, `input_hash`, `parsed_payload` populated
 *   - A row whose `expires_at` is in the past is treated as a miss (fresh
 *     Gemini call fires AND a new row is written with a fresh expires_at)
 *
 * RED phase: route handler is a 501 stub. The assertions on cache write
 * fields fail because no write happens.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

function stubGeminiSuccess() {
  server.use(
    http.post('*generativelanguage.googleapis.com/*', async () =>
      HttpResponse.json({
        items: [
          {
            name: 'phở bò',
            portion: 1,
            unit: 'bowl',
            kcal: 520,
            macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
            micros: { sodium: 900 },
            confidence: 0.85,
          },
        ],
        reasoning: 'Standard phở.',
      }),
    ),
  );
}

function setupSsr() {
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-ttl' } }, error: null }),
      },
      from: makeServerFrom('u-ttl'),
    }),
  }));
}

describe('ai_response_cache — 30-day TTL', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  it('on cache miss, inserts a row with expires_at ≈ now + 30 days', async () => {
    setupSsr();
    const cacheInsert = vi.fn(async () => ({ data: null, error: null }));
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
    const logInsert = vi.fn(async () => ({ data: null, error: null }));

    // Chainable `eq(...)` builder that ultimately lands on `.single()` —
    // I3 fix: the route now calls `.eq('user_id', ...).eq('input_hash', ...)`
    // so the mock must accept two `.eq()` calls before `.single()`.
    const makeCacheQueryBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };

    const fromSpy = vi.fn((table: string) => {
      if (table === 'ai_response_cache') {
        return {
          select: () => makeCacheQueryBuilder(),
          insert: cacheInsert,
          upsert: cacheUpsert,
        };
      }
      return {
        select: () => makeCacheQueryBuilder(),
        insert: logInsert,
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from: fromSpy }),
    }));
    stubGeminiSuccess();

    const before = Date.now();
    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'b2267783-524f-4f2a-a970-e5da4489052f',
          userText: 'one bowl of phở bò',
        }),
      }),
    );
    const after = Date.now();
    expect(res.status).toBe(200);
    // C4: writes now use upsert. Exactly one upsert call with the expected shape.
    expect(cacheUpsert).toHaveBeenCalledTimes(1);
    expect(cacheInsert).not.toHaveBeenCalled();

    const row = (
      cacheUpsert.mock.calls[0] as unknown as
        | [
            {
              input_hash?: string;
              call_type?: string;
              user_id?: string;
              parsed_payload?: unknown;
              expires_at?: string;
            },
            { onConflict?: string }?,
          ]
        | undefined
    )?.[0];
    expect(row).toBeDefined();
    expect(row!.call_type).toBe('text-parse');
    expect(row!.user_id).toBe('u-ttl');
    expect(typeof row!.input_hash).toBe('string');
    expect(row!.parsed_payload).toBeDefined();

    const expiresAtMs = new Date(row!.expires_at as string).getTime();
    const expectedLower = before + 30 * 24 * 3600 * 1000 - 5_000;
    const expectedUpper = after + 30 * 24 * 3600 * 1000 + 5_000;
    expect(expiresAtMs).toBeGreaterThanOrEqual(expectedLower);
    expect(expiresAtMs).toBeLessThanOrEqual(expectedUpper);
    // C4: upsert carries onConflict: 'input_hash' (PK conflict resolution).
    const upsertOpts = (
      cacheUpsert.mock.calls[0] as unknown as [unknown, { onConflict?: string }?] | undefined
    )?.[1];
    expect(upsertOpts?.onConflict).toBe('input_hash');
  });

  it('expired cache row (expires_at in the past) is treated as a miss → fresh Gemini call + new row written', async () => {
    setupSsr();
    const cacheInsert = vi.fn(async () => ({ data: null, error: null }));
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
    const logInsert = vi.fn(async () => ({ data: null, error: null }));
    const expiredRow = {
      input_hash: 'stale-hash',
      call_type: 'text-parse',
      user_id: 'u-ttl',
      parsed_payload: { items: [], reasoning: 'stale' },
      expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    };
    // Chainable eq() that returns the expired row on final .single().
    const makeExpiredCacheBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: expiredRow, error: null }),
      };
      return builder;
    };
    const makeMissBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };
    const fromSpy = vi.fn((table: string) => {
      if (table === 'ai_response_cache') {
        return {
          select: () => makeExpiredCacheBuilder(),
          insert: cacheInsert,
          upsert: cacheUpsert,
        };
      }
      return {
        select: () => makeMissBuilder(),
        insert: logInsert,
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from: fromSpy }),
    }));

    const geminiSpy = vi.fn(async () =>
      HttpResponse.json({
        items: [
          {
            name: 'phở bò',
            portion: 1,
            unit: 'bowl',
            kcal: 520,
            macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 },
            micros: { sodium: 900 },
            confidence: 0.85,
          },
        ],
        reasoning: 'fresh',
      }),
    );
    server.use(http.post('*generativelanguage.googleapis.com/*', geminiSpy));

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'a69db080-a05f-4281-8651-c328e0551635',
          userText: 'one bowl of phở bò',
        }),
      }),
    );
    expect(res.status).toBe(200);
    // Fresh Gemini call must have fired despite the cache row existing.
    expect(geminiSpy).toHaveBeenCalled();
    // C4: fresh cache row written via upsert (not insert).
    expect(cacheUpsert).toHaveBeenCalledTimes(1);
    expect(cacheInsert).not.toHaveBeenCalled();
    const row = (
      cacheUpsert.mock.calls[0] as unknown as [{ expires_at?: string }] | undefined
    )?.[0];
    expect(new Date(row!.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  // R2-I2 — true concurrency race. Two simultaneous handler invocations with
  // identical userId + userText → identical input_hash. Both must resolve
  // 200, the simulated DB must emit exactly ONE cache row (upsert dedupes),
  // and ai_call_log must have TWO rows (one per Gemini call — concurrent
  // calls do NOT dedupe at the log layer; each request is billed).
  // Strengthens the C4 sequential test (which only proves idempotent
  // semantics) with an actual Promise.all race.
  it('R2-I2: concurrent identical requests race → two call logs, one cache row, both succeed', async () => {
    setupSsr();
    // Simulated "single row per input_hash": the cacheUpsert captures every
    // call but the simulated store keeps only one row. Second upsert with
    // identical key overwrites — mirrors PG onConflict=DO UPDATE semantics.
    const cacheRows = new Map<string, unknown>();
    const cacheUpsert = vi.fn(async (row: { input_hash?: string }) => {
      if (row?.input_hash) cacheRows.set(row.input_hash, row);
      return { data: null, error: null };
    });
    const logInsert = vi.fn(async () => ({ data: null, error: null }));
    const makeMissBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };
    const fromSpy = vi.fn((table: string) => {
      if (table === 'ai_response_cache') {
        return {
          select: () => makeMissBuilder(),
          upsert: cacheUpsert,
          insert: vi.fn(),
        };
      }
      return {
        select: () => makeMissBuilder(),
        insert: logInsert,
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from: fromSpy }),
    }));
    stubGeminiSuccess();

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const makeReq = (cid: string): Request =>
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: cid,
          // Same userText → same normalizedInput → same input_hash.
          userText: 'one bowl of phở bò',
        }),
      });

    const [res1, res2] = await Promise.all([
      POST(makeReq('8b1aba50-54ac-47da-8aa3-9eb7e026f966')),
      POST(makeReq('4a3f1035-db0f-4a9b-be7c-fe0435aa4b43')),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Both responses are real Gemini payloads (no fallback envelope).
    const body1 = (await res1.json()) as { result?: { items?: unknown[] }; fallback?: boolean };
    const body2 = (await res2.json()) as { result?: { items?: unknown[] }; fallback?: boolean };
    expect(body1.fallback).toBeUndefined();
    expect(body2.fallback).toBeUndefined();
    expect(Array.isArray(body1.result?.items)).toBe(true);
    expect(Array.isArray(body2.result?.items)).toBe(true);

    // Exactly ONE cache row for the shared input_hash — upsert deduped.
    expect(cacheRows.size).toBe(1);
    // cacheUpsert invoked twice (once per handler) but the DB store holds
    // one row. This is the concurrency invariant: both writers attempt the
    // upsert; the second one overwrites the first at the same PK.
    expect(cacheUpsert).toHaveBeenCalledTimes(2);

    // TWO ai_call_log rows — concurrent callers each get billed their
    // own Gemini call. Caching does NOT retroactively dedupe concurrent
    // spenders (that's a separate F8 optimization, not safety).
    expect(logInsert).toHaveBeenCalledTimes(2);
    for (const call of logInsert.mock.calls) {
      const row = (call as unknown as [{ cached_flag?: boolean }])[0];
      expect(row.cached_flag).toBe(false);
    }
  });

  // C4 — duplicate input_hash from concurrent identical requests must not
  // throw. The upsert path is idempotent; both callers get a real response.
  it('C4: duplicate input_hash collision (concurrent identical requests) → upsert, no error fallback', async () => {
    setupSsr();
    // Simulate a PK collision on insert (what the OLD code did): the mocked
    // upsert returns null error regardless — the production code SHOULD be
    // using upsert, so this test verifies the success path.
    const cacheInsert = vi.fn(async () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }));
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
    const logInsert = vi.fn(async () => ({ data: null, error: null }));
    const makeMissBuilder = () => {
      const builder = {
        eq: () => builder,
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };
    const fromSpy = vi.fn((table: string) => {
      if (table === 'ai_response_cache') {
        return {
          select: () => makeMissBuilder(),
          insert: cacheInsert,
          upsert: cacheUpsert,
        };
      }
      return {
        select: () => makeMissBuilder(),
        insert: logInsert,
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from: fromSpy }),
    }));
    stubGeminiSuccess();

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '6ba28045-49a2-4e53-8fcb-6a541903ad8f',
          userText: 'one bowl of phở bò',
        }),
      }),
    );
    // Success — real Gemini response returned, NOT the fallback envelope.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { items?: unknown[] }; fallback?: boolean };
    expect(body.fallback).toBeUndefined();
    expect(Array.isArray(body.result?.items)).toBe(true);
    // The upsert path was used (not .insert()). No fallback → exactly one
    // ai_call_log row was written in the non-error branch (cached_flag=false).
    expect(cacheUpsert).toHaveBeenCalledTimes(1);
    expect(cacheInsert).not.toHaveBeenCalled();
    expect(logInsert).toHaveBeenCalledTimes(1);
    const logRow = (
      logInsert.mock.calls[0] as unknown as [{ cached_flag?: boolean }] | undefined
    )?.[0];
    expect(logRow?.cached_flag).toBe(false);
  });

  // I3 — cache lookup SQL filter includes user_id (defence-in-depth).
  it('I3: cache lookup filters on user_id AND input_hash in SQL, not just input_hash', async () => {
    setupSsr();
    const filterCalls: { column: string; value: unknown }[] = [];
    const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));
    const logInsert = vi.fn(async () => ({ data: null, error: null }));
    const makeTrackedBuilder = () => {
      const builder: {
        eq: (column: string, value: unknown) => typeof builder;
        single: () => Promise<{ data: unknown; error: unknown }>;
      } = {
        eq(column: string, value: unknown) {
          filterCalls.push({ column, value });
          return builder;
        },
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
      };
      return builder;
    };
    const fromSpy = vi.fn((table: string) => {
      if (table === 'ai_response_cache') {
        return {
          select: () => makeTrackedBuilder(),
          upsert: cacheUpsert,
          insert: vi.fn(),
        };
      }
      return {
        select: () => makeTrackedBuilder(),
        insert: logInsert,
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      getAdminSupabase: () => ({ from: fromSpy }),
    }));
    stubGeminiSuccess();

    const { POST } = await import('@/app/api/ai/text-parse/route');
    await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '73acc42d-2980-4e9f-bce4-4c5e1a67d6b4',
          userText: 'one bowl of phở bò',
        }),
      }),
    );
    // I3: both `user_id` and `input_hash` filters must be applied on lookup.
    const userIdFilter = filterCalls.find((f) => f.column === 'user_id');
    const inputHashFilter = filterCalls.find((f) => f.column === 'input_hash');
    expect(userIdFilter).toBeDefined();
    expect(userIdFilter?.value).toBe('u-ttl');
    expect(inputHashFilter).toBeDefined();
  });
});
