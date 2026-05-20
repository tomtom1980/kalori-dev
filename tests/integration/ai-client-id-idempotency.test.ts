/**
 * @vitest-environment node
 *
 * I11 + I2 — `ai_call_log` route-level idempotency via `client_id`
 * (Task 3.6 Codex Split A round 1, finding F-UI-3.6-A-2).
 *
 * Before this fix: `client_id` was validated as `z.string()` on all three AI
 * routes but never consumed. A client retry of the same logical request
 * re-fired Gemini, incurred cost twice, and logged two `ai_call_log` rows —
 * the stated I11 exact-once contract was violated.
 *
 * After this fix:
 *   1. `client_id` is validated as `z.uuid()` on all three routes.
 *   2. Before cache lookup, the route SELECTs `ai_call_log` by
 *      `(user_id, client_id)`. If a prior row exists, it returns the cached
 *      `ai_response_cache` row keyed by the prior `input_hash` and does NOT
 *      call Gemini. The replay logs are upsert-safe (unique on
 *      `(user_id, client_id)` — new migration).
 *   3. On fresh calls, `client_id` is written into `ai_call_log.client_id`.
 *
 * Scope: covers `text-parse`, `vision`, `weekly-review` (the three Gemini
 * routes that accept `client_id`).
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeProfilesMock } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

const CID_A = '11111111-2222-4333-8444-555555555555';

function setupSsr(userId: string | null) {
  const getUser = vi.fn(async () =>
    userId
      ? { data: { user: { id: userId } }, error: null }
      : { data: { user: null }, error: { message: 'invalid' } },
  );
  // setupSsr also serves `.from('weekly_reviews')` for the weekly route
  // (which now writes via auth client per F-UI-3.6-A-1) and
  // `.from('profiles')` for the orphan-profile fence.
  const weeklyUpsert = vi.fn(async () => ({ data: null, error: null }));
  const selectEntries = vi.fn(() => ({
    eq: () => ({
      gte: () => ({
        lt: async () => ({ data: [], error: null }),
      }),
    }),
  }));
  const profilesMock = makeProfilesMock(userId ?? 'u-test');
  const from = vi.fn((table: string) => {
    if (table === 'weekly_reviews') {
      return { upsert: weeklyUpsert, insert: weeklyUpsert };
    }
    if (table === 'profiles') {
      return profilesMock;
    }
    return { select: selectEntries };
  });
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({ auth: { getUser }, from }),
  }));
  return { getUser, weeklyUpsert };
}

interface AdminCallLogRow {
  user_id: string;
  client_id: string;
  input_hash: string;
  call_type: string;
  parsed_payload?: unknown;
}

/**
 * Admin mock that models ai_call_log + ai_response_cache as in-memory tables
 * so we can prove the 2nd call with the same client_id is a no-op on
 * Gemini but still produces a valid response.
 */
function setupAdmin(
  opts: {
    seedLog?: AdminCallLogRow;
    seedCache?: { input_hash: string; parsed_payload: unknown };
  } = {},
) {
  const logRows: AdminCallLogRow[] = opts.seedLog ? [opts.seedLog] : [];
  const cacheRows: { input_hash: string; parsed_payload: unknown; user_id: string }[] =
    opts.seedCache ? [{ ...opts.seedCache, user_id: opts.seedLog?.user_id ?? 'u-1' }] : [];

  // ai_call_log handlers
  const logInsert = vi.fn(async (row: AdminCallLogRow) => {
    // Simulate unique constraint (user_id, client_id) when client_id is
    // non-null. Duplicate → 23505.
    if (row.client_id) {
      const dup = logRows.find((r) => r.user_id === row.user_id && r.client_id === row.client_id);
      if (dup) {
        return { data: null, error: { code: '23505', message: 'duplicate client_id' } };
      }
    }
    logRows.push(row);
    return { data: null, error: null };
  });

  const logSelectByCid = vi.fn(() => {
    // Chain: .select(...).eq(user_id).eq(client_id).maybeSingle()
    const builder = {
      eq: () => builder,
      maybeSingle: async () => {
        // Walk logRows to find a matching row given the eq() chain — we
        // simplify by just returning the first row that has a client_id set,
        // which matches the test's one-row-per-cid scenario.
        const row = logRows.find((r) => !!r.client_id);
        return { data: row ?? null, error: null };
      },
      single: async () => {
        const row = logRows.find((r) => !!r.client_id);
        return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
      },
    };
    return builder;
  });

  // ai_response_cache handlers
  const cacheUpsert = vi.fn(
    async (row: { input_hash: string; parsed_payload: unknown; user_id: string }) => {
      const existing = cacheRows.findIndex((r) => r.input_hash === row.input_hash);
      if (existing >= 0) cacheRows.splice(existing, 1);
      cacheRows.push(row);
      return { data: null, error: null };
    },
  );

  const cacheSelectByHash = () => {
    const builder = {
      eq: () => builder,
      single: async () => {
        const row = cacheRows[0];
        if (row) {
          return {
            data: {
              ...row,
              expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: { code: 'PGRST116' } };
      },
    };
    return builder;
  };

  const from = vi.fn((table: string) => {
    if (table === 'ai_response_cache') {
      return {
        select: () => cacheSelectByHash(),
        insert: cacheUpsert,
        upsert: cacheUpsert,
      };
    }
    if (table === 'ai_call_log') {
      return {
        select: logSelectByCid,
        insert: logInsert,
      };
    }
    return { select: () => cacheSelectByHash(), insert: logInsert };
  });

  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({ from }),
  }));
  return { logInsert, cacheUpsert, logRows, cacheRows };
}

function setupCacheTagMock() {
  const updateTag = vi.fn();
  const revalidateTag = vi.fn();
  vi.doMock('next/cache', () => ({ updateTag, revalidateTag }));
}

function stubGeminiTextParseSuccess(counter: { n: number }) {
  server.use(
    http.post('*generativelanguage.googleapis.com/*', async () => {
      counter.n += 1;
      return HttpResponse.json({
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
        reasoning: 'cid replay test',
      });
    }),
  );
}

describe('F-UI-3.6-A-2 — client_id idempotency + z.uuid() validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('next/cache');
  });

  describe('text-parse route', () => {
    it('rejects a non-UUID client_id with 400 (z.uuid() validation)', async () => {
      setupSsr('u-1');
      setupAdmin();
      setupCacheTagMock();

      const { POST } = await import('@/app/api/ai/text-parse/route');
      const res = await POST(
        new Request('http://kalori.test/api/ai/text-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'not-a-uuid', // shape violation
            userText: 'phở bò',
          }),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe('ValidationError');
    });

    it('replays same client_id: second call returns cached payload, ZERO Gemini calls, no duplicate log', async () => {
      setupSsr('u-1');
      const { logInsert, logRows, cacheRows } = setupAdmin();
      setupCacheTagMock();
      const geminiCallCount = { n: 0 };
      stubGeminiTextParseSuccess(geminiCallCount);

      const { POST } = await import('@/app/api/ai/text-parse/route');

      // First call — fresh: fires Gemini, logs ai_call_log row with cid.
      const res1 = await POST(
        new Request('http://kalori.test/api/ai/text-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CID_A,
            userText: 'phở bò',
          }),
        }),
      );
      expect(res1.status).toBe(200);
      expect(geminiCallCount.n).toBe(1);
      expect(logRows.length).toBe(1);
      expect(logRows[0]?.client_id).toBe(CID_A);

      // Second call — SAME client_id, SAME userText: should short-circuit
      // via the (user_id, client_id) lookup and NOT call Gemini.
      const res2 = await POST(
        new Request('http://kalori.test/api/ai/text-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CID_A,
            userText: 'phở bò',
          }),
        }),
      );
      expect(res2.status).toBe(200);
      // I11 — only ONE Gemini call fired across both requests.
      expect(geminiCallCount.n).toBe(1);
      // Both responses share the same payload contract.
      const body1 = (await res1.json()) as { result: { items: { kcal: number }[] } };
      const body2 = (await res2.json()) as { result: { items: { kcal: number }[] } };
      expect(body2.result.items[0]?.kcal).toBe(body1.result.items[0]?.kcal);
      // Log has exactly ONE unique row for this cid (replay doesn't double-log).
      const uniqueCids = new Set(logRows.map((r) => r.client_id));
      expect(uniqueCids.size).toBe(1);
      expect(logInsert).toHaveBeenCalled();

      // Cache has at least one row keyed by the first-call input_hash.
      expect(cacheRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('vision route', () => {
    it('rejects a non-UUID client_id with 400', async () => {
      setupSsr('u-1');
      setupAdmin();
      setupCacheTagMock();

      const { POST } = await import('@/app/api/ai/vision/route');
      const tinyB64 = 'aGVsbG93b3JsZA=='; // base64 of 'helloworld'
      const res = await POST(
        new Request('http://kalori.test/api/ai/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'still-not-uuid',
            imageBase64: tinyB64,
          }),
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe('weekly-review route', () => {
    it('rejects a non-UUID client_id with 400', async () => {
      setupSsr('u-1');
      setupAdmin();
      setupCacheTagMock();

      const { POST } = await import('@/app/api/ai/weekly-review/route');
      const res = await POST(
        new Request('http://kalori.test/api/ai/weekly-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'nope',
            week_start_on: '2026-04-13',
          }),
        }),
      );
      expect(res.status).toBe(400);
    });
  });
});
