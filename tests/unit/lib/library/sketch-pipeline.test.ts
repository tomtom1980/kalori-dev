/**
 * @vitest-environment node
 *
 * Unit tests for `lib/library/sketch-pipeline.ts` — Bug 5 (library
 * overhaul 2026-05-16) + Codex Round 1 Critical #1 & #2 fixes.
 *
 * The pipeline orchestrates: atomic claim → Gemini call → sharp WEBP
 * encode → storage upload → DB update. Each step is observable via the
 * mocked Supabase client + the fixture-mode Gemini wrapper.
 *
 * Critical coverage (pre-Codex):
 *   1. Happy path → status='generated' + UPDATE called with correct fields
 *   2. Idempotency — already-sketched row → skipped (no Gemini call)
 *   3. Idempotency — photo-present row → skipped (no Gemini call)
 *   4. Retry cap → skipped at sketch_attempt_count >= 3
 *   5. Gemini failure → status='failed' + sketch_attempt_count bumped +
 *      sketch_last_error set + NO thumbnail_url written (error-path)
 *   6. Missing row → skipped='row_missing'
 *
 * Codex Round 1 additions:
 *   - Critical #1 — `thumbnail_url` MUST be the storage path, not a
 *     signed URL (which would expire while the row is marked
 *     permanently generated).
 *   - Critical #2 — Retry/cost cap must be atomic. The claim step is a
 *     conditional UPDATE that increments `sketch_attempt_count` only
 *     when the row is still eligible; concurrent calls "lose the
 *     race" and return `skipped='claim_lost'` without calling Gemini.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminSupabaseMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => adminSupabaseMock.current,
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => {
    throw new Error('test should pass supabase explicitly');
  },
}));

// Import AFTER mocks so the module sees them at load time.
import { runSketchPipeline } from '@/lib/library/sketch-pipeline';

const UID = 'u-dddddddd';
const LIB_ID = 'aaaaaaaa-dddd-4ddd-8ddd-dddddddddddd';
// 1x1 transparent PNG
const FIXTURE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAUAAen63NgAAAAASUVORK5CYII=';

interface RowState {
  id: string;
  user_id: string;
  client_id: string;
  display_name: string;
  thumbnail_url: string | null;
  thumbnail_kind: string | null;
  sketch_generated_at: string | null;
  sketch_attempt_count: number;
  sketch_last_error?: string | null;
}

/**
 * Builds a supabase mock for the new (post-Codex) pipeline shape:
 *
 *   1. SELECT row (preflight check)
 *   2. CONDITIONAL UPDATE that claims the slot (atomic — Codex #2 fix).
 *      Returns updated row count via `.select()` chain. `claimAffected`
 *      controls whether the claim "succeeds" (1 row) or "loses race" (0).
 *   3. Storage upload
 *   4. Final UPDATE writing `thumbnail_url = <path>` (Codex #1 fix)
 *      + `thumbnail_kind='sketch'` + `sketch_generated_at=now()`.
 *   5. Recover UPDATE (failure path) writing `sketch_last_error`.
 */
function buildSupabaseMock(
  row: RowState | null,
  options: {
    uploadError?: { message: string } | null;
    claimAffected?: number; // 1 = won, 0 = lost the race
    finalUpdateError?: { message: string } | null;
  } = {},
) {
  const claimAffected = options.claimAffected ?? 1;
  const updateCalls: Array<{
    patch: Record<string, unknown>;
    kind: 'claim' | 'final' | 'recover';
  }> = [];
  const uploadSpy = vi.fn();
  const selectSpy = vi.fn();

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => {
                selectSpy();
                return { data: row, error: null };
              },
            }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        // Heuristic for kind:
        //   - claim: patch contains ONLY sketch_attempt_count + sketch_last_error=null
        //     and the chain proceeds to .eq(...).eq(...).lt(...).is(...).is(...).select()
        //   - final: patch contains thumbnail_url + thumbnail_kind
        //   - recover: patch contains sketch_last_error AND a defined value
        const isFinal =
          Object.prototype.hasOwnProperty.call(patch, 'thumbnail_url') &&
          Object.prototype.hasOwnProperty.call(patch, 'thumbnail_kind');
        const isClaim =
          !isFinal &&
          Object.prototype.hasOwnProperty.call(patch, 'sketch_attempt_count') &&
          patch.sketch_last_error === null;

        const tag: 'claim' | 'final' | 'recover' = isFinal
          ? 'final'
          : isClaim
            ? 'claim'
            : 'recover';
        updateCalls.push({ patch, kind: tag });

        // Claim path: must chain `.eq(...).eq(...).lt(...).is(...).is(...).select(...)`.
        const buildChain = (terminal: () => Promise<unknown>) => {
          const node: Record<string, unknown> = {
            eq: () => node,
            lt: () => node,
            is: () => node,
            or: () => node,
            select: () => terminal(),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              terminal().then(resolve, reject),
          };
          return node;
        };

        if (isClaim) {
          // Terminal returns { data: <rows>, error: null } with rows.length = claimAffected
          return buildChain(async () =>
            options.finalUpdateError && tag !== 'claim'
              ? { data: null, error: options.finalUpdateError }
              : {
                  data:
                    claimAffected === 1
                      ? [
                          {
                            id: row?.id,
                            sketch_attempt_count: (row?.sketch_attempt_count ?? 0) + 1,
                          },
                        ]
                      : [],
                  error: null,
                },
          );
        }

        if (isFinal) {
          return buildChain(async () =>
            options.finalUpdateError
              ? { data: null, error: options.finalUpdateError }
              : { data: [{ id: row?.id }], error: null },
          );
        }

        // recover path — simple chain, no return value needed
        return buildChain(async () => ({ data: null, error: null }));
      },
    }),
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => {
          uploadSpy(...args);
          return options.uploadError
            ? { error: options.uploadError }
            : { data: { path: args[0] }, error: null };
        },
      }),
    },
  };

  return { supabase, updateCalls, uploadSpy, selectSpy };
}

function buildAdminQuotaMock(counts: readonly number[] = [0, 0]) {
  let countIndex = 0;
  const insert = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn((table: string) => {
    if (table !== 'ai_call_log') {
      throw new Error(`unexpected admin table ${table}`);
    }
    return {
      select: (_columns?: string, selectOptions?: { count?: string; head?: boolean }) => {
        if (selectOptions?.count !== 'exact' || !selectOptions.head) {
          throw new Error('unexpected ai_call_log select');
        }
        const builder = {
          eq: () => builder,
          in: () => builder,
          gte: () => builder,
          lt: async () => {
            const count = counts[countIndex] ?? 0;
            countIndex += 1;
            return { count, error: null };
          },
        };
        return builder;
      },
      insert,
    };
  });
  return { from, insert };
}

function findCallByKind(
  calls: Array<{ patch: Record<string, unknown>; kind: 'claim' | 'final' | 'recover' }>,
  kind: 'claim' | 'final' | 'recover',
) {
  return calls.find((c) => c.kind === kind);
}

describe('runSketchPipeline', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // eslint-disable-next-line kalori/no-gemini-leak -- test-only env setup; production callsite is the server-side route handler at app/api/library/sketch/generate/route.ts. The rule's path normalizer matches `lib/` before `tests/` so this test path is incorrectly scoped — `tests/**` is in the rule's allowlist by design.
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
    adminSupabaseMock.current = buildAdminQuotaMock();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('happy path: generates sketch, uploads, stores PATH not URL', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('generated');
    expect(uploadSpy).toHaveBeenCalledOnce();
    const uploadPath = uploadSpy.mock.calls[0]![0] as string;
    expect(uploadPath).toBe(`${UID}/sketch_rowclient.webp`);

    // Codex Critical #2 — atomic claim came first and incremented attempt_count.
    const claim = findCallByKind(updateCalls, 'claim');
    expect(claim).toBeDefined();
    expect(claim!.patch.sketch_attempt_count).toBe(1);

    // Codex Critical #1 — final UPDATE stores PATH not signed URL.
    const final = findCallByKind(updateCalls, 'final');
    expect(final).toBeDefined();
    expect(final!.patch.thumbnail_kind).toBe('sketch');
    expect(final!.patch.sketch_generated_at).toBeTruthy();
    expect(final!.patch.thumbnail_url).toBe(`${UID}/sketch_rowclient.webp`);
    // No signed-URL leakage — the stored value MUST NOT look like a URL.
    expect(String(final!.patch.thumbnail_url).startsWith('http')).toBe(false);

    // Outcome carries the same path (renderer will sign-on-read).
    if (outcome.status === 'generated') {
      expect(outcome.thumbnailUrl).toBe(`${UID}/sketch_rowclient.webp`);
    }
  });

  it('happy path writes one image-analysis sketch ai_call_log row for the real model call', async () => {
    const admin = buildAdminQuotaMock([0, 0]);
    adminSupabaseMock.current = admin;
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('generated');
    expect(admin.insert).toHaveBeenCalledTimes(1);
    const [rowArg] = admin.insert.mock.calls[0] as unknown as [
      { call_type?: string; user_id?: string; cached_flag?: boolean },
    ];
    expect(rowArg.call_type).toBe('image-analysis-sketch');
    expect(rowArg.user_id).toBe(UID);
    expect(rowArg.cached_flag).toBe(false);
  });

  it('shared daily AI image analysis quota exhausted: skips before claiming, model work, and upload', async () => {
    adminSupabaseMock.current = buildAdminQuotaMock([20, 20]);
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error).toContain('AI image analysis limit');
    }
    expect(updateCalls.length).toBe(0);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('idempotent: already-sketched row returns skipped=already_generated, no Gemini call', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: `${UID}/sketch_rowclient.webp`,
      thumbnail_kind: 'sketch',
      sketch_generated_at: '2026-05-15T00:00:00Z',
      sketch_attempt_count: 1,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toBe('already_generated');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(0);
  });

  it('photo wins: row with thumbnail_kind=photo returns skipped=photo_present', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: 'u-1/photo_x.webp',
      thumbnail_kind: 'photo',
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toBe('photo_present');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(0);
  });

  it('retry cap: sketch_attempt_count >= 3 → skipped=max_retries (pre-claim guard)', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 3,
    };
    const { supabase, uploadSpy, updateCalls } = buildSupabaseMock(row);
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toBe('max_retries');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(0);
  });

  it('missing row: returns skipped=row_missing', async () => {
    const { supabase } = buildSupabaseMock(null);
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toBe('row_missing');
  });

  it('upload failure: records sketch_last_error, NO thumbnail_url set on the failure leg', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls } = buildSupabaseMock(row, {
      uploadError: { message: 'storage unreachable' },
    });
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('failed');

    // Claim must have fired (attempt count must be incremented on the claim leg
    // — the atomic claim happens BEFORE Gemini/upload, so an attempt is
    // recorded even when the upload fails).
    const claim = findCallByKind(updateCalls, 'claim');
    expect(claim).toBeDefined();

    // Recover update sets sketch_last_error.
    const recover = findCallByKind(updateCalls, 'recover');
    expect(recover).toBeDefined();
    expect(typeof recover!.patch.sketch_last_error).toBe('string');

    // Critical: NO `final` update — thumbnail_url + thumbnail_kind +
    // sketch_generated_at must NEVER be written on the failure leg.
    const final = findCallByKind(updateCalls, 'final');
    expect(final).toBeUndefined();
  });

  it('Gemini no-image: failure path with no_image error message', async () => {
    // Unset fixture and stub fetch to return an envelope with no inlineData.
    delete process.env.KALORI_SKETCH_FIXTURE_BASE64;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'cant draw' }] } }] }),
          { status: 200 },
        ),
      );
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls } = buildSupabaseMock(row);
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') expect(outcome.error).toContain('gemini_no_image');
    const recover = findCallByKind(updateCalls, 'recover');
    expect(recover).toBeDefined();
    expect(recover!.patch.sketch_last_error).toContain('gemini_no_image');
    // Claim ran (atomic), final did NOT.
    expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
    fetchSpy.mockRestore();
  });

  /**
   * Codex Round 1 Critical #2 — concurrency / atomicity.
   *
   * Simulate the "lost the race" branch: claim affects 0 rows because
   * another invocation got there first. The "loser" must early-exit
   * without calling Gemini AND without writing a failure (it's a
   * skipped outcome, not an error).
   */
  it('concurrency: claim affects 0 rows → skipped=claim_lost, no Gemini call', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row, {
      claimAffected: 0, // another job got there first
    });
    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toBe('claim_lost');
    expect(uploadSpy).not.toHaveBeenCalled();
    // The claim attempt was made (one UPDATE call) but no final and no recover.
    expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
    expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
    expect(findCallByKind(updateCalls, 'recover')).toBeUndefined();
  });

  /**
   * Codex Round 2 R2-C1 / Round 3 — Compare-and-set predicate stability.
   *
   * The Round-1 fix used `.lt('sketch_attempt_count', MAX_RETRIES)` in the
   * WHERE clause. Under READ COMMITTED concurrent UPDATEs against the same
   * row, both UPDATEs read attempt_count=0, both predicates (`0 < 3` and
   * `1 < 3`) match, both UPDATEs succeed, and both callers think they
   * own the slot. Two Gemini calls fire.
   *
   * The Round-3 fix uses `.eq('sketch_attempt_count', currentAttempts)` —
   * a true compare-and-set. The loser's UPDATE sees attempt_count=1
   * (already incremented by winner) and fails to match `.eq(..., 0)`.
   *
   * This test specifically simulates the predicate-stability scenario by
   * incrementing the row state between two UPDATE calls and asserting that
   * the second UPDATE — which still passes `.lt(..., MAX_RETRIES)` but
   * fails `.eq('sketch_attempt_count', 0)` — returns 0 rows.
   */
  it('CAS predicate: second concurrent UPDATE with stale attempt_count=0 → 0 rows affected', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };

    // Track every `.eq('sketch_attempt_count', value)` call inside an
    // update chain so we can assert the second UPDATE used a CAS
    // predicate pinned to the stale preflight value.
    const casPredicates: number[] = [];
    let serverSideAttemptCount = 0;
    let geminiCalls = 0;

    const uploadSpy = vi.fn();
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: { ...row, sketch_attempt_count: 0 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          const isFinal =
            Object.prototype.hasOwnProperty.call(patch, 'thumbnail_url') &&
            Object.prototype.hasOwnProperty.call(patch, 'thumbnail_kind');
          const isClaim =
            !isFinal &&
            Object.prototype.hasOwnProperty.call(patch, 'sketch_attempt_count') &&
            patch.sketch_last_error === null;

          const buildChain = (terminal: () => Promise<unknown>) => {
            const node: Record<string, unknown> = {
              eq: (_col: string, value: unknown) => {
                // The CAS predicate is the `.eq('sketch_attempt_count',
                // currentAttempts)` call (Round-3 fix). Record whenever
                // an `.eq` chains a number value matching the column
                // name we care about.
                if (_col === 'sketch_attempt_count' && typeof value === 'number') {
                  casPredicates.push(value);
                }
                return node;
              },
              lt: () => node,
              is: () => node,
              or: () => node,
              select: () => terminal(),
              then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                terminal().then(resolve, reject),
            };
            return node;
          };

          if (isClaim) {
            return buildChain(async () => {
              // CAS semantics: the claim only succeeds if the row's
              // server-side attempt_count matches the WHERE-clause-pinned
              // value (recorded above). If it doesn't, the UPDATE
              // affects 0 rows.
              const claimedFor = casPredicates[casPredicates.length - 1];
              if (claimedFor !== serverSideAttemptCount) {
                return { data: [], error: null };
              }
              serverSideAttemptCount += 1;
              return {
                data: [{ id: row.id, sketch_attempt_count: serverSideAttemptCount }],
                error: null,
              };
            });
          }
          if (isFinal) {
            return buildChain(async () => ({ data: [{ id: row.id }], error: null }));
          }
          return buildChain(async () => ({ data: null, error: null }));
        },
      }),
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            geminiCalls += 1; // upload is the post-Gemini step
            uploadSpy(...args);
            return { data: { path: args[0] }, error: null };
          },
        }),
      },
    };

    // Worker A and Worker B both preflight-read attempt_count=0 (the
    // mock above returns 0 every time for the SELECT). They both issue
    // claimSlot with currentAttempts=0 in parallel.
    const [outA, outB] = await Promise.all([
      runSketchPipeline({
        libraryItemId: LIB_ID,
        userId: UID,
        supabase: supabase as unknown as NonNullable<
          Parameters<typeof runSketchPipeline>[0]['supabase']
        >,
      }),
      runSketchPipeline({
        libraryItemId: LIB_ID,
        userId: UID,
        supabase: supabase as unknown as NonNullable<
          Parameters<typeof runSketchPipeline>[0]['supabase']
        >,
      }),
    ]);

    // Exactly one winner — the other got claim_lost because the CAS
    // predicate did NOT match (predicate pinned to 0, server-side count
    // had already incremented to 1).
    const generated = [outA, outB].filter((r) => r.status === 'generated').length;
    const claimLost = [outA, outB].filter(
      (r) => r.status === 'skipped' && r.reason === 'claim_lost',
    ).length;
    expect(generated).toBe(1);
    expect(claimLost).toBe(1);
    expect(geminiCalls).toBe(1);

    // Critical: BOTH claim UPDATEs pinned `.eq('sketch_attempt_count', 0)`
    // (the stale preflight value). The second UPDATE's predicate was 0
    // even though the server-side state was 1 by then — exactly the CAS
    // pattern. If the predicate had been `.lt(..., MAX_RETRIES)` instead,
    // the loser would have ALSO succeeded.
    expect(casPredicates.length).toBeGreaterThanOrEqual(2);
    expect(casPredicates.filter((v) => v === 0).length).toBe(2);
  });

  /**
   * Concurrency cost-cap proof: when 4 parallel pipeline invocations
   * target the same row (each sharing supabase state), only ONE wins
   * the claim and calls Gemini. The other three return skipped.
   * Uses a shared mock with a stateful claim counter.
   */
  it('concurrency cost cap: 4 parallel calls → 1 Gemini call, 3 claim_lost', async () => {
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };

    // Shared atomic claim counter — only one increment is allowed.
    let claimed = false;
    const uploadSpy = vi.fn();
    const updateCalls: Array<{ kind: 'claim' | 'final' | 'recover' }> = [];

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: row, error: null }),
              }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          const isFinal =
            Object.prototype.hasOwnProperty.call(patch, 'thumbnail_url') &&
            Object.prototype.hasOwnProperty.call(patch, 'thumbnail_kind');
          const isClaim =
            !isFinal &&
            Object.prototype.hasOwnProperty.call(patch, 'sketch_attempt_count') &&
            patch.sketch_last_error === null;

          const buildChain = (terminal: () => Promise<unknown>) => {
            const node: Record<string, unknown> = {
              eq: () => node,
              lt: () => node,
              is: () => node,
              or: () => node,
              select: () => terminal(),
              then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                terminal().then(resolve, reject),
            };
            return node;
          };

          if (isClaim) {
            updateCalls.push({ kind: 'claim' });
            return buildChain(async () => {
              if (claimed) return { data: [], error: null };
              claimed = true;
              return { data: [{ id: row.id, sketch_attempt_count: 1 }], error: null };
            });
          }
          if (isFinal) {
            updateCalls.push({ kind: 'final' });
            return buildChain(async () => ({ data: [{ id: row.id }], error: null }));
          }
          updateCalls.push({ kind: 'recover' });
          return buildChain(async () => ({ data: null, error: null }));
        },
      }),
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            uploadSpy(...args);
            return { data: { path: args[0] }, error: null };
          },
        }),
      },
    };

    const results = await Promise.all(
      [0, 1, 2, 3].map(() =>
        runSketchPipeline({
          libraryItemId: LIB_ID,
          userId: UID,
          supabase: supabase as unknown as NonNullable<
            Parameters<typeof runSketchPipeline>[0]['supabase']
          >,
        }),
      ),
    );

    const generated = results.filter((r) => r.status === 'generated').length;
    const claimLost = results.filter(
      (r) => r.status === 'skipped' && r.reason === 'claim_lost',
    ).length;

    expect(generated).toBe(1);
    expect(claimLost).toBe(3);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * SEC-M1 (F-LIBOVR-SEC-M1-PNG-DECODE-CAP) — Codex Round 1 Critical #2
   * fix. The 5MB response-body cap now lives UPSTREAM in
   * `callGeminiImage` so the cap fires BEFORE `response.json()`
   * materializes the full base64 string in heap. The pipeline catches
   * the typed `GeminiOversizeError` via its existing try/catch and
   * routes it to `recordFailure` exactly like any other Gemini failure.
   *
   * The pipeline still keeps a post-decode `pngBuf.byteLength` check as
   * defense-in-depth in case the upstream cap was ever bypassed.
   *
   * The CAS claim already bumped `sketch_attempt_count` BEFORE the
   * Gemini call, so the retry-cap mechanics engage naturally without
   * double-bumping (no special-case handling in recordFailure required).
   */
  it('SEC-M1: oversized Gemini response → upstream GeminiOversizeError → failed, no sharp call', async () => {
    // Mock a response whose Content-Length header advertises >7MB so the
    // upstream cap in callGeminiImage rejects BEFORE response.json() is
    // ever invoked. The pipeline sees a thrown GeminiOversizeError and
    // routes it through its standard failure path.
    delete process.env.KALORI_SKETCH_FIXTURE_BASE64;
    const oversize = 8 * 1024 * 1024; // 8 MB > 7 MB cap
    const fakeBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const jsonSpy = vi.fn(() => {
      throw new Error('SHOULD_NOT_REACH_JSON');
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': String(oversize),
        'content-type': 'application/json',
      }),
      json: jsonSpy,
      body: fakeBody,
    } as unknown as Response);

    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      // Upstream GeminiOversizeError message carries the "oversize" marker.
      expect(outcome.error.toLowerCase()).toContain('oversize');
    }
    // Body must NOT have been read as JSON — cap rejected on Content-Length.
    expect(jsonSpy).not.toHaveBeenCalled();
    // Claim must have fired (atomic CAS claim runs BEFORE Gemini call).
    expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
    // Recover wrote sketch_last_error with the oversize marker.
    const recover = findCallByKind(updateCalls, 'recover');
    expect(recover).toBeDefined();
    expect(String(recover!.patch.sketch_last_error).toLowerCase()).toContain('oversize');
    // No final UPDATE — thumbnail_url must NEVER be written on failure.
    expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
    // Upload must NOT have been called (we rejected before sharp/upload).
    expect(uploadSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('SEC-M1: truncated PNG header → sharp default failOn rejects, recorded', async () => {
    // Valid PNG signature (8 bytes) + nothing else. sharp's default
    // failOn level ('warning' — strictest) MUST reject this; IHDR is
    // missing so libpng's header-parse phase throws "end of stream".
    // Codex Round 1 C1 fix: we no longer override failOn to 'truncated'
    // (which is strictly LESS strict than the default 'warning' per
    // sharp 0.34.x type FailOnOptions = 'none' | 'truncated' | 'error' | 'warning').
    const truncatedPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
      'base64',
    );
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = truncatedPng;

    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('failed');
    // Claim ran (atomic) before the truncated buffer reached sharp.
    expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
    // Recover wrote the sharp error message.
    const recover = findCallByKind(updateCalls, 'recover');
    expect(recover).toBeDefined();
    expect(typeof recover!.patch.sketch_last_error).toBe('string');
    // No final UPDATE, no upload — sharp threw before encoding succeeded.
    expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  /**
   * Codex Round 1 C1 regression — malformed-but-not-truncated PNG.
   *
   * The PNG signature is valid + the IHDR chunk is valid, but the IDAT
   * chunk is bogus. This is NOT a header truncation, so the previous
   * `failOn: 'truncated'` setting could theoretically have let this
   * slip through (it's between 'truncated' and 'warning' on the
   * strictness ladder — anything failOn='truncated' rejects must also
   * be rejected by 'warning', so the inverse — bytes that 'truncated'
   * misses but 'warning' catches — is what Codex flagged).
   *
   * With the C1 fix (failOn unset = default 'warning' OR explicit
   * 'warning'), this malformed IDAT stream must be rejected.
   */
  it('SEC-M1 (Codex C1 regression): malformed-but-not-truncated PNG rejected by default failOn', async () => {
    // Valid PNG signature (8 bytes) + valid IHDR chunk (1x1, 8-bit, RGB)
    // + bogus IDAT chunk (length=5 but data is 5 0xff bytes, not valid
    // zlib stream) + valid IEND. libpng's IDAT decompression phase
    // throws "IDAT stream error" — rejected by failOn 'warning' but
    // potentially missed by 'truncated' in some sharp versions.
    const malformedPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
      ]),
      Buffer.from([
        0x00, 0x00, 0x00, 0x05, 0x49, 0x44, 0x41, 0x54, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
        0x00, 0x00,
      ]),
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
    ]).toString('base64');
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = malformedPng;

    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('failed');
    // Claim ran (atomic) BEFORE sharp got the buffer.
    expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
    // Recover wrote the sharp error message.
    const recover = findCallByKind(updateCalls, 'recover');
    expect(recover).toBeDefined();
    expect(typeof recover!.patch.sketch_last_error).toBe('string');
    // No final UPDATE, no upload — sharp threw on the IDAT stream.
    expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('SEC-M1: normal-sized PNG response (1x1 PNG) → still succeeds (regression guard)', async () => {
    // FIXTURE_PNG_B64 is the 1x1 transparent PNG (~70 bytes raw). This
    // is the existing happy-path baseline — confirm the new size guard
    // does NOT regress it (5MB cap is 3-10× the realistic worst case).
    const row: RowState = {
      id: LIB_ID,
      user_id: UID,
      client_id: 'rowclient',
      display_name: 'Avocado',
      thumbnail_url: null,
      thumbnail_kind: null,
      sketch_generated_at: null,
      sketch_attempt_count: 0,
    };
    const { supabase, updateCalls, uploadSpy } = buildSupabaseMock(row);

    const outcome = await runSketchPipeline({
      libraryItemId: LIB_ID,
      userId: UID,
      supabase: supabase as unknown as NonNullable<
        Parameters<typeof runSketchPipeline>[0]['supabase']
      >,
    });

    expect(outcome.status).toBe('generated');
    expect(uploadSpy).toHaveBeenCalledOnce();
    // Final UPDATE wrote the path (Codex Critical #1 — PATH not URL).
    const final = findCallByKind(updateCalls, 'final');
    expect(final).toBeDefined();
    expect(final!.patch.thumbnail_url).toBe(`${UID}/sketch_rowclient.webp`);
  });
});
