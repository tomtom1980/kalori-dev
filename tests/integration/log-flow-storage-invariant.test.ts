/**
 * @vitest-environment node
 *
 * Task 3.3 I4 invariant — thumbnail-only Storage contract.
 *
 * `/api/storage/thumbnail` MUST:
 *   1. Reject payloads whose decoded size > 50 KB with 413.
 *   2. Upload exactly ONE object under `food-thumbnails/{user_id}/{client_id}.{ext}`
 *      per successful POST (no non-thumbnail artefacts).
 */
import { describe, expect, it, vi } from 'vitest';

describe('I4 — /api/storage/thumbnail invariants', () => {
  it('rejects payloads > 50 KB with 413 (original bytes never reach Storage)', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
            error: null,
          }),
        },
        // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
        storage: {
          from: () => ({
            upload: uploadSpy,
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://signed.test/x' },
              error: null,
            }),
          }),
        },
      }),
    }));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // 60 KB of data, base64-encoded = ~81 KB of ASCII — decoded = 60 KB.
    const tooBig = 'A'.repeat(Math.ceil((60 * 1024) / 0.75));
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '22222222-2222-4222-8222-222222222222',
        imageBase64: tooBig,
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(uploadSpy).not.toHaveBeenCalled(); // NEVER touched storage.
  });

  it('on 200 success, exactly ONE upload call with the {user_id}/{client_id}.{ext} path', async () => {
    vi.resetModules();
    const uploads: Array<{ path: string; contentType: string }> = [];
    const uploadSpy = vi.fn(async (path: string, _buf: Buffer, opts?: { contentType?: string }) => {
      uploads.push({ path, contentType: opts?.contentType ?? '' });
      return { data: { path }, error: null };
    });
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: '33333333-3333-4333-8333-333333333333' } },
            error: null,
          }),
        },
        // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at.
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`unknown table: ${table}`);
        },
        storage: {
          from: () => ({
            upload: uploadSpy,
            createSignedUrl: async () => ({
              data: { signedUrl: 'https://signed.test/ok' },
              error: null,
            }),
          }),
        },
      }),
    }));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // Small thumbnail — well under 50 KB; starts with valid WEBP magic
    // (RIFF____WEBP) per C2 sniff contract.
    const webpMagic = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const smallB64 = Buffer.from(webpMagic).toString('base64');
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '44444444-4444-4444-8444-444444444444',
        imageBase64: smallB64,
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    const first = uploads[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('upload not recorded');
    expect(first.path).toBe(
      '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.webp',
    );
    expect(first.contentType).toBe('image/webp');
  });
});
