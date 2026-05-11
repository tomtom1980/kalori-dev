/**
 * MSW request handlers — default Gemini + Storage stubs (Task 1.3 AC;
 * testing-strategy.md §6; Task 3.2 deepens to share Zod schema per F-TEST-2).
 *
 * Scope: Vitest integration tests (node context) — NOT Playwright. MSW in
 * browser context needs a service worker which Task 1.3 does not wire. E2E
 * specs hit the real Next dev server; those specs don't exercise Gemini
 * until Task 3.2 lands `app/api/ai/**` routes.
 *
 * Path strategy — handlers match by absolute URL path pattern. Tests may
 * point fetch at any host (e.g. `http://kalori.test/api/ai/text-parse`)
 * because MSW matches on path + method, not origin. That keeps the test
 * fetches isolated from any real dev-server on localhost.
 *
 * Schema-shared shape (F-TEST-2 closure): the default Gemini-outbound stubs
 * return a `ParseResult`-shaped body that passes `lib/ai/schemas` Zod parse.
 * The earlier bespoke shape (items[].qty + totals block) has been removed;
 * every downstream handler now exercises the same contract the production
 * route uses.
 *
 * I3 reminder: handlers use path-relative matchers. No real GEMINI_API_KEY
 * appears anywhere in this file, and this file lives under tests/** so the
 * no-gemini-leak rule would not fire even if an env lookup appeared here.
 */
import { http, HttpResponse } from 'msw';

import {
  ParseResult,
  WeeklyReviewResult,
  type ParseResultT,
  type WeeklyReviewResultT,
} from '@/lib/ai/schemas';

/**
 * ParseResult-shaped default stub. Zod-validated at import time so a drift
 * in the schema is caught here before any test sees it.
 */
const DEFAULT_GEMINI_BODY: ParseResultT = ParseResult.parse({
  items: [
    {
      name: 'phở bò',
      portion: 1,
      unit: 'bowl',
      kcal: 450,
      macros: { protein_g: 28, carbs_g: 60, fat_g: 10, fiber_g: 2 },
      micros: {},
      confidence: 0.8,
    },
  ],
  reasoning: 'Standard phở bowl estimate — MSW default handler.',
});

/**
 * Weekly-review contract (architecture.md §6 row 3 + PRD.md:376-380): the
 * route returns `{body_markdown, sparse_data}`, NOT the ParseResult shape.
 * Zod-validated at import time.
 */
const DEFAULT_WEEKLY_REVIEW_BODY: WeeklyReviewResultT = WeeklyReviewResult.parse({
  body_markdown:
    'A quiet week in the ledger. Vietnamese staples held the keel; a few western interludes added variety without knocking the balance. Keep logging — the shape is just beginning to emerge.',
  sparse_data: false,
});

export const handlers = [
  // Outbound Gemini — production routes call
  // `https://generativelanguage.googleapis.com/v1beta/models/.../generateContent`.
  // Tests that need calibrated per-fixture responses install per-test
  // overrides via `server.use(...)`. The default body is the ParseResult
  // shape; weekly-review tests install an override when they need the
  // WeeklyReviewResult shape.
  http.post('*generativelanguage.googleapis.com/*', async () =>
    HttpResponse.json(DEFAULT_GEMINI_BODY),
  ),

  // Legacy route-hit handlers retained for backward-compat with earlier
  // Phase 1/2 integration specs that call `/api/ai/text-parse` via fetch
  // directly (without going through authFetch + real route). Text + vision
  // return ParseResult; weekly-review returns the documented
  // {body_markdown, sparse_data} contract.
  http.post('*/api/ai/text-parse', async () => HttpResponse.json(DEFAULT_GEMINI_BODY)),
  http.post('*/api/ai/photo-parse', async () => HttpResponse.json(DEFAULT_GEMINI_BODY)),
  http.post('*/api/ai/vision', async () => HttpResponse.json(DEFAULT_GEMINI_BODY)),
  http.post('*/api/ai/weekly-review', async () => HttpResponse.json(DEFAULT_WEEKLY_REVIEW_BODY)),

  // Supabase Storage signed-URL generation — kept for Task 3.3 continuity.
  http.post('https://*.supabase.co/storage/v1/object/sign/food-thumbnails/*', async () =>
    HttpResponse.json({ signedURL: '/test-stub/signed-url-placeholder' }),
  ),
];
