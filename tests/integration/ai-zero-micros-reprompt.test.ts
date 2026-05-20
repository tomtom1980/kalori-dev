/**
 * @vitest-environment node
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

const USER_ID = 'u-zero-micros';
const CLIENT_ID = '11111111-2222-4333-8444-555555555555';
const INPUT = 'sajtos tejfolos langos fokhagymaval';

function allZeroMicros(): Record<string, number> {
  return {
    vitamin_a: 0,
    vitamin_d: 0,
    vitamin_e: 0,
    vitamin_k: 0,
    vitamin_c: 0,
    thiamin: 0,
    riboflavin: 0,
    niacin: 0,
    pantothenic_acid: 0,
    vitamin_b6: 0,
    biotin: 0,
    folate: 0,
    vitamin_b12: 0,
    choline: 0,
    calcium: 0,
    phosphorus: 0,
    magnesium: 0,
    sodium: 0,
    chloride: 0,
    potassium: 0,
    iron: 0,
    zinc: 0,
    copper: 0,
    manganese: 0,
    selenium: 0,
    iodine: 0,
    chromium: 0,
    molybdenum: 0,
    fluoride: 0,
    sulfur: 0,
  };
}

function langosPayload(micros: Record<string, number>, reasoning: string) {
  return {
    items: [
      {
        name: 'Sajtos tejfolos langos fokhagymaval',
        portion: 1,
        unit: 'piece',
        approxGrams: 200,
        kcal: 600,
        macros: {
          protein_g: 20,
          carbs_g: 60,
          fat_g: 30,
          fiber_g: 2,
          cholesterol_mg: 80,
        },
        micros,
        confidence: 0.75,
      },
    ],
    reasoning,
  };
}

function geminiEnvelope(raw: unknown, totalTokenCount: number) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(raw) }] } }],
    usageMetadata: { totalTokenCount },
  };
}

function setupSsr() {
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      },
      from: makeServerFrom(USER_ID),
    }),
  }));
}

function setupAdmin(opts: { replayPayload?: unknown } = {}) {
  const logRows: unknown[] = [];
  const cacheRows: Array<{ parsed_payload: unknown }> = [];
  let cacheSelectCount = 0;

  const logSelect = () => {
    const builder = {
      eq: () => builder,
      maybeSingle: async () => ({
        data: opts.replayPayload
          ? { input_hash: 'old-all-zero-hash', call_type: 'text-parse' }
          : null,
        error: null,
      }),
      single: async () =>
        opts.replayPayload
          ? { data: { input_hash: 'old-all-zero-hash', call_type: 'text-parse' }, error: null }
          : { data: null, error: { code: 'PGRST116' } },
    };
    return builder;
  };
  const cacheSelect = () => {
    const builder = {
      eq: () => builder,
      single: async () => {
        cacheSelectCount += 1;
        if (opts.replayPayload && cacheSelectCount === 1) {
          return {
            data: {
              parsed_payload: opts.replayPayload,
              expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
              user_id: USER_ID,
            },
            error: null,
          };
        }
        return { data: null, error: { code: 'PGRST116' } };
      },
    };
    return builder;
  };
  const logInsert = vi.fn(async (row: unknown) => {
    logRows.push(row);
    return { data: null, error: null };
  });
  const cacheUpsert = vi.fn(async (row: { parsed_payload: unknown }) => {
    cacheRows.push(row);
    return { data: null, error: null };
  });

  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({
      from: (table: string) => {
        if (table === 'ai_call_log') return { select: logSelect, insert: logInsert };
        if (table === 'ai_response_cache') {
          return { select: cacheSelect, upsert: cacheUpsert, insert: cacheUpsert };
        }
        return { select: cacheSelect, insert: logInsert };
      },
    }),
  }));

  return { logRows, cacheRows };
}

function setupSentry() {
  const addBreadcrumb = vi.fn();
  const captureException = vi.fn();
  vi.doMock('@sentry/nextjs', () => ({
    addBreadcrumb,
    captureException,
  }));
  return { addBreadcrumb, captureException };
}

describe('text-parse all-zero micronutrient repair', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('@sentry/nextjs');
  });

  it('reprompts and caches the repaired payload when a substantial food returns all-zero micros', async () => {
    setupSsr();
    const { cacheRows, logRows } = setupAdmin();
    const { addBreadcrumb } = setupSentry();
    let geminiCalls = 0;

    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          return HttpResponse.json(
            langosPayload(
              allZeroMicros(),
              'Micronutrient data is largely unavailable, defaulting to zero.',
            ),
          );
        }
        return HttpResponse.json(
          langosPayload(
            {
              ...allZeroMicros(),
              sodium: 950,
              calcium: 360,
              phosphorus: 260,
              riboflavin: 0.22,
              vitamin_b12: 0.7,
              selenium: 12,
              iron: 2.4,
              zinc: 2.2,
            },
            'Re-estimated from fried dough, cheese, sour cream, and garlic toppings.',
          ),
        );
      }),
    );

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, userText: INPUT, region: 'other' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      fallback?: true;
      result?: { items: Array<{ micros: Record<string, number> }> };
    };

    expect(body.fallback).toBeUndefined();
    expect(geminiCalls).toBe(2);
    expect(body.result?.items[0]?.micros.sodium).toBe(950);
    expect(body.result?.items[0]?.micros.calcium).toBe(360);
    expect(cacheRows).toHaveLength(1);
    const cached = cacheRows[0]!.parsed_payload as {
      items: Array<{ micros: Record<string, number> }>;
    };
    expect(cached.items[0]?.micros.sodium).toBe(950);
    expect(logRows).toHaveLength(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'ai.micros',
        message: expect.stringMatching(/repair/i),
      }),
    );
  });

  it('does not cache a payload when the repair attempt still returns all-zero micros', async () => {
    setupSsr();
    const { cacheRows, logRows } = setupAdmin();
    const { captureException } = setupSentry();
    let geminiCalls = 0;

    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        return HttpResponse.json(
          geminiEnvelope(
            langosPayload(
              allZeroMicros(),
              geminiCalls === 1
                ? 'Micronutrient data is largely unavailable, defaulting to zero.'
                : 'Unable to find reference data, keeping zeros.',
            ),
            geminiCalls === 1 ? 100 : 75,
          ),
        );
      }),
    );

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, userText: INPUT, region: 'other' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback?: true; originalInput?: string };

    expect(body.fallback).toBe(true);
    expect(body.originalInput).toBe(INPUT);
    expect(geminiCalls).toBe(2);
    expect(cacheRows).toHaveLength(0);
    expect(logRows).toHaveLength(1);
    const logged = logRows[0] as { tokens?: number; cost_estimate?: number };
    expect(logged.tokens).toBe(175);
    expect(logged.cost_estimate).toBeGreaterThan(0);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { component: 'ai-text-parse' } }),
    );
  });

  it('repairs a suspicious idempotency replay without reusing the stale client_id log key', async () => {
    setupSsr();
    const { cacheRows, logRows } = setupAdmin({
      replayPayload: langosPayload(
        allZeroMicros(),
        'Micronutrient data is largely unavailable, defaulting to zero.',
      ),
    });
    setupSentry();
    let geminiCalls = 0;

    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          return HttpResponse.json(
            langosPayload(
              allZeroMicros(),
              'Micronutrient data is largely unavailable, defaulting to zero.',
            ),
          );
        }
        return HttpResponse.json(
          langosPayload(
            { ...allZeroMicros(), sodium: 950, calcium: 360 },
            'Re-estimated from fried dough, cheese, sour cream, and garlic toppings.',
          ),
        );
      }),
    );

    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CLIENT_ID, userText: INPUT, region: 'other' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { items: Array<{ micros: Record<string, number> }> };
    };
    expect(body.result?.items[0]?.micros.sodium).toBe(950);
    expect(geminiCalls).toBe(2);
    expect(cacheRows).toHaveLength(1);
    expect(logRows).toHaveLength(1);
    const logged = logRows[0] as { client_id?: string };
    expect(logged.client_id).toBeUndefined();
  });
});
