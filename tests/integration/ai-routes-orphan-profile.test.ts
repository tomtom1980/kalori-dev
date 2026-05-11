/**
 * @vitest-environment node
 *
 * Integration — orphan-profile fence on AI parse routes
 * (Phase A Codex Round 1 Improvement Finding #5).
 *
 * Until this regression suite, /api/ai/text-parse and /api/ai/vision stopped
 * at `auth.getUser()` and then proceeded straight into cache lookup, Gemini
 * calls, cache writes, and `ai_call_log` writes — bypassing the fence that
 * every other aggregate / mutation route already enforces. An authenticated
 * user with a deleted profile could therefore consume AI quota and write AI
 * telemetry while every other route returned 422 `profile_lookup_failed`.
 *
 * Proves:
 *   - On orphan profile (auth user exists, profiles row is null), each AI
 *     parse route returns HTTP 422 with body `{ error: 'profile_lookup_failed' }`.
 *     Status code is 422, NOT 401, per the Phase A Codex Round 1 Critical #1
 *     fix that flipped the orphan branch out of authFetch's session-expiry
 *     pattern. Body shape is unchanged so existing client matchers keep
 *     working.
 *   - Happy path: with a present profile row, the fence does NOT short-circuit
 *     the request. We assert the response is something OTHER than the orphan
 *     422 / `profile_lookup_failed` shape — the rest of the route flow
 *     (Gemini, cache, log) is exercised by the per-route happy-path tests
 *     (`ai-text-parse.test.ts`, `ai-vision.test.ts`); we only verify here that
 *     the fence lets the call through when the profile exists.
 *
 * Mock approach mirrors `tests/integration/dashboard-orphan-profile.test.ts`
 * AC2 block — a single `getServerSupabase` mock that flips
 * `profileResult` between `null` (orphan) and a fake profile row, and an
 * `auth.getUser()` that always succeeds with a fixed UUID.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

const UUID = {
  textClient: '22222222-2222-4222-8222-222222222222',
  visionClient: '33333333-3333-4333-8333-333333333333',
};

interface SupabaseFromCall {
  table: string;
  cols?: string;
  eqArgs: Array<[string, unknown]>;
}

/**
 * Build a getServerSupabase() mock with two mutually exclusive states:
 *   - profileResult === null → orphan (fence MUST 422)
 *   - profileResult === non-null → happy path (fence MUST pass through)
 *
 * Other tables return empty data so the route's downstream code (cache lookup,
 * etc.) doesn't crash before we observe the fence outcome.
 */
function buildSupabaseMock(opts: {
  profileResult: unknown;
  profileError?: unknown;
  calls?: SupabaseFromCall[];
}): {
  auth: {
    getUser: () => Promise<unknown>;
  };
  from: (table: string) => unknown;
} {
  const calls = opts.calls ?? [];
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: TEST_USER_ID } },
        error: null,
      }),
    },
    from: (table: string) => {
      const eqArgs: Array<[string, unknown]> = [];
      const lastCall: SupabaseFromCall = { table, eqArgs };
      calls.push(lastCall);

      if (table === 'profiles') {
        const profileSelect = (cols: string): unknown => {
          lastCall.cols = cols;
          const chain = {
            eq: (col: string, val: unknown) => {
              eqArgs.push([col, val]);
              return chain;
            },
            maybeSingle: async () => ({
              data: opts.profileResult ?? null,
              error: opts.profileError ?? null,
            }),
            single: async () => ({
              data: opts.profileResult ?? null,
              error: opts.profileError ?? null,
            }),
          };
          return chain;
        };
        return { select: profileSelect };
      }

      // Other tables — happy-path AI flow may touch ai_response_cache /
      // ai_call_log; we don't need to mimic the exact contract here, only
      // ensure the chain returns "no data" so the route continues without
      // crashing. The orphan path never reaches these tables anyway.
      const fauxChain: Record<string, unknown> = {};
      const passThrough = () => fauxChain;
      Object.assign(fauxChain, {
        select: (cols?: string) => {
          if (typeof cols === 'string') lastCall.cols = cols;
          return fauxChain;
        },
        insert: passThrough,
        update: passThrough,
        delete: passThrough,
        upsert: passThrough,
        eq: (col: string, val: unknown) => {
          eqArgs.push([col, val]);
          return fauxChain;
        },
        neq: passThrough,
        order: passThrough,
        limit: passThrough,
        in: passThrough,
        is: passThrough,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: { code: 'PGRST116' } }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 }),
      });
      return fauxChain;
    },
  };
}

const sentryMocks = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: sentryMocks.addBreadcrumb,
  captureException: sentryMocks.captureException,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => null, getAll: () => [] }),
}));

interface AiCase {
  name: string;
  importPath: string;
  buildRequest: () => Request;
}

const AI_CASES: AiCase[] = [
  {
    name: 'ai/text-parse',
    importPath: '@/app/api/ai/text-parse/route',
    buildRequest: () =>
      new Request('http://localhost/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID.textClient,
          userText: 'two eggs and toast',
        }),
      }),
  },
  {
    name: 'ai/vision',
    importPath: '@/app/api/ai/vision/route',
    buildRequest: () =>
      new Request('http://localhost/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID.visionClient,
          // Smallest valid base64 PNG (1x1 transparent) — under the 500kb limit.
          imageBase64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAEAAAUAAB1apJEAAAAASUVORK5CYII=',
          mimeType: 'image/png',
        }),
      }),
  },
];

describe('AI parse routes — orphan-profile fence (Phase A Codex Round 1 Improvement #5)', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  for (const ac of AI_CASES) {
    it(`${ac.name} — orphan profile yields HTTP 422 {error:'profile_lookup_failed'}`, async () => {
      const supabaseMock = buildSupabaseMock({
        profileResult: null,
        profileError: null,
      });
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(ac.importPath)) as Record<string, unknown>;
      const req = ac.buildRequest();
      const res = await (mod.POST as (req: Request) => Promise<Response>)(req);

      // Codex R1 #1 — orphan fence returns 422 (NOT 401, NOT 200) so authFetch
      // does not interpret it as session-expiry. Body shape unchanged.
      expect(res.status).toBe(422);
      expect(res.status).not.toBe(401);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe('profile_lookup_failed');
    });
  }

  for (const ac of AI_CASES) {
    it(`${ac.name} — present profile passes the fence (no orphan short-circuit)`, async () => {
      const supabaseMock = buildSupabaseMock({
        profileResult: { id: TEST_USER_ID, onboarding_completed_at: '2026-01-01T00:00:00.000Z' },
        profileError: null,
      });
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(ac.importPath)) as Record<string, unknown>;
      const req = ac.buildRequest();
      const res = await (mod.POST as (req: Request) => Promise<Response>)(req);

      // Fence MUST NOT short-circuit when profile exists: anything other than
      // the 422/profile_lookup_failed shape proves the request continued past
      // the fence. The full happy-path (Gemini call, cache write, etc.) is
      // covered by ai-text-parse.test.ts / ai-vision.test.ts; here we only
      // verify the fence let the request through. Note that the catch-block
      // in both routes returns `{ fallback: true, ... }` with status 200 when
      // downstream Gemini calls fail — that is ALSO a valid pass-through
      // outcome for this test (the fence didn't short-circuit), so we accept
      // any status that is NOT 422 with profile_lookup_failed.
      if (res.status === 422) {
        const body = (await res.clone().json()) as { error?: string };
        expect(body.error).not.toBe('profile_lookup_failed');
      }
      // Affirmative check: the most likely outcome with our minimal mock is
      // a 200 fallback envelope (Gemini key absent → wrapper throws →
      // I7 graceful degradation). Either way, status MUST NOT be the orphan
      // signal.
      expect(
        res.status === 422 && (await res.clone().json()).error === 'profile_lookup_failed',
      ).toBe(false);
    });
  }
});
