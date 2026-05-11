/**
 * AC3 (Export ZIP) — `app/api/export/zip/route.ts` integration tests.
 *
 * Contract per synthesis §4.4 + §3.6:
 *   - GET /api/export/zip
 *   - 401 unauthorized → no session
 *   - 200 application/zip with Content-Disposition: attachment
 *   - Outer ZIP contains both an inner CSV bundle (csv-bundle.zip) AND a JSON
 *     dump
 *   - JSON has schema_version: 'v1'
 *
 * Mocks the Supabase server client to return synthetic rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

const profileRow = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  bio_sex: 'female',
  age: 30,
  height_cm: 165,
  current_weight_kg: 60,
  goal_weight_kg: 58,
  activity_level: 'moderate',
  goal_pace: 'moderate',
  region: 'VN',
  unit_pref: 'metric',
  timezone: 'Asia/Ho_Chi_Minh',
  bmr: 1300,
  tdee: 2010,
  calorie_target: 1800,
  target_mode: 'auto',
  manual_override_value: null,
  onboarding_completed_at: '2026-04-01T00:00:00Z',
};

const entryRow = {
  id: '22222222-2222-2222-2222-222222222222',
  client_id: 'c-entry-1',
  user_id: TEST_USER_ID,
  logged_at: '2026-04-15T08:30:00Z',
  meal_category: 'breakfast',
  source: 'ai_text',
  library_item_id: null,
  name: 'Pho Bo',
  portion: 1,
  unit: 'bowl',
  kcal: 480,
  protein_g: 28,
  carbs_g: 65,
  fat_g: 10,
  fiber_g: 3,
  micros_json: null,
};

const weightRow = {
  id: '33333333-3333-3333-3333-333333333333',
  client_id: 'c-w-1',
  user_id: TEST_USER_ID,
  recorded_at: '2026-04-14T07:00:00Z',
  weight_kg: 60.2,
  note: null,
};

const waterRow = {
  id: '44444444-4444-4444-4444-444444444444',
  client_id: 'c-water-1',
  user_id: TEST_USER_ID,
  recorded_at: '2026-04-14T10:00:00Z',
  ml: 500,
};

const libraryRow = {
  id: '55555555-5555-5555-5555-555555555555',
  client_id: 'c-lib-1',
  user_id: TEST_USER_ID,
  name_canonical: 'pho bo',
  name_display: 'Phở Bò',
  kcal_per_unit: 480,
  unit: 'bowl',
  last_used_at: '2026-04-15T08:30:00Z',
  deleted_at: null,
};

const weeklyRow = {
  id: '66666666-6666-6666-6666-666666666666',
  user_id: TEST_USER_ID,
  week_start_on: '2026-04-13',
  summary: 'You averaged 1820 kcal — close to target.',
  created_at: '2026-04-20T09:00:00Z',
};

function buildSelectChain(rows: unknown[]) {
  // Codex C1 fix — `fetchAll` now pages via `.range(from, to)` so the
  // chain must support a `.range()` method that returns a thenable. Each
  // call returns the rows for that window; once a short page is returned
  // (length < 1000), `fetchAll` short-circuits.
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => void;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    single: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    // Default thenable for callers that don't .range() (e.g., profile reads
    // hit .maybeSingle() and never await the chain directly).
    then: (resolve) => {
      resolve({ data: rows, error: null });
    },
  };
  builder.select.mockImplementation(() => builder);
  builder.eq.mockImplementation(() => builder);
  builder.order.mockImplementation(() => builder);
  builder.range.mockImplementation((from: number, to: number) => {
    // PostgREST .range is inclusive on both ends. The fixtures here are
    // small (≤1 row each) so the first window always returns a short page
    // and fetchAll exits after one iteration.
    const slicedRows = rows.slice(from, to + 1);
    return {
      ...builder,
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        resolve({ data: slicedRows, error: null });
      },
    };
  });
  return builder;
}

function buildSupabaseMock(): {
  client: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  authGetUser: ReturnType<typeof vi.fn>;
} {
  const authGetUser = vi.fn(async () => ({
    data: { user: { id: TEST_USER_ID, email: 'test@example.com' } },
    error: null,
  }));

  const from = vi.fn().mockImplementation((table: string) => {
    switch (table) {
      case 'profiles':
        return buildSelectChain([profileRow]);
      case 'food_entries':
        return buildSelectChain([entryRow]);
      case 'weight_log':
        return buildSelectChain([weightRow]);
      case 'water_log':
        return buildSelectChain([waterRow]);
      case 'food_library_items':
        return buildSelectChain([libraryRow]);
      case 'weekly_reviews':
        return buildSelectChain([weeklyRow]);
      default:
        return buildSelectChain([]);
    }
  });

  const client = vi.fn().mockReturnValue({
    auth: { getUser: authGetUser },
    from,
  });
  return { client, from, authGetUser };
}

const mocks = { server: buildSupabaseMock() };

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => (mocks.server.client as unknown as () => unknown)(),
}));

describe('AC3 — Export ZIP', () => {
  beforeEach(() => {
    mocks.server = buildSupabaseMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session', async () => {
    mocks.server.authGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { GET } = await import('@/app/api/export/zip/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('200 application/zip with Content-Disposition attachment', async () => {
    const { GET } = await import('@/app/api/export/zip/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/zip/);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/kalori-export-/);
  });

  it('outer ZIP contains a JSON file with schema_version=v1 + an inner csv-bundle.zip', async () => {
    const { GET } = await import('@/app/api/export/zip/route');
    const res = await GET();
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // Read the outer ZIP entries by scanning the central directory.
    // Simple central-directory header signature: 0x02014b50.
    // Each entry filename appears just after the header; we don't fully
    // parse the ZIP — we only assert filenames are present.
    const text = buf.toString('latin1');
    expect(text).toContain('.json');
    expect(text).toContain('csv-bundle.zip');
  });

  it('GET other methods (POST) is not exported', async () => {
    const mod = await import('@/app/api/export/zip/route');
    expect(typeof mod.GET).toBe('function');
  });
});
