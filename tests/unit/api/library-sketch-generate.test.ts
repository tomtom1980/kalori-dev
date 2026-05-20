/**
 * @vitest-environment node
 *
 * Bug 5 (library overhaul 2026-05-16) — POST /api/library/sketch/generate
 *
 * Tests confirm:
 *   1. Successful pipeline → 200 + status='generated' + thumbnailUrl
 *   2. Failed pipeline → 503 + status='failed'
 *   3. Already-sketched row → 200 + status='skipped' (idempotent — NOT 503)
 *   4. Invalid body → 400
 *   5. Cache revalidation only on the success leg (error-path discipline)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UID = 'u-bbbbbbbb';
const LIB_ID = 'aaaaaaaa-cccc-4ccc-8ccc-cccccccccccc';

function setupMocks(opts: {
  pipelineOutcome?:
    | { status: 'generated'; thumbnailUrl: string }
    | { status: 'failed'; error: string }
    | { status: 'skipped'; reason: string };
}) {
  const revalidateTagFn = vi.fn();
  const pipelineFn = vi
    .fn()
    .mockResolvedValue(
      opts.pipelineOutcome ?? { status: 'generated', thumbnailUrl: 'https://x/y.webp' },
    );

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
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: UID } }, error: null }),
      },
    }),
  }));
  vi.doMock('@/lib/library/sketch-pipeline', () => ({
    runSketchPipeline: pipelineFn,
  }));

  return { revalidateTagFn, pipelineFn };
}

async function callRoute(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/library/sketch/generate/route');
  return POST(
    new Request('http://kalori.test/api/library/sketch/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/library/sketch/generate — Bug 5', () => {
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

  it('successful pipeline returns 200 + status=generated + path-typed thumbnailUrl', async () => {
    const { revalidateTagFn } = setupMocks({
      // Codex Round 1 Critical #1 — pipeline outcomes now carry the
      // storage path (not a signed URL); routes read paths sign on
      // demand.
      pipelineOutcome: { status: 'generated', thumbnailUrl: 'u-1/sketch_cid.webp' },
    });
    const res = await callRoute({ libraryItemId: LIB_ID });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; thumbnailUrl: string };
    expect(body.status).toBe('generated');
    // The route surfaces the pipeline outcome verbatim; the path is
    // forwarded so the client can choose to sign-on-read or
    // (more typically) re-fetch the library page which will sign for it.
    expect(body.thumbnailUrl).toBe('u-1/sketch_cid.webp');
    expect(body.thumbnailUrl.startsWith('http')).toBe(false);
    expect(revalidateTagFn).toHaveBeenCalled();
  });

  it('failed pipeline returns 503 + status=failed and does NOT revalidate (error-path)', async () => {
    const { revalidateTagFn } = setupMocks({
      pipelineOutcome: { status: 'failed', error: 'gemini_no_image' },
    });
    const res = await callRoute({ libraryItemId: LIB_ID });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; error: string };
    expect(body.status).toBe('failed');
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  it('idempotent skip returns 200 + status=skipped (not 503)', async () => {
    const { revalidateTagFn } = setupMocks({
      pipelineOutcome: { status: 'skipped', reason: 'already_generated' },
    });
    const res = await callRoute({ libraryItemId: LIB_ID });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('skipped');
    // Skipped is idempotent, NOT a generation event — no cache invalidation.
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  it('invalid body returns 400', async () => {
    setupMocks({});
    const res = await callRoute({ libraryItemId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('invokes the pipeline with the right args', async () => {
    const { pipelineFn } = setupMocks({});
    await callRoute({ libraryItemId: LIB_ID });
    expect(pipelineFn).toHaveBeenCalledOnce();
    const call = pipelineFn.mock.calls[0]![0] as { libraryItemId: string; userId: string };
    expect(call.libraryItemId).toBe(LIB_ID);
    expect(call.userId).toBe(UID);
  });
});
