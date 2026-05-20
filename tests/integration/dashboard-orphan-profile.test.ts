/**
 * @vitest-environment node
 *
 * Task A.3 / US-STAB-A3 — Orphan-profile fence (AC1–AC6).
 *
 * Brownfield two-RED contract:
 *   RED-1 (characterization): existing dashboard-page-onboarding-guard /
 *     progress-page / weight-page / onboarding-page guard tests must stay
 *     GREEN at HEAD. Tracked by `npm test -- <those files>` regression.
 *   RED-2 (new behavior): the assertions below FAIL until
 *     `lib/auth/orphan-profile-fence.ts` is wired into the 6 page handlers
 *     + 14 affected API routes.
 *
 * AC coverage:
 *   AC1 — page handlers redirect 302 to /onboarding on orphan profile.
 *   AC2 — API endpoints return JSON 401 `{error:"profile_lookup_failed"}`.
 *   AC3 — Sentry breadcrumb `dashboard.orphan-profile-fenced` w/ SHA-256 anonymized user_id.
 *   AC4 — auth.uid() scoping via fence using server-side user.id (not client-supplied).
 *   AC5 — two-step fence with auth.uid() server-scoping (no redundant profiles SELECT per request).
 *         Note: AC5 wording in Planning/tasks.md retains "TOCTOU-safe single LEFT JOIN" — see
 *         task-A.3-output.md "Codex Round 2" section. Production query is two-step (auth.getUser
 *         + profiles.select.maybeSingle); not atomic with auth. RPC-atomic variant deferred to
 *         followup F-A3-RPC-ATOMIC.
 *   AC6 — fallback-create branch (if chosen): exact INSERT shape, no client fields, then redirect.
 *         **Recommended path: pure redirect; this implementation chooses it. The AC6 test asserts
 *         NO insert is attempted (per briefing §3 AC6 GREEN-means: pure-redirect path).**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

// Bug 3 (library overhaul 2026-05-16) — `/api/library/[id]/update` now
// imports `@/lib/storage/sign-thumbnail` which pulls in `server-only`;
// the AC2 endpoint matrix imports the update route, so stub it for the
// node test environment.
vi.mock('server-only', () => ({}));

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');

interface SupabaseFromCall {
  table: string;
  cols?: string;
  eqArgs: Array<[string, unknown]>;
}

/**
 * Build a supabase mock that returns NULL for any `profiles` row read
 * (orphan state) and tracks every `.from()` invocation for assertion.
 *
 * The same factory accepts:
 *   - `profileResult`: row | null, for the profiles SELECT result
 *   - `profileError`: optional error object
 */
function buildSupabaseMock(opts: {
  user?: { id: string } | null;
  authError?: unknown;
  profileResult?: unknown;
  profileError?: unknown;
  // Record every from() call for AC4/AC5 assertions
  calls?: SupabaseFromCall[];
  // Per-table fallback for non-profiles tables
  otherTables?: Record<
    string,
    {
      data?: unknown;
      error?: unknown;
      count?: number;
    }
  >;
}): {
  auth: {
    getUser: () => Promise<unknown>;
    signOut: () => Promise<{ error: null }>;
  };
  from: (table: string) => unknown;
  storage: {
    from: () => {
      upload: () => Promise<{ data: null; error: null }>;
      createSignedUrl: () => Promise<{ data: { signedUrl: string }; error: null }>;
    };
  };
} {
  const calls = opts.calls ?? [];
  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.user === undefined ? { id: TEST_USER_ID } : opts.user },
        error: opts.authError ?? null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => {
      // Generic chainable that records eq() args.
      const eqArgs: Array<[string, unknown]> = [];
      const lastCall: SupabaseFromCall = { table, eqArgs };
      calls.push(lastCall);

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

      if (table === 'profiles') {
        return {
          select: profileSelect,
          insert: (payload: unknown) => {
            // Track inserts for AC6 assertion
            (lastCall as SupabaseFromCall & { insertPayload?: unknown }).insertPayload = payload;
            return {
              select: () => ({
                single: async () => ({ data: payload, error: null }),
              }),
              onConflict: () => ({}),
            };
          },
          update: () => ({
            eq: () => ({
              select: () => ({ single: async () => ({ data: null, error: null }) }),
            }),
          }),
          upsert: () => ({
            select: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        };
      }

      // Other tables — never reached on orphan-profile redirect path.
      // Comprehensive chain so any unexpected aggregate access on orphan
      // path doesn't crash the test before the fence assertion fires.
      const others = opts.otherTables?.[table] ?? { data: [], error: null, count: 0 };
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
        gt: passThrough,
        gte: passThrough,
        lt: passThrough,
        lte: passThrough,
        like: passThrough,
        ilike: passThrough,
        is: passThrough,
        in: passThrough,
        contains: passThrough,
        containedBy: passThrough,
        rangeLt: passThrough,
        rangeGt: passThrough,
        rangeGte: passThrough,
        rangeLte: passThrough,
        rangeAdjacent: passThrough,
        overlaps: passThrough,
        textSearch: passThrough,
        match: passThrough,
        not: passThrough,
        or: passThrough,
        filter: passThrough,
        order: passThrough,
        limit: passThrough,
        range: passThrough,
        abortSignal: passThrough,
        csv: passThrough,
        explain: passThrough,
        returns: passThrough,
        maybeSingle: async () => ({ data: others.data ?? null, error: others.error ?? null }),
        single: async () => ({ data: others.data ?? null, error: others.error ?? null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data: others.data ?? [],
            error: others.error ?? null,
            count: others.count ?? 0,
          }),
      });
      return fauxChain;
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'x' }, error: null }),
      }),
    },
  };
}

const sentryMocks = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const navMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: sentryMocks.addBreadcrumb,
  captureException: sentryMocks.captureException,
}));

vi.mock('next/navigation', () => ({
  redirect: navMocks.redirect,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => null, getAll: () => [] }),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Stub out heavy components — we exercise routing only.
vi.mock('@/components/dashboard/Masthead', () => ({ Masthead: () => null }));
vi.mock('@/components/charts/ChronometerRing', () => ({ ChronometerRing: () => null }));
vi.mock('@/components/dashboard/MacroBars', () => ({ MacroBars: () => null }));
vi.mock('@/components/dashboard/MealsBulletin', () => ({ MealsBulletin: () => null }));
vi.mock('@/components/dashboard/WaterTracker', () => ({ WaterTracker: () => null }));
vi.mock('@/components/dashboard/MicronutrientPanel', () => ({ MicronutrientPanel: () => null }));
vi.mock('@/components/dashboard/WeeklyInsightCard', () => ({ WeeklyInsightCard: () => null }));
vi.mock('@/components/dashboard/WeeklyInsightSkeleton', () => ({
  WeeklyInsightSkeleton: () => null,
}));
vi.mock('@/components/dashboard/TargetUpdatedNudgeWrapper', () => ({
  TargetUpdatedNudgeWrapper: () => null,
}));
vi.mock('@/lib/dashboard/fetch', () => ({
  fetchProfile: vi.fn(),
  fetchDaySnapshot: vi.fn(),
}));
vi.mock('@/lib/time/day', () => ({
  userTzNowIso: () => '2026-05-01T00:00:00.000Z',
  userTzToday: () => '2026-05-01',
  userTzDayUtcRange: () => ({ startUtc: '', endUtc: '' }),
  userTzDayFrom: () => '2026-05-01',
}));

vi.mock('@/components/charts/CalorieAdherenceBar', () => ({ CalorieAdherenceBar: () => null }));
vi.mock('@/components/charts/ChartSkeleton', () => ({ ChartSkeleton: () => null }));
vi.mock('@/components/charts/LoggingConsistencyCalendar', () => ({
  LoggingConsistencyCalendar: () => null,
}));
vi.mock('@/components/charts/MacroDistributionStackedArea', () => ({
  MacroDistributionStackedArea: () => null,
}));
vi.mock('@/components/charts/MicronutrientHeatmap', () => ({ MicronutrientHeatmap: () => null }));
vi.mock('@/components/charts/TrendSummary', () => ({ TrendSummary: () => null }));
vi.mock('@/components/charts/WeeklyReviewSkeleton', () => ({ WeeklyReviewSkeleton: () => null }));
vi.mock('@/components/charts/WeightTrajectoryLine', () => ({ WeightTrajectoryLine: () => null }));
vi.mock('@/lib/aggregations/progress-fetch', () => ({ fetchProgressSnapshot: vi.fn() }));
vi.mock('@/app/(app)/progress/_components/ProgressRangeToolbar', () => ({
  ProgressRangeToolbar: () => null,
}));
vi.mock('@/app/(app)/progress/_components/weekly-review-island', () => ({
  WeeklyReviewIsland: () => null,
}));
vi.mock('@/components/dashboard/WeightQuickAdd', () => ({ WeightQuickAdd: () => null }));
vi.mock('@/lib/library/fetch', () => ({
  fetchLibraryPage: vi.fn(async () => ({ items: [] })),
}));
// Task C.2 — /library now also parallel-fetches Recent Entries; stub it
// out so the orphan-fence smoke test doesn't pull in `server-only`.
vi.mock('@/lib/library/fetchRecentEntries', () => ({
  fetchRecentEntries: vi.fn(async () => []),
}));
vi.mock('@/lib/library/getItem', () => ({
  getLibraryItemById: vi.fn(async () => null),
}));
vi.mock('@/app/(app)/log/_components/LogPageClient', () => ({
  LogPageClient: () => null,
}));
vi.mock('@/app/(app)/library/_components/LibraryClient', () => ({
  LibraryClient: () => null,
}));
vi.mock('@/app/(app)/library/_components/LibraryEmptyState', () => ({
  LibraryEmptyState: () => null,
}));
vi.mock('@/app/(app)/library/_components/LibraryMasthead', () => ({
  LibraryMasthead: () => null,
}));
vi.mock('@/app/(app)/settings/_components/AccountSubsection', () => ({
  AccountSubsection: () => null,
}));
vi.mock('@/app/(app)/settings/_components/DataSubsection', () => ({
  DataSubsection: () => null,
}));
vi.mock('@/app/(app)/settings/_components/ReduceMotionToggle', () => ({
  ReduceMotionToggle: () => null,
}));

// ============================================================
// AC1 — Page handlers redirect 302 to /onboarding on orphan profile
// ============================================================

interface PageCase {
  name: string;
  importPath: string;
  invoke: (mod: { default: (...args: unknown[]) => unknown }) => Promise<unknown>;
}

const PAGE_CASES: PageCase[] = [
  {
    name: 'dashboard',
    importPath: '@/app/(app)/dashboard/page',
    invoke: async (mod) => mod.default(),
  },
  {
    name: 'log',
    importPath: '@/app/(app)/log/page',
    invoke: async (mod) => mod.default({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'library',
    importPath: '@/app/(app)/library/page',
    invoke: async (mod) => mod.default(),
  },
  {
    name: 'progress',
    importPath: '@/app/(app)/progress/page',
    invoke: async (mod) => mod.default({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'weight',
    importPath: '@/app/(app)/weight/page',
    invoke: async (mod) => mod.default(),
  },
  {
    name: 'settings',
    importPath: '@/app/(app)/settings/page',
    invoke: async (mod) => mod.default(),
  },
];

// Status: 307 (Next.js 16 Server Component redirect via next/navigation 'redirect()' default RedirectType.replace). AC1 in tasks.md cites '302'; see task-A.3-output.md "Codex Round 1" section for rationale.
describe('AC1 — page handlers redirect 302 to /onboarding on orphan profile', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  for (const pc of PAGE_CASES) {
    it(`redirects-302-to-onboarding [${pc.name}]`, async () => {
      const calls: SupabaseFromCall[] = [];
      const supabaseMock = buildSupabaseMock({
        user: { id: TEST_USER_ID },
        profileResult: null,
        profileError: null,
        calls,
      });
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(pc.importPath)) as { default: (...args: unknown[]) => unknown };
      await expect(pc.invoke(mod)).rejects.toThrow(/NEXT_REDIRECT:\/onboarding/);
      expect(navMocks.redirect).toHaveBeenCalledWith('/onboarding');
      // Status 307: redirect() is invoked with no second argument → defaults to RedirectType.replace → HTTP 307.
      // (Next.js 16 Server Component contract; permanentRedirect() would be 308. No 302 path without Route Handler refactor.)
      expect(navMocks.redirect).toHaveBeenCalledTimes(1);
      expect(navMocks.redirect.mock.calls[0]).toHaveLength(1);
    });
  }
});

// ============================================================
// AC2 — API endpoints return JSON 401 {error:'profile_lookup_failed'}
// ============================================================

interface ApiCase {
  name: string;
  importPath: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  buildRequest: () => Request;
  invoke?: (mod: Record<string, unknown>, req: Request) => Promise<Response>;
}

// Real UUIDs (pre-validated to match z.string().uuid()) for each route slot.
const UUID = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
];

const API_CASES: ApiCase[] = [
  {
    name: 'library/merge',
    importPath: '@/app/api/library/merge/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/library/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[2],
          winnerId: UUID[3],
          loserId: UUID[4],
          fields: {
            display_name: 'x',
            nutrition: { kcal: 100, macros: { protein_g: 1, carbs_g: 1, fat_g: 1 } },
          },
        }),
      }),
  },
  {
    name: 'library/[id]/update',
    importPath: '@/app/api/library/[id]/update/route',
    method: 'POST',
    buildRequest: () =>
      new Request(`http://localhost/api/library/${UUID[5]}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[6],
          fields: { display_name: 'x' },
        }),
      }),
    invoke: async (mod, req) => {
      const fn = mod.POST as (req: Request, ctx: unknown) => Promise<Response>;
      return fn(req, { params: Promise.resolve({ id: UUID[5] }) });
    },
  },
  {
    name: 'library/[id]/delete',
    importPath: '@/app/api/library/[id]/delete/route',
    method: 'POST',
    buildRequest: () =>
      new Request(`http://localhost/api/library/${UUID[7]}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_client_id: UUID[8] }),
      }),
    invoke: async (mod, req) => {
      const fn = mod.POST as (req: Request, ctx: unknown) => Promise<Response>;
      return fn(req, { params: Promise.resolve({ id: UUID[7] }) });
    },
  },
  {
    name: 'library/bulk-delete',
    importPath: '@/app/api/library/bulk-delete/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/library/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [UUID[9]],
          delete_client_ids: [UUID[10]],
        }),
      }),
  },
  {
    name: 'library/bulk-delete/undo',
    importPath: '@/app/api/library/bulk-delete/undo/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/library/bulk-delete/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ids: [UUID[0]] }),
      }),
  },
  {
    name: 'library/dedup-check',
    importPath: '@/app/api/library/dedup-check/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/library/dedup-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalized_name: 'eggs' }),
      }),
  },
  {
    name: 'entries/save',
    importPath: '@/app/api/entries/save/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/entries/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[1],
          logged_at: '2026-05-01T10:00:00.000Z',
          meal_category: 'breakfast',
          source: 'text',
          items: [{ name: 'eggs', portion: 2, unit: 'unit', kcal: 140 }],
        }),
      }),
  },
  {
    name: 'entries/[id] DELETE',
    importPath: '@/app/api/entries/[id]/route',
    method: 'DELETE',
    buildRequest: () =>
      new Request(`http://localhost/api/entries/${UUID[2]}`, {
        method: 'DELETE',
      }),
    invoke: async (mod, req) => {
      const fn = mod.DELETE as (req: Request, ctx: unknown) => Promise<Response>;
      return fn(req, { params: Promise.resolve({ id: UUID[2] }) });
    },
  },
  {
    name: 'entries/copy-yesterday',
    importPath: '@/app/api/entries/copy-yesterday/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/entries/copy-yesterday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [UUID[3]],
          new_client_ids: [UUID[4]],
        }),
      }),
  },
  {
    name: 'water/log',
    importPath: '@/app/api/water/log/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/water/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[5],
          unit: 'glass',
          count: 1,
          logged_on: '2026-05-01',
        }),
      }),
  },
  {
    name: 'weight/log',
    importPath: '@/app/api/weight/log/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/weight/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[6],
          weight_kg: 70,
          date: '2026-05-01',
        }),
      }),
  },
  {
    name: 'ai/weekly-review',
    importPath: '@/app/api/ai/weekly-review/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/ai/weekly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[7],
          week_start_on: '2026-04-27',
        }),
      }),
  },
  {
    name: 'storage/thumbnail',
    importPath: '@/app/api/storage/thumbnail/route',
    method: 'POST',
    buildRequest: () =>
      new Request('http://localhost/api/storage/thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: UUID[8],
          imageBase64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAEAAAUAAB1apJEAAAAASUVORK5CYII=',
          mimeType: 'image/png',
        }),
      }),
  },
  {
    name: 'export/csv',
    importPath: '@/app/api/export/csv/route',
    method: 'GET',
    buildRequest: () => new Request('http://localhost/api/export/csv'),
    invoke: async (mod) => {
      const fn = mod.GET as () => Promise<Response>;
      return fn();
    },
  },
  {
    name: 'export/json',
    importPath: '@/app/api/export/json/route',
    method: 'GET',
    buildRequest: () => new Request('http://localhost/api/export/json'),
    invoke: async (mod) => {
      const fn = mod.GET as () => Promise<Response>;
      return fn();
    },
  },
  {
    name: 'export/zip',
    importPath: '@/app/api/export/zip/route',
    method: 'GET',
    buildRequest: () => new Request('http://localhost/api/export/zip'),
    invoke: async (mod) => {
      const fn = mod.GET as () => Promise<Response>;
      return fn();
    },
  },
];

describe('AC2 — API endpoints return JSON 422 {error:profile_lookup_failed} on orphan profile (Codex R1 #1: status flipped from 401 → 422 to escape authFetch session-expiry pattern)', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  for (const ac of API_CASES) {
    it(`all-aggregate-api-endpoints-401 [${ac.name}]`, async () => {
      const calls: SupabaseFromCall[] = [];
      const supabaseMock = buildSupabaseMock({
        user: { id: TEST_USER_ID },
        profileResult: null,
        profileError: null,
        calls,
      });
      vi.doMock('@/lib/supabase/server', () => ({
        getServerSupabase: async () => supabaseMock,
      }));

      const mod = (await import(ac.importPath)) as Record<string, unknown>;
      const req = ac.buildRequest();
      const res = ac.invoke
        ? await ac.invoke(mod, req)
        : await (mod[ac.method] as (req: Request) => Promise<Response>)(req);

      // Codex R1 #1 — orphan branch flipped from 401 → 422 to escape
      // authFetch's session-expiry pattern-match. Body shape unchanged.
      expect(res.status).toBe(422);
      expect(res.status).not.toBe(401);
      expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe('profile_lookup_failed');
    });
  }
});

// ============================================================
// AC3 — Sentry breadcrumb with anonymized user_id (SHA-256)
// ============================================================

describe('AC3 — Sentry breadcrumb on orphan detection has SHA-256 anonymized user_id', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('sentry-breadcrumb fires with category dashboard.orphan-profile-fenced and hashed user_id (no raw UUID)', async () => {
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: null,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    const expectedHash = sha256Hex(TEST_USER_ID);
    const mod = (await import('@/app/(app)/dashboard/page')) as {
      default: () => Promise<unknown>;
    };
    await expect(mod.default()).rejects.toThrow(/NEXT_REDIRECT:\/onboarding/);

    expect(sentryMocks.addBreadcrumb).toHaveBeenCalled();
    const calls = sentryMocks.addBreadcrumb.mock.calls;
    // Find the breadcrumb with our category.
    const fenced = calls.find((args) => {
      const arg = (args as unknown[])[0];
      return (
        typeof arg === 'object' &&
        arg !== null &&
        (arg as { category?: string }).category === 'dashboard.orphan-profile-fenced'
      );
    });
    expect(fenced).toBeTruthy();
    const breadcrumb = (fenced as unknown[])[0] as { data?: Record<string, unknown> };
    const dataObj = breadcrumb.data ?? {};
    // Hash MUST appear; raw UUID MUST NOT.
    expect(dataObj.user_id_hash).toBe(expectedHash);
    const stringified = JSON.stringify(breadcrumb);
    expect(stringified).not.toContain(TEST_USER_ID);
  });
});

// ============================================================
// AC4 — auth.uid() scoping (server-side, never client-supplied)
// ============================================================

describe('AC4 — auth.uid() scoping enforced; never trust client-supplied id', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('auth-uid-scoping-enforced-on-every-aggregate (server uses auth.getUser().id, ignores other-user inputs)', async () => {
    // Server returns TEST_USER_ID; we plant OTHER_USER_ID rows that the
    // fence MUST NOT read since it scopes by auth.uid() = TEST_USER_ID.
    // If the fence forgot to scope, OTHER_USER_ID's profile would be
    // returned and the orphan branch would not fire.
    const calls: SupabaseFromCall[] = [];
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: null,
      calls,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    const mod = (await import('@/app/(app)/dashboard/page')) as {
      default: () => Promise<unknown>;
    };
    await expect(mod.default()).rejects.toThrow(/NEXT_REDIRECT:\/onboarding/);

    // Every profiles SELECT in the trace MUST .eq('id', TEST_USER_ID) —
    // never OTHER_USER_ID, never an unfiltered scan.
    const profilesCalls = calls.filter((c) => c.table === 'profiles');
    expect(profilesCalls.length).toBeGreaterThan(0);
    for (const pc of profilesCalls) {
      const idEq = pc.eqArgs.find(([col]) => col === 'id');
      expect(idEq).toBeDefined();
      expect(idEq![1]).toBe(TEST_USER_ID);
      expect(idEq![1]).not.toBe(OTHER_USER_ID);
    }
  });
});

// ============================================================
// AC5 — Two-step fence with auth.uid() server-scoping
// (rescoped — see Codex Round 2 section in task-A.3-output.md)
// ============================================================
// AC5 (rescoped): production fence is two-step (auth.getUser +
// profiles.select.maybeSingle). The single-call assertion below verifies
// the fence does NOT issue a redundant profiles.select; it does NOT
// verify atomicity. Atomic single-pass is deferred to a future RPC-based
// task (followup F-A3-RPC-ATOMIC). Original AC5 wording in
// Planning/tasks.md retained as docs-followup.

describe('AC5 — two-step fence with auth.uid() server-scoping (exactly one profiles SELECT per fence call)', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('two-step-fence-no-redundant-profiles-select (fence issues exactly one profiles SELECT before redirect)', async () => {
    const calls: SupabaseFromCall[] = [];
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: null,
      calls,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    // Use a leaf API route — it has the simplest pre-fence path so the
    // call count assertion is unambiguous. Library/dedup-check is a
    // user-aggregate consumer route (food_library_items).
    const mod = (await import('@/app/api/library/dedup-check/route')) as Record<string, unknown>;
    const req = new Request('http://localhost/api/library/dedup-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalized_name: 'eggs' }),
    });
    const res = await (mod.POST as (req: Request) => Promise<Response>)(req);
    // Codex R1 #1 — orphan branch flipped 401 → 422 (escapes authFetch session-expiry pattern).
    expect(res.status).toBe(422);

    // Fence path issues ONE profiles SELECT and short-circuits. Aggregate
    // tables are NOT touched on orphan-profile path.
    const profilesCalls = calls.filter((c) => c.table === 'profiles');
    expect(profilesCalls.length).toBe(1);
    const aggregateCalls = calls.filter((c) => c.table !== 'profiles');
    expect(aggregateCalls.length).toBe(0);
  });
});

// ============================================================
// AC6 — Pure-redirect path: NO insert is attempted
// (Implementation chooses pure redirect, not fallback-create)
// ============================================================

describe('AC6 — fallback-insert path: no client fields, then redirect (pure-redirect impl asserts NO insert)', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('fallback-insert-no-client-fields-then-redirect (pure-redirect impl: no profiles.insert call observed)', async () => {
    const calls: SupabaseFromCall[] = [];
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: null,
      calls,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    const mod = (await import('@/app/(app)/dashboard/page')) as {
      default: () => Promise<unknown>;
    };
    await expect(mod.default()).rejects.toThrow(/NEXT_REDIRECT:\/onboarding/);

    // No insertPayload was recorded — only SELECT.
    const inserts = calls.filter(
      (c) => (c as SupabaseFromCall & { insertPayload?: unknown }).insertPayload !== undefined,
    );
    expect(inserts.length).toBe(0);
  });
});

// ============================================================
// AC1+AC2 — Transient error path
// (Codex Round 2 fix: error vs null branches must NOT collapse —
// the page-handler and API-handler paths diverge on transient
// Supabase errors. Page handler throws ProfileLookupError on
// non-PGRST116 errors (C1-B regression guard — forged cookies and
// RLS denials must NOT silently land in /onboarding); the narrow
// PGRST116 carveout still redirects to /onboarding as
// defense-in-depth for the genuine missing-row case (orphan branch
// normally handles it via .maybeSingle()'s data:null,error:null
// shape). API handler returns 503 profile_lookup_unavailable so
// the refresh interceptor does NOT pattern-match 401
// profile_lookup_failed and force-sign-out the user. Both paths
// capture the underlying error to Sentry; neither emits the orphan
// breadcrumb.)
// ============================================================

describe('AC1+AC2 — transient error path', () => {
  beforeEach(() => {
    sentryMocks.addBreadcrumb.mockReset();
    sentryMocks.captureException.mockReset();
    navMocks.redirect.mockReset();
    navMocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('Page handler throws ProfileLookupError on non-PGRST116 transient profiles lookup error (C1-B regression guard); Sentry captures underlying cause', async () => {
    const transientError = { message: 'connection timeout', code: 'PGRST_TIMEOUT' };
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: transientError,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    const mod = (await import('@/app/(app)/dashboard/page')) as {
      default: () => Promise<unknown>;
    };
    // C1-B regression guard contract: non-PGRST116 lookup_error must throw
    // ProfileLookupError so authed-but-broken sessions surface in Next's
    // error boundary, and forged-cookie tokens trip the unauthenticated
    // branch upstream rather than masquerading as orphans. Only the narrow
    // PGRST116 carveout (genuine missing-row, defense-in-depth — orphan
    // branch normally handles it) redirects to /onboarding.
    await expect(mod.default()).rejects.toThrow('profile lookup failed');
    // No /onboarding redirect — the throw propagates to Next's error boundary.
    const onboardingRedirects = navMocks.redirect.mock.calls.filter(
      (call) => call[0] === '/onboarding',
    );
    expect(onboardingRedirects.length).toBe(0);
    // Sentry.captureException must still receive the underlying error so the
    // transient cause remains observable in production (distinguishes this
    // path from the orphan path, which uses an addBreadcrumb instead).
    expect(sentryMocks.captureException).toHaveBeenCalled();
    const captured = sentryMocks.captureException.mock.calls[0];
    expect(captured?.[0]).toBe(transientError);
    // No orphan breadcrumb — the breadcrumb is reserved for actual orphans
    // (kind === 'orphan'); the lookup_error path uses captureException only.
    const orphanBreadcrumbs = sentryMocks.addBreadcrumb.mock.calls.filter((args) => {
      const arg = args[0] as { category?: string } | undefined;
      return arg?.category === 'dashboard.orphan-profile-fenced';
    });
    expect(orphanBreadcrumbs.length).toBe(0);
  });

  it('API handler returns 503 profile_lookup_unavailable on transient profiles lookup error', async () => {
    const transientError = { message: 'connection timeout', code: 'PGRST_TIMEOUT' };
    const supabaseMock = buildSupabaseMock({
      user: { id: TEST_USER_ID },
      profileResult: null,
      profileError: transientError,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => supabaseMock,
    }));

    const mod = (await import('@/app/api/library/dedup-check/route')) as Record<string, unknown>;
    const req = new Request('http://localhost/api/library/dedup-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normalized_name: 'eggs' }),
    });
    const res = await (mod.POST as (req: Request) => Promise<Response>)(req);

    // 503, NOT 401 — distinct from profile_lookup_failed so the refresh
    // interceptor does not pattern-match and force-sign-out the user.
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(401);
    expect(res.headers.get('content-type')?.toLowerCase()).toContain('application/json');
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('profile_lookup_unavailable');
    expect(body.error).not.toBe('profile_lookup_failed');
    // Sentry.captureException must have been called with the real error.
    expect(sentryMocks.captureException).toHaveBeenCalled();
    const captured = sentryMocks.captureException.mock.calls[0];
    expect(captured?.[0]).toBe(transientError);
    // No orphan breadcrumb on transient-error path.
    const orphanBreadcrumbs = sentryMocks.addBreadcrumb.mock.calls.filter((args) => {
      const arg = args[0] as { category?: string } | undefined;
      return arg?.category === 'dashboard.orphan-profile-fenced';
    });
    expect(orphanBreadcrumbs.length).toBe(0);
  });
});
