/**
 * `POST /api/storage/thumbnail` — persists the <50KB food-entry thumbnail
 * (Task 3.3). I4 enforcement point.
 *
 * Contract:
 *   - Input: `{ client_id, imageBase64 (data URL or raw base64), mimeType }`
 *   - The client has already produced a thumbnail-sized image
 *     (<50 KB, longest edge ≤ 320px, WEBP or JPEG). For MVP this route
 *     does NOT re-encode server-side — native image libraries (sharp,
 *     @napi-rs/canvas) are heavy Vercel-deploy installs we defer to a
 *     future iteration. The invariant is preserved by rejecting anything
 *     over the 50 KB size budget with 413 so the client is forced to
 *     re-compress.
 *   - Upload path: `food-thumbnails/{user_id}/{client_id}.{ext}` where
 *     `ext` is `jpg` or `webp` per the incoming `mimeType`.
 *   - Returns: `{ path, signedUrl (10-min TTL), expiresAt }`.
 *
 * I4 invariant: ONLY this compressed thumbnail bytes are uploaded. The
 * original never touches Storage. Integration test
 * (`log-flow-storage-invariant.test.ts`) asserts the bucket contents after
 * a full vision-log flow.
 *
 * R1: the client MUST call this via `authPost` / `authFetch` so the
 * refresh-interceptor owns 401 retry. This route does NOT implement retry
 * logic itself — a 401 returned here bubbles up to the interceptor.
 *
 * `runtime = 'nodejs'` required — Supabase SSR cookie bridge + crypto.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Hard upper bound on the thumbnail object size. Matches briefing §I4
 * (<50 KB WEBP) + architecture.md §4.1. This is BYTES of the raw image,
 * not base64-encoded bytes.
 */
const MAX_THUMBNAIL_BYTES = 50 * 1024;

const BodySchema = z
  .object({
    // F-UI-3.6-B-6 — tighten to z.string().uuid() for consistency with the
    // other Split B routes. The prior loose regex accepted any 32–36-char
    // hex-or-hyphen string, including non-UUIDs like a bare 32-hex blob.
    client_id: z.string().uuid(),
    imageBase64: z.string().min(8),
    mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/u),
  })
  .strict();

/** Compute decoded byte length from a base64 string (ignoring padding). */
function base64DecodedSize(s: string): number {
  const clean = s.replace(/=+$/u, '');
  return Math.floor(clean.length * 0.75);
}

/** Strip the `data:image/...;base64,` prefix if present. */
function stripDataUrlPrefix(b64: string): string {
  const comma = b64.indexOf(',');
  return comma < 0 ? b64 : b64.slice(comma + 1);
}

function extFor(mime: SniffedMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

type SniffedMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Sniff the leading magic bytes of a decoded image buffer. Only returns a
 * non-null value when the bytes match a whitelisted image signature. The
 * MIME returned here — not the client-supplied mimeType — is what drives
 * the upload contentType (C2 fix: ignore client-spoofed MIME).
 *
 * Signatures:
 *   JPEG: FF D8 FF
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   WEBP: 52 49 46 46 __ __ __ __ 57 45 42 50 ('RIFF' ... 'WEBP' at offset 8)
 */
function sniffImageMime(buf: Buffer): SniffedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'image/png';
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return 'image/webp';
  return null;
}

/**
 * Strict base64 shape validator. Node's `Buffer.from(_, 'base64')` is
 * lenient — it silently strips invalid characters rather than throwing,
 * so malformed input decodes to partial garbage. We pre-validate the
 * alphabet here (C3 fix: the previous try/catch around Buffer.from was
 * dead code).
 */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/u;

function isValidBase64(s: string): boolean {
  // The alphabet check catches ~all malformed inputs. Length mod 4 === 0
  // is technically required, but `Buffer.from` normalises trailing
  // padding for us; we only guard against non-alphabet characters that
  // would silently corrupt the decode.
  return BASE64_RE.test(s);
}

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    const raw = (await request.json()) as unknown;
    parsed = BodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  // On 401 the client's refresh-interceptor retries exactly once.
  const fenced = await requireProfileOrJson401({ route: '/api/storage/thumbnail' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Storage uploads MUST be fenced — otherwise a sibling tab can write a
  // new thumbnail to the bucket between Phase 0 (storage cleanup) and
  // Phase 3 (auth.users delete) of the cascade, leaving an orphaned
  // object after the user is gone.
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;
  const bare = stripDataUrlPrefix(body.imageBase64);
  const sizeBytes = base64DecodedSize(bare);
  if (sizeBytes > MAX_THUMBNAIL_BYTES) {
    // I4 gate — server NEVER writes a non-thumbnail object.
    return NextResponse.json(
      {
        error: 'thumbnail_too_large',
        limit_bytes: MAX_THUMBNAIL_BYTES,
        actual_bytes: sizeBytes,
      },
      { status: 413 },
    );
  }

  // C3 — pre-validate base64 alphabet. `Buffer.from(_, 'base64')` is lenient
  // and never throws; malformed input would otherwise decode to partial bytes
  // and upload as corrupted content.
  if (!isValidBase64(bare)) {
    return NextResponse.json({ error: 'invalid_base64' }, { status: 400 });
  }

  const buffer = Buffer.from(bare, 'base64');

  // C2 — magic-byte sniff. Client-supplied mimeType is NOT trusted for the
  // upload contentType; the sniffed MIME is. Mismatches are rejected so an
  // attacker cannot stash non-image bytes (or PNG-labelled-as-WEBP) under
  // a whitelisted image content-type.
  const sniffed = sniffImageMime(buffer);
  if (!sniffed || sniffed !== body.mimeType) {
    return NextResponse.json({ error: 'image_magic_mismatch' }, { status: 400 });
  }

  const path = `${userId}/${body.client_id}.${extFor(sniffed)}`;

  const uploadRes = await supabase.storage.from('food-thumbnails').upload(path, buffer, {
    contentType: sniffed,
    upsert: true,
    cacheControl: '600',
  });
  if (uploadRes.error) {
    Sentry.captureException(uploadRes.error, {
      tags: { component: 'storage-thumbnail' },
    });
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }

  const signedRes = await supabase.storage.from('food-thumbnails').createSignedUrl(path, 600);
  if (signedRes.error || !signedRes.data?.signedUrl) {
    Sentry.captureException(signedRes.error ?? new Error('signed_url_missing'), {
      tags: { component: 'storage-thumbnail' },
    });
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + 600 * 1000).toISOString();
  return NextResponse.json(
    { path, signedUrl: signedRes.data.signedUrl, expiresAt },
    { status: 200 },
  );
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
