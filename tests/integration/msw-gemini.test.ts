/**
 * Integration test for MSW Gemini stub handlers (Task 1.3 AC; Task 3.2
 * migrated to the ParseResult-shaped default after F-TEST-2 closure).
 *
 * Proves:
 *   - Default handlers intercept POST /api/ai/text-parse and return a
 *     ParseResult-shaped body (items + reasoning).
 *   - `server.resetHandlers()` isolation — a test-level override applies only
 *     to that test; the next test sees the default stub again.
 *
 * Why MSW in Vitest (not Playwright)? Playwright runs real browser +
 * real Next dev server — MSW browser mode would need a service worker.
 * Vitest in Node process uses `msw/node` which intercepts at the fetch
 * adapter layer, so integration specs exercising the real client fetch code
 * path get deterministic AI responses without any dev-server process.
 */
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../mocks/server';

// Global Vitest setup (`tests/setup.ts`) already invokes `server.listen()`
// before the suite and `server.resetHandlers()` in `afterEach`, so specs
// don't need to wire those manually. We still import `server` here to
// install per-test overrides via `server.use(...)` — see the isolation tests
// below.

describe('tests/integration/msw-gemini', () => {
  it('intercepts POST /api/ai/text-parse with the canonical ParseResult stub', async () => {
    const response = await fetch('http://kalori.test/api/ai/text-parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '2 eggs and avocado toast' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{
        name: string;
        kcal: number;
        macros: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
      }>;
      reasoning: string;
    };
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBeGreaterThan(0);
    const firstItem = body.items[0];
    expect(firstItem).toBeDefined();
    expect(firstItem?.name).toBeTypeOf('string');
    expect(firstItem?.kcal).toBeTypeOf('number');
    expect(firstItem?.macros.protein_g).toBeTypeOf('number');
    expect(body.reasoning).toBeTypeOf('string');
  });

  it('intercepts POST /api/ai/photo-parse with the canonical stub response', async () => {
    const response = await fetch('http://kalori.test/api/ai/photo-parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'deadbeef' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ name: string }> };
    const firstItem = body.items[0];
    expect(firstItem).toBeDefined();
    expect(firstItem?.name).toBeTypeOf('string');
  });

  it('intercepts POST /api/ai/weekly-review with the documented {body_markdown, sparse_data} stub', async () => {
    const response = await fetch('http://kalori.test/api/ai/weekly-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weekStartOn: '2026-04-14' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { body_markdown: string; sparse_data: boolean };
    expect(body.body_markdown).toBeTypeOf('string');
    expect(body.body_markdown.length).toBeGreaterThan(0);
    expect(body.sparse_data).toBeTypeOf('boolean');
  });

  it('server.resetHandlers() isolates per-test overrides', async () => {
    // Override for this one test only.
    server.use(
      http.post('http://kalori.test/api/ai/text-parse', async () =>
        HttpResponse.json({
          items: [
            {
              name: 'OVERRIDE',
              portion: 1,
              unit: 'x',
              kcal: 1,
              macros: { protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0 },
              micros: {},
              confidence: 0.5,
            },
          ],
          reasoning: 'test override',
        }),
      ),
    );

    const first = await fetch('http://kalori.test/api/ai/text-parse', {
      method: 'POST',
      body: JSON.stringify({ text: 'x' }),
    });
    const firstBody = (await first.json()) as { reasoning: string };
    expect(firstBody.reasoning).toBe('test override');
  });

  it('after resetHandlers(), the next test sees the default stub (override has been cleared)', async () => {
    // This test runs AFTER the previous one. `afterEach(server.resetHandlers)`
    // should have cleared the 'test override' handler. If it didn't, this
    // assertion fails and surfaces the isolation bug.
    const response = await fetch('http://kalori.test/api/ai/text-parse', {
      method: 'POST',
      body: JSON.stringify({ text: 'x' }),
    });
    const body = (await response.json()) as { reasoning: string };
    expect(body.reasoning).not.toBe('test override');
  });
});
