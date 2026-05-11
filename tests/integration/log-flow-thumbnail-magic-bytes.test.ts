/**
 * @vitest-environment node
 *
 * Task 3.3 C2 + C3 — magic-byte validation for /api/storage/thumbnail.
 *
 * Before fix:
 *   - Client-supplied `mimeType` is trusted; random bytes can land under
 *     `image/webp`.
 *   - `Buffer.from(x, 'base64')` never throws on malformed input (the
 *     catch is dead code); garbage bytes silently upload.
 *
 * After fix:
 *   - Sniff magic bytes of the decoded buffer before upload. Reject 400
 *     on mismatch. Derive contentType from the sniff.
 *   - Validate base64 shape via regex before decoding; reject 400 on
 *     malformed input.
 */
import { describe, expect, it, vi } from 'vitest';

const AUTHED_USER = {
  id: '11111111-1111-4111-8111-111111111111',
};

type UploadFn = (
  path: string,
  buf: Buffer,
  opts?: { contentType?: string; upsert?: boolean; cacheControl?: string },
) => Promise<{ data: { path: string } | null; error: null | { message: string } }>;

function makeSupabaseMock(uploadSpy: ReturnType<typeof vi.fn<UploadFn>>) {
  return {
    getServerSupabase: async () => ({
      auth: {
        getUser: async () => ({ data: { user: AUTHED_USER }, error: null }),
      },
      // Codex Round 2 NEW-I1 — fence reads profiles.deleting_at via `from()`.
      from: (table: string) =>
        table === 'profiles'
          ? {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { deleting_at: null }, error: null }),
                }),
              }),
            }
          : ({} as never),
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
  };
}

/**
 * Build a base64 payload from raw bytes — this mirrors what the client
 * sends over the wire.
 */
function toB64(bytes: Uint8Array): string {
  // Node Buffer conversion only; this runs under `@vitest-environment node`.
  return Buffer.from(bytes).toString('base64');
}

describe('Task 3.3 C2 — /api/storage/thumbnail sniffs magic bytes', () => {
  it('rejects 400 when bytes are NOT a supported image (arbitrary ASCII with image/webp MIME)', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>();
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // "Not an image at all" — valid base64 of plain ASCII.
    const garbage = toB64(new TextEncoder().encode('<html>not an image</html>'));
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '55555555-5555-4555-8555-555555555555',
        imageBase64: garbage,
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects 400 when declared mimeType does NOT match sniffed magic bytes', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>();
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // Declare WEBP but send PNG magic bytes.
    const pngMagic = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '66666666-6666-4666-8666-666666666666',
        imageBase64: toB64(pngMagic),
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('accepts 200 when JPEG magic bytes match declared image/jpeg', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // JPEG SOI + APP0 header bytes — valid-looking JPEG head.
    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '77777777-7777-4777-8777-777777777777',
        imageBase64: toB64(jpegMagic),
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts 200 when WEBP magic bytes (RIFF...WEBP) match declared image/webp', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // RIFF____WEBP = 'R','I','F','F',?,?,?,?,'W','E','B','P'
    const webpMagic = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '88888888-8888-4888-8888-888888888888',
        imageBase64: toB64(webpMagic),
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  it('the sniffed MIME is used as contentType (ignoring any client-spoofed value for the upload)', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // Valid JPEG magic + declared image/jpeg. The route should upload with
    // the sniffed MIME (image/jpeg).
    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: '99999999-9999-4999-8999-999999999999',
        imageBase64: toB64(jpegMagic),
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const call = uploadSpy.mock.calls[0];
    expect(call).toBeDefined();
    const opts = call?.[2] as { contentType?: string } | undefined;
    expect(opts?.contentType).toBe('image/jpeg');
  });
});

describe('Task 3.3 C3 — /api/storage/thumbnail validates base64 shape', () => {
  it('rejects 400 when imageBase64 contains non-base64 characters', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>();
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // Contains control chars + emoji — not valid base64 at all.
    // Must be long enough to pass Zod min(8) so we reach the decode check.
    const malformedB64 = 'NOT_BASE64!!!@@@###$$$%%%^^^';
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        imageBase64: malformedB64,
        mimeType: 'image/webp',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('accepts only properly-padded base64 alphabet (A-Za-z0-9+/=)', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    // Valid JPEG magic encoded properly — all characters in base64 alphabet.
    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const clean = Buffer.from(jpegMagic).toString('base64');
    // Sanity: clean passes the regex.
    expect(/^[A-Za-z0-9+/]+={0,2}$/u.test(clean)).toBe(true);

    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        imageBase64: clean,
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('F-UI-3.6-B-6 — /api/storage/thumbnail client_id uses z.string().uuid()', () => {
  it('rejects 400 when client_id is the wrong length (loose hex regex would have accepted)', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>();
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    // 32-hex-char string without hyphens — the previous loose regex accepted
    // this as a "UUID-shape hex string" but it isn't an RFC 4122 UUID.
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'abcdef0123456789abcdef0123456789',
        imageBase64: toB64(jpegMagic),
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects 400 when client_id has UUID punctuation but an invalid version nibble', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>();
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    // Right shape but completely bogus version/variant bits — must fail
    // z.string().uuid() strict parse.
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
        imageBase64: toB64(jpegMagic),
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('accepts a valid UUIDv4 client_id', async () => {
    vi.resetModules();
    const uploadSpy = vi.fn<UploadFn>(async () => ({ data: { path: 'x' }, error: null }));
    vi.doMock('@/lib/supabase/server', () => makeSupabaseMock(uploadSpy));
    const { POST } = await import('@/app/api/storage/thumbnail/route');

    const jpegMagic = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const req = new Request('http://kalori.test/api/storage/thumbnail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        imageBase64: toB64(jpegMagic),
        mimeType: 'image/jpeg',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });
});
