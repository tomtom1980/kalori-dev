/**
 * @vitest-environment node
 *
 * I7 graceful-degradation contract — fallback payload (Task 3.2 RED).
 *
 * Proves that every Gemini failure mode lands on a single response shape:
 * `{fallback: true, originalInput: <unknown>}` with HTTP 200 (so the
 * client can synchronously open the manual-entry form pre-filled with
 * `originalInput`). Failure modes covered:
 *   1. Timeout (>8s first-byte / >30s total — AbortError path)
 *   2. 500 from Gemini
 *   3. 429 rate limit
 *   4. Zod parse failure on a malformed Gemini response
 *
 * Every failure mode MUST still write exactly one `ai_call_log` row
 * (I2) — integration-level observation of the failure-tolerant logger.
 *
 * RED phase: route handler is a 501 stub; every assertion on status=200 +
 * `body.fallback` fails.
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';

function setupAdmin() {
  const insert = vi.fn(async () => ({ data: null, error: null }));
  const makeMissBuilder = () => {
    const builder = {
      eq: () => builder,
      single: async () => ({ data: null, error: { code: 'PGRST116' } }),
    };
    return builder;
  };
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({
      from: () => ({
        select: () => makeMissBuilder(),
        insert,
        upsert: insert,
      }),
    }),
  }));
  return { insert };
}

function setupSsr() {
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }),
      },
      from: makeServerFrom('u-1'),
    }),
  }));
}

describe('I7 — graceful degradation / fallback payload', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  async function invoke(originalInput: string) {
    const { POST } = await import('@/app/api/ai/text-parse/route');
    return POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: crypto.randomUUID(), userText: originalInput }),
      }),
    );
  }

  it('Gemini 500 → 200 + {fallback:true, originalInput} + one ai_call_log row', async () => {
    setupSsr();
    const { insert } = setupAdmin();
    server.use(
      http.post('*generativelanguage.googleapis.com/*', () =>
        HttpResponse.json({ error: 'server_error' }, { status: 500 }),
      ),
    );

    const originalInput = 'one bowl of phở bò';
    const res = await invoke(originalInput);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback: boolean; originalInput: string };
    expect(body.fallback).toBe(true);
    expect(body.originalInput).toBe(originalInput);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('Gemini 429 rate-limit → fallback + one log row', async () => {
    setupSsr();
    const { insert } = setupAdmin();
    server.use(
      http.post('*generativelanguage.googleapis.com/*', () =>
        HttpResponse.json({ error: 'rate_limited' }, { status: 429 }),
      ),
    );

    const res = await invoke('one bowl of phở bò');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback: boolean };
    expect(body.fallback).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('Gemini returns malformed JSON → Zod parse fails → fallback + one log row', async () => {
    setupSsr();
    const { insert } = setupAdmin();
    server.use(
      http.post('*generativelanguage.googleapis.com/*', () =>
        // Missing required fields (no items array, no reasoning) — Zod fails.
        HttpResponse.json({ bogus: true }),
      ),
    );

    const res = await invoke('one bowl of phở bò');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback: boolean };
    expect(body.fallback).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('Gemini stalls past the timeout boundary → AbortError → fallback + one log row', async () => {
    setupSsr();
    const { insert } = setupAdmin();
    // Handler hangs until the AbortController fires. We use a delayed
    // response longer than the handler's first-byte timeout.
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        return HttpResponse.json({ items: [], reasoning: '' });
      }),
    );

    const res = await invoke('one bowl of phở bò');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fallback: boolean };
    expect(body.fallback).toBe(true);
    expect(insert).toHaveBeenCalledTimes(1);
  }, 45_000);
});
