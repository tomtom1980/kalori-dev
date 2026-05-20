/**
 * @vitest-environment node
 *
 * Integration — Task 2.2 `/api/profile/save` onboarding extensions.
 *
 * Covers:
 *   - 8 step-by-step patches upsert and return 200 + the merged profile
 *   - Step 8 finalize presence of `onboarding_completed_at` triggers a
 *     server-side recompute + single-write update of
 *     bmr / tdee / calorie_target + the completion timestamp (atomicity
 *     regression — Codex Round 1 HIGH finding)
 *   - Finalize with an incomplete merged row is rejected BEFORE any
 *     write, so `onboarding_completed_at` never lands (Codex Round 1
 *     HIGH + MEDIUM findings — goal_pace undefined must fail closed)
 *   - Finalize with a failing write leaves the completion flag NULL
 *     (atomicity — single write means partial commit is impossible)
 *   - Zod `.strict()` rejects unknown keys with 400
 *   - `getUser()` null → 401 (propagates to the client interceptor for
 *     F12 refresh-and-retry)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockTable = {
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

type BuildOptions = {
  /** Row returned when the route performs a bare `.select().single()` pre-read. */
  selectRow?: Record<string, unknown> | null;
  /** Error injected into the upsert chain's terminal `.single()`. */
  upsertError?: { code?: string; message?: string } | null;
  /** Error injected into the update chain's terminal `.single()`. */
  updateError?: { code?: string; message?: string } | null;
  /** Error injected into the insert chain's terminal `.single()`. */
  insertError?: { code?: string; message?: string } | null;
};

function buildChainableTable(row: Record<string, unknown>, opts: BuildOptions = {}) {
  const lastUpserted: { payload: Record<string, unknown> | null } = { payload: null };
  const lastUpdated: { payload: Record<string, unknown> | null } = { payload: null };
  const lastInserted: { payload: Record<string, unknown> | null } = { payload: null };
  const selectRow = opts.selectRow !== undefined ? opts.selectRow : row;

  const makeTerminal = (
    data: Record<string, unknown> | null,
    error: { code?: string; message?: string } | null,
  ): { single: () => Promise<{ data: Record<string, unknown> | null; error: typeof error }> } => ({
    single: async () => ({ data, error }),
  });

  const upsertChain = (data: Record<string, unknown>): unknown => ({
    select: () => makeTerminal(opts.upsertError ? null : data, opts.upsertError ?? null),
    eq: () => ({
      select: () => makeTerminal(opts.upsertError ? null : data, opts.upsertError ?? null),
    }),
  });

  const updateChain = (data: Record<string, unknown>): unknown => ({
    select: () => makeTerminal(opts.updateError ? null : data, opts.updateError ?? null),
    eq: () => ({
      select: () => makeTerminal(opts.updateError ? null : data, opts.updateError ?? null),
    }),
  });

  const insertChain = (data: Record<string, unknown>): unknown => ({
    select: () => makeTerminal(opts.insertError ? null : data, opts.insertError ?? null),
    eq: () => ({
      select: () => makeTerminal(opts.insertError ? null : data, opts.insertError ?? null),
    }),
  });

  const table = {
    upsert: vi.fn((payload: Record<string, unknown>) => {
      lastUpserted.payload = payload;
      return upsertChain({ ...row, ...payload });
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      lastUpdated.payload = payload;
      return updateChain({ ...row, ...payload });
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      lastInserted.payload = payload;
      return insertChain({ ...row, ...payload });
    }),
    // Bare select path — used by the non-finalize existence probe +
    // the finalize pre-read (legacy test support). Accept both
    // `.eq(...).maybeSingle()` (new probe) and `.eq(...).single()`
    // (legacy). `maybeSingle` returns { data: null, error: null } when
    // `selectRow` is explicitly null (orphaned-user fixture).
    select: vi.fn(() => ({
      eq: () => ({
        single: async () => ({ data: selectRow, error: null }),
        maybeSingle: async () => ({ data: selectRow, error: null }),
      }),
      single: async () => ({ data: selectRow, error: null }),
      maybeSingle: async () => ({ data: selectRow, error: null }),
    })),
    single: vi.fn(),
    eq: vi.fn(),
  } satisfies MockTable;

  return { table, lastUpserted, lastUpdated, lastInserted };
}

describe('POST /api/profile/save — onboarding extensions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
  });

  it('accepts the canonical Step 1 patch (bio_sex) with 200', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const { table } = buildChainableTable({ id: 'u-1', bio_sex: 'male' });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid-1', patch: { bio_sex: 'male' } }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; profile: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.profile.bio_sex).toBe('male');
    // Under the self-healing route, when a profile row exists the
    // non-finalize path issues a plain UPDATE (not UPSERT) so default
    // column values are never clobbered. Either mutation is acceptable
    // from the test's intent POV (persist bio_sex) but the row-exists
    // fixture specifically drives the update branch.
    const mutationCalls = table.upsert.mock.calls.length + table.update.mock.calls.length;
    expect(mutationCalls).toBe(1);
  });

  it('rejects unknown keys with 400 (zod .strict())', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const { table } = buildChainableTable({ id: 'u-1' });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-1',
          patch: { bio_sex: 'male', hackerField: 'bad' },
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser resolves to null user (F12 canary)', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: { message: 'invalid' },
    }));
    const { table } = buildChainableTable({ id: 'u-1' });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-1',
          patch: { birthday: '1994-04-21', age: 32 },
        }),
      }),
    );

    expect(res.status).toBe(401);
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('Step 8 finalize: writes bmr/tdee/calorie_target + completion flag in ONE atomic call', async () => {
    // Codex Round 1 HIGH — finalize must be a single write. The
    // completion flag is not allowed to land in one transaction while
    // the derived nutrition fields land (or fail to land) in a second.
    //
    // Phase 2 Codex R1 F1 — finalize must NOT pre-read the row before
    // writing. The pre-read → merge → compute → write pattern had a
    // race window between SELECT and UPDATE. The new contract: the
    // client always sends a complete finalize payload (enforced by
    // `Step8FinalizeSchema`), the server derives BMR/TDEE/target from
    // the payload alone, and issues ONE atomic update.
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    // Existing DB row with all prior-step data BUT no
    // `onboarding_completed_at` (Steps 1–7 already saved via per-step
    // deltas, Step 8 is the finalize request).
    const existingRow = {
      id: 'u-1',
      bio_sex: 'male' as const,
      birthday: '1996-04-21',
      age: 30,
      height_cm: 175,
      current_weight_kg: 80,
      goal_weight_kg: 72,
      goal_pace: 'moderate' as const,
      activity_level: 'moderate' as const,
      onboarding_completed_at: null,
    };
    const { table, lastUpserted, lastUpdated, lastInserted } = buildChainableTable(existingRow);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-8',
          patch: {
            bio_sex: 'male',
            birthday: '1996-04-21',
            age: 30,
            height_cm: 175,
            current_weight_kg: 80,
            goal_weight_kg: 72,
            goal_pace: 'moderate',
            activity_level: 'moderate',
            onboarding_completed_at: '2026-04-21T00:00:00.000Z',
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    // Single-write atomicity: exactly ONE mutation call across the
    // whole finalize path (either upsert or update — both MUST NOT fire
    // in sequence). This asserts the combined count, not which API the
    // route picked.
    const mutationCalls = table.upsert.mock.calls.length + table.update.mock.calls.length;
    expect(mutationCalls).toBe(1);

    // Task 5.3 Codex R1 C3 — the deleting_at fence helper performs ONE
    // single-row indexed SELECT on `profiles.deleting_at` before any
    // mutation. The original "no pre-read" contract (Phase 2 Codex R1
    // F1) is preserved IN INTENT — there is still no per-step pre-read
    // → merge → compute pattern. The fence read is a constant-cost
    // bounded check that does not depend on the patch payload and
    // cannot create a race window between SELECT and UPDATE (it only
    // gates whether the route proceeds at all).
    //
    // Assert exactly ONE select call (the fence) and that it requested
    // the `deleting_at` column — NOT a full-row pre-read.
    expect(table.select).toHaveBeenCalledTimes(1);
    expect(table.select).toHaveBeenCalledWith('deleting_at');

    // Whichever single mutation fired, it must carry BOTH the derived
    // nutrition fields AND the completion flag together.
    const writtenPayload = (lastUpserted.payload ?? lastUpdated.payload) as Record<
      string,
      unknown
    > | null;
    expect(writtenPayload).not.toBeNull();
    // Expected Mifflin values: BMR = 1749, TDEE = 2711, target = 2160.
    expect(writtenPayload?.bmr).toBe(1749);
    expect(writtenPayload?.tdee).toBe(2711);
    expect(writtenPayload?.calorie_target).toBe(2160);
    expect(writtenPayload?.onboarding_completed_at).toBe('2026-04-21T00:00:00.000Z');
    expect(lastInserted.payload).toMatchObject({
      user_id: 'u-1',
      date: '2026-04-21',
      weight_kg: 80,
      note: null,
    });
    expect(lastInserted.payload?.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('Step 8 finalize: payload missing a required field is rejected with 400 before any mutation', async () => {
    // Phase 2 Codex R1 F1 — the pre-read was removed. The finalize
    // payload must therefore carry every input required to derive
    // BMR/TDEE/target (bio_sex, age, height_cm, current_weight_kg,
    // goal_weight_kg, goal_pace, activity_level, onboarding_completed_at).
    // A missing field means the client did not send a complete Step 8
    // payload — the server fails closed with 400 `finalize_incomplete`,
    // names the missing field(s), and does NOT write anything.
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const { table } = buildChainableTable({ id: 'u-1' });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-8-missing-age',
          patch: {
            bio_sex: 'male',
            birthday: '1996-04-21',
            // age intentionally omitted
            height_cm: 175,
            current_weight_kg: 80,
            goal_weight_kg: 72,
            goal_pace: 'moderate',
            activity_level: 'moderate',
            onboarding_completed_at: '2026-04-21T00:00:00.000Z',
          },
        }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string; fields?: unknown[] };
    expect(json.error).toBe('finalize_incomplete');
    expect(JSON.stringify(json)).toMatch(/age/);
    // Task 5.3 Codex R1 C3 — the deleting_at fence runs BEFORE Zod
    // validation in the route order, so a single fence-only SELECT will
    // have happened. No further pre-read, no mutation — validation
    // fails closed.
    expect(table.select).toHaveBeenCalledTimes(1);
    expect(table.select).toHaveBeenCalledWith('deleting_at');
    expect(table.upsert).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it('Step 8 finalize rejects with 400 when merged row is missing goal_pace, leaving completion flag NULL', async () => {
    // Codex Round 1 MEDIUM — goal_pace must be validated as a known
    // enum value, not merely non-null. An undefined merged value must
    // fail closed WITHOUT persisting `onboarding_completed_at`.
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    // Existing row is missing `goal_pace` — the client never saved it
    // (simulating a partially-populated profile trying to finalize).
    const existingRow = {
      id: 'u-1',
      bio_sex: 'male' as const,
      birthday: '1996-04-21',
      age: 30,
      height_cm: 175,
      current_weight_kg: 80,
      goal_weight_kg: 72,
      // goal_pace intentionally omitted
      activity_level: 'moderate' as const,
      onboarding_completed_at: null,
    };
    const { table } = buildChainableTable(existingRow);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Client sends finalize request with everything EXCEPT goal_pace.
        body: JSON.stringify({
          client_id: 'cid-8-incomplete',
          patch: {
            bio_sex: 'male',
            birthday: '1996-04-21',
            age: 30,
            height_cm: 175,
            current_weight_kg: 80,
            goal_weight_kg: 72,
            activity_level: 'moderate',
            onboarding_completed_at: '2026-04-21T00:00:00.000Z',
          },
        }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    // The error payload must name goal_pace so callers (and logs) see
    // why finalize was refused.
    expect(JSON.stringify(json)).toMatch(/goal_pace/);
    // Zero mutations: neither upsert nor update fired, so the DB still
    // holds `onboarding_completed_at: null`.
    expect(table.upsert).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it('Step 8 finalize: failing write returns 500 without persisting completion flag', async () => {
    // Codex Round 1 HIGH (atomicity) — if the single finalize write
    // fails, nothing lands in the DB. Previously the flag was written
    // by an earlier upsert and a later failure left the row
    // incorrectly marked "onboarded".
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const existingRow = {
      id: 'u-1',
      bio_sex: 'male' as const,
      birthday: '1996-04-21',
      age: 30,
      height_cm: 175,
      current_weight_kg: 80,
      goal_weight_kg: 72,
      goal_pace: 'moderate' as const,
      activity_level: 'moderate' as const,
      onboarding_completed_at: null,
    };
    // Inject a failure on BOTH possible mutation paths — the route can
    // pick either upsert or update, but whichever it picks, this
    // guarantees the single-write attempt surfaces the error.
    const { table } = buildChainableTable(existingRow, {
      upsertError: { code: '23505', message: 'simulated db failure' },
      updateError: { code: '23505', message: 'simulated db failure' },
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-8-fail',
          patch: {
            bio_sex: 'male',
            birthday: '1996-04-21',
            age: 30,
            height_cm: 175,
            current_weight_kg: 80,
            goal_weight_kg: 72,
            goal_pace: 'moderate',
            activity_level: 'moderate',
            onboarding_completed_at: '2026-04-21T00:00:00.000Z',
          },
        }),
      }),
    );

    expect(res.status).toBe(500);
    // Because the fix uses a single atomic mutation, there must be at
    // most ONE mutation attempt. (A second write would indicate the
    // pre-fix "commit flag first, derived second" pattern.)
    const mutationCalls = table.upsert.mock.calls.length + table.update.mock.calls.length;
    expect(mutationCalls).toBeLessThanOrEqual(1);
  });

  it('non-finalize patches do NOT trigger server-side recompute', async () => {
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const { table, lastUpserted, lastUpdated } = buildChainableTable({
      id: 'u-1',
      birthday: '1981-04-21',
      age: 45,
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'cid-2',
          patch: { birthday: '1981-04-21', age: 45 },
        }),
      }),
    );

    expect(res.status).toBe(200);
    // Intent: non-finalize must NOT write bmr/tdee/calorie_target.
    // Whichever mutation API fires, the payload must not contain
    // derived nutrition fields.
    const writtenPayload = (lastUpserted.payload ?? lastUpdated.payload) as Record<
      string,
      unknown
    > | null;
    expect(writtenPayload).not.toBeNull();
    expect(writtenPayload).not.toHaveProperty('bmr');
    expect(writtenPayload).not.toHaveProperty('tdee');
    expect(writtenPayload).not.toHaveProperty('calorie_target');
  });

  it('orphaned user (no profile row) + Step 1 {bio_sex:male} inserts with trigger defaults', async () => {
    // Root cause of the reported bug: auth.users row exists (OAuth
    // sign-in predated 0002's handle_new_user trigger), so `profiles`
    // has no row. The original route did `upsert({id, bio_sex})` which
    // degrades to INSERT missing NOT NULL columns → Postgres 23502 →
    // 500 `db_error`. Self-healing contract: when no profile exists,
    // the route INSERTs with trigger defaults merged with the patch,
    // so the patch wins and the NOT NULL columns land.
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-orphan' } },
      error: null,
    }));
    // selectRow: null drives the existence probe's maybeSingle to
    // return { data: null, error: null } — simulating the orphaned
    // auth.users row with no profile row.
    const { table, lastUpserted, lastUpdated, lastInserted } = buildChainableTable(
      {
        id: 'u-orphan',
        bio_sex: 'male',
        age: 30,
        height_cm: 170,
        current_weight_kg: 70,
        activity_level: 'moderate',
      },
      { selectRow: null },
    );
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid-orphan', patch: { bio_sex: 'male' } }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; profile: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.profile.bio_sex).toBe('male');
    // Defaults must match handle_new_user() in migration 0002.
    expect(json.profile.age).toBe(30);
    expect(json.profile.height_cm).toBe(170);
    expect(json.profile.current_weight_kg).toBe(70);
    expect(json.profile.activity_level).toBe('moderate');

    // The written payload must carry the NOT NULL columns so the
    // Postgres 23502 that drove the original bug cannot recur.
    const writtenPayload = (lastInserted.payload ??
      lastUpserted.payload ??
      lastUpdated.payload) as Record<string, unknown> | null;
    expect(writtenPayload).not.toBeNull();
    expect(writtenPayload?.bio_sex).toBe('male');
    expect(writtenPayload?.age).toBe(30);
    expect(writtenPayload?.height_cm).toBe(170);
    expect(writtenPayload?.current_weight_kg).toBe(70);
    expect(writtenPayload?.activity_level).toBe('moderate');
  });

  it('existing profile with non-default columns + Step 1 {bio_sex:male} preserves existing values', async () => {
    // Regression-prevention test: if the row exists, the route must
    // issue a plain UPDATE (NOT an upsert with defaults merged), so
    // user-entered column values like age=42 are never clobbered by
    // the trigger defaults (age=30).
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    const existingRow = {
      id: 'u-1',
      bio_sex: 'female' as const,
      age: 42,
      height_cm: 168,
      current_weight_kg: 63,
      activity_level: 'active' as const,
    };
    const { table, lastUpserted, lastUpdated } = buildChainableTable(existingRow);
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid-step1', patch: { bio_sex: 'male' } }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; profile: Record<string, unknown> };
    expect(json.ok).toBe(true);
    expect(json.profile.bio_sex).toBe('male');
    // Existing non-default values must be preserved — the route must
    // NOT have written age/height_cm/current_weight_kg/activity_level
    // as part of this Step 1 request.
    expect(json.profile.age).toBe(42);
    expect(json.profile.height_cm).toBe(168);
    expect(json.profile.current_weight_kg).toBe(63);
    expect(json.profile.activity_level).toBe('active');

    // The written payload must NOT include the other NOT NULL columns
    // (only bio_sex, which was the patch). Defaults MUST NOT be merged
    // into an existing-row update — that's the clobber the fix avoids.
    const writtenPayload = (lastUpserted.payload ?? lastUpdated.payload) as Record<
      string,
      unknown
    > | null;
    expect(writtenPayload).not.toBeNull();
    expect(writtenPayload?.bio_sex).toBe('male');
    expect(writtenPayload).not.toHaveProperty('age');
    expect(writtenPayload).not.toHaveProperty('height_cm');
    expect(writtenPayload).not.toHaveProperty('current_weight_kg');
    expect(writtenPayload).not.toHaveProperty('activity_level');
  });

  it('non-finalize DB error surfaces 500 with pg_code in body', async () => {
    // Error-mapping contract: when the DB write fails with a Postgres
    // code that is not RLS-related, the route returns 500 with an
    // expanded body `{ error: 'db_error', pg_code: '<code>' }` so the
    // client banner + Sentry event carry actionable diagnostics instead
    // of the generic "Save failed" that hid the original root cause.
    const getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1' } },
      error: null,
    }));
    // Row exists fixture drives the update branch; inject 23502 on
    // every mutation so whichever path the route picks, the error
    // surfaces.
    const { table } = buildChainableTable(
      { id: 'u-1', bio_sex: 'male' },
      {
        upsertError: { code: '23502', message: 'null value in column "age"' },
        updateError: { code: '23502', message: 'null value in column "age"' },
        insertError: { code: '23502', message: 'null value in column "age"' },
      },
    );
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({ auth: { getUser }, from: () => table }),
    }));

    const { POST } = await import('@/app/api/profile/save/route');
    const res = await POST(
      new Request('http://kalori.test/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cid-err', patch: { bio_sex: 'male' } }),
      }),
    );

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error?: string; pg_code?: string };
    expect(json.error).toBe('db_error');
    expect(json.pg_code).toBe('23502');
  });
});
