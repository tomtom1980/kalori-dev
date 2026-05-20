/**
 * @vitest-environment node
 *
 * Bug 5 (library overhaul 2026-05-16) — POST /api/library/sketch/backfill
 *
 * Tests confirm:
 *   1. Respects the 200-item cap (assert .limit() was called with 200)
 *   2. Sequential processing — N candidates → N pipeline invocations
 *   3. Returns aggregated counts { generated, failed, skipped, remaining }
 *   4. Skips no candidates branch (returns zero counts cleanly)
 *   5. Cache invalidation only when generated > 0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UID = 'u-cccccccc';

interface CandidateMock {
  id: string;
  display_name: string;
}

function setupMocks(opts: {
  candidates?: CandidateMock[];
  pipelineOutcomes?: Array<
    | { status: 'generated'; thumbnailUrl: string }
    | { status: 'failed'; error: string }
    | { status: 'skipped'; reason: string }
  >;
  remainingCount?: number;
}) {
  const candidates = opts.candidates ?? [];
  const outcomes =
    opts.pipelineOutcomes ??
    candidates.map(() => ({
      status: 'generated' as const,
      thumbnailUrl: 'https://x/y.webp',
    }));
  const remainingCount = opts.remainingCount ?? 0;

  const revalidateTagFn = vi.fn();
  const pipelineFn = vi.fn();
  // Each call gets the next-in-line outcome.
  outcomes.forEach((o) => pipelineFn.mockResolvedValueOnce(o));

  const limitSpy = vi.fn().mockResolvedValue({ data: candidates, error: null });

  vi.doMock('server-only', () => ({}));
  vi.doMock('next/cache', () => ({
    revalidateTag: revalidateTagFn,
    revalidatePath: vi.fn(),
  }));
  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: async () => ({ user: { id: UID }, profile: { id: UID } }),
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: async () => null,
  }));
  vi.doMock('@/lib/library/sketch-pipeline', () => ({
    runSketchPipeline: pipelineFn,
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: UID } }, error: null }),
      },
      from: () => {
        // chained query builder. Each method returns `this`-ish until the
        // terminal `.limit()` (candidates) or `.lt()` (count).
        let isCount = false;
        const builder: Record<string, unknown> = {
          select: (_cols: string, options?: { count?: string; head?: boolean }) => {
            if (options?.count === 'exact') isCount = true;
            return builder;
          },
          eq: () => builder,
          is: () => builder,
          or: () => builder,
          lt: () => {
            if (isCount) {
              return Promise.resolve({ count: remainingCount, error: null });
            }
            return builder;
          },
          order: () => builder,
          limit: limitSpy,
        };
        return builder as unknown as ReturnType<typeof structuredClone>;
      },
    }),
  }));

  return { revalidateTagFn, pipelineFn, limitSpy };
}

async function callRoute(): Promise<Response> {
  const { POST } = await import('@/app/api/library/sketch/backfill/route');
  return POST(
    new Request('http://kalori.test/api/library/sketch/backfill', {
      method: 'POST',
    }),
  );
}

describe('POST /api/library/sketch/backfill — Bug 5', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('next/cache');
    vi.doUnmock('server-only');
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/account/deleting-fence');
    vi.doUnmock('@/lib/library/sketch-pipeline');
  });

  it('respects the 200-item cap via limit()', async () => {
    const { limitSpy } = setupMocks({ candidates: [] });
    await callRoute();
    expect(limitSpy).toHaveBeenCalledWith(200);
  });

  it('processes each candidate sequentially', async () => {
    const candidates: CandidateMock[] = [
      { id: 'a', display_name: 'Apple' },
      { id: 'b', display_name: 'Banana' },
      { id: 'c', display_name: 'Cherry' },
    ];
    const { pipelineFn } = setupMocks({ candidates });
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(pipelineFn).toHaveBeenCalledTimes(3);
    expect(pipelineFn.mock.calls[0]![0].libraryItemId).toBe('a');
    expect(pipelineFn.mock.calls[1]![0].libraryItemId).toBe('b');
    expect(pipelineFn.mock.calls[2]![0].libraryItemId).toBe('c');
  });

  it('returns aggregated counts', async () => {
    const candidates: CandidateMock[] = [
      { id: 'a', display_name: 'A' },
      { id: 'b', display_name: 'B' },
      { id: 'c', display_name: 'C' },
    ];
    setupMocks({
      candidates,
      pipelineOutcomes: [
        { status: 'generated', thumbnailUrl: 'https://a' },
        { status: 'failed', error: 'gemini_error' },
        { status: 'skipped', reason: 'photo_present' },
      ],
      remainingCount: 5,
    });
    const res = await callRoute();
    const body = (await res.json()) as {
      generated: number;
      failed: number;
      skipped: number;
      remaining: number;
      processedBatchSize: number;
    };
    expect(body.generated).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.remaining).toBe(5);
    expect(body.processedBatchSize).toBe(3);
  });

  it('returns zero counts when no candidates', async () => {
    setupMocks({ candidates: [], remainingCount: 0 });
    const res = await callRoute();
    const body = (await res.json()) as {
      generated: number;
      failed: number;
      skipped: number;
    };
    expect(body.generated).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it('only revalidates cache when generated > 0', async () => {
    const candidates: CandidateMock[] = [{ id: 'a', display_name: 'A' }];
    const { revalidateTagFn } = setupMocks({
      candidates,
      pipelineOutcomes: [{ status: 'failed', error: 'x' }],
    });
    await callRoute();
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  it('revalidates cache when at least one generated', async () => {
    const candidates: CandidateMock[] = [{ id: 'a', display_name: 'A' }];
    const { revalidateTagFn } = setupMocks({
      candidates,
      pipelineOutcomes: [{ status: 'generated', thumbnailUrl: 'https://a' }],
    });
    await callRoute();
    expect(revalidateTagFn).toHaveBeenCalled();
  });
});
