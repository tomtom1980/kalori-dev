/**
 * Gemini image-generation REST wrapper — Bug 5 (library overhaul
 * 2026-05-16).
 *
 * Sibling of `lib/ai/client.ts` (text), purpose-built for the
 * `gemini-2.5-flash-image` (a.k.a. Nano Banana) model which returns
 * PNG bytes via `inlineData` instead of JSON via text.
 *
 * Contract:
 *   - Accepts a `SketchPromptPayload` (`v1_sketchPrompt` output) +
 *     optional abort signal.
 *   - Returns `{ base64: string; mimeType: string }` on success.
 *   - Returns `null` if the model produced no inline image part
 *     (rare but possible if Gemini drifts to a text-only response).
 *   - Throws on non-2xx response — caller's pipeline catches + persists
 *     the error in `sketch_last_error`.
 *
 * Test-mode bypass: when `KALORI_SKETCH_FIXTURE_BASE64` is set AND
 * `NODE_ENV !== 'production'`, returns that fixture verbatim without
 * touching the network. Used by route integration tests to avoid live
 * API calls. The prod-gate (SEC-M2) prevents the fixture from leaking
 * into the Production Vercel scope via operator error.
 */
import type { SketchPromptPayload } from './sketch-prompt';

export interface GeminiImageResult {
  readonly base64: string;
  readonly mimeType: string;
}

export interface GeminiImageCallInput {
  readonly payload: SketchPromptPayload;
  readonly abortSignal?: AbortSignal;
  /**
   * Override model — defaults to `gemini-2.5-flash-image` per the
   * brainstorm Open Decision #1. Tests can pass an alternate value to
   * confirm the URL is composed correctly.
   */
  readonly model?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

/**
 * SEC-M1 (Codex Round 1 Critical #2; Round 3 C-R2-1 hardening) — upper
 * bound on the DECODED response body bytes accepted from the Gemini
 * Image endpoint. Sized at 7 MB to carry a 5 MB decoded PNG through
 * base64 (×4/3 inflation ≈ 6.7 MB) + JSON envelope overhead. The
 * pipeline's `sketch-pipeline.ts` still checks
 * `pngBuf.byteLength <= 5 MB` post-decode as defense-in-depth.
 *
 * The Round 1 cap fired AFTER `response.json()` had already
 * materialized the full base64 string in serverless heap, so the
 * advertised "heap-amplification protection" was illusion. The Round 1
 * fix moved the cap upstream but still used `Content-Length` as an
 * early-accept short-circuit — which fails under
 * `Content-Encoding: gzip/br`, where Content-Length is the COMPRESSED
 * wire size and the decoded JSON can be far larger.
 *
 * Round 3 (C-R2-1) hardening: `Content-Length` is now ONLY used as an
 * early reject signal (compressed > cap implies decoded > cap, so we
 * can throw without consuming the body). Every accepted response MUST
 * flow through the streaming byte-counter so decoded-size — not
 * wire-size — is what the cap enforces.
 */
export const MAX_RESPONSE_BYTES = 7 * 1024 * 1024;

/**
 * Typed error thrown by `callGeminiImage` when the Gemini response body
 * exceeds `MAX_RESPONSE_BYTES`. `runSketchPipeline` catches this via its
 * existing try/catch and routes it to `recordFailure` (writes
 * `sketch_last_error`) without writing a thumbnail.
 *
 * Distinct subclass (not a plain `Error`) so future tests and Sentry
 * tags can disambiguate this failure mode from generic upstream errors.
 */
export class GeminiOversizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiOversizeError';
  }
}

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.length === 0) {
    throw new Error('GEMINI_API_KEY is not set in process.env');
  }
  return key;
}

interface GeminiImageEnvelope {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly inlineData?: { readonly mimeType?: string; readonly data?: string };
      }[];
    };
  }[];
}

function extractImage(envelope: GeminiImageEnvelope): GeminiImageResult | null {
  const parts = envelope.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data && inline.mimeType) {
      return { base64: inline.data, mimeType: inline.mimeType };
    }
  }
  return null;
}

/**
 * Call the Gemini image-generation endpoint. Server-side only.
 *
 * Fixture mode: if `KALORI_SKETCH_FIXTURE_BASE64` is set in the
 * environment, the wrapper returns `{ base64, mimeType: 'image/png' }`
 * without making a network call. This is the test-deterministic surface.
 *
 * Prod-gate (SEC-M2, bugfix mini-batch A 2026-05-16): fixture mode is
 * positive-allowlisted to `NODE_ENV !== 'production'` so an operator
 * typo / leftover debug var / supply-chain attacker setting
 * `KALORI_SKETCH_FIXTURE_BASE64` in the Production Vercel scope cannot
 * silently fence every user's sketch to the fixture image. In prod,
 * the gate falls through to the live Gemini call. Mirrors the pattern
 * at `lib/library/sketch-enqueue.ts:55-58`.
 */
export async function callGeminiImage(
  input: GeminiImageCallInput,
): Promise<GeminiImageResult | null> {
  if (process.env.NODE_ENV !== 'production') {
    const fixture = process.env.KALORI_SKETCH_FIXTURE_BASE64;
    if (fixture && fixture.length > 0) {
      return { base64: fixture, mimeType: 'image/png' };
    }
  }

  const model = input.model ?? DEFAULT_MODEL;
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: input.payload.contents,
    // No JSON-mode here — the model emits image bytes, not structured text.
    generationConfig: {
      // Gemini image models accept response modalities; pass IMAGE so the
      // candidate ships inlineData rather than a textual description.
      responseModalities: ['IMAGE'],
    },
  };

  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  };
  if (input.abortSignal) init.signal = input.abortSignal;

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Gemini image call failed: HTTP ${response.status}`);
  }
  const envelope = await readBodyWithCap(response);
  return extractImage(envelope);
}

/**
 * SEC-M1 — read the response body while enforcing
 * `MAX_RESPONSE_BYTES`.
 *
 * Round 3 (C-R2-1) hardening: `Content-Length` is ONLY used as an early
 * REJECT signal — never as an early accept. Under
 * `Content-Encoding: gzip` (or `br`), Content-Length is the COMPRESSED
 * wire size; the decoded body that JSON.parse would see can be many
 * times larger. A 200KB gzipped response can decompress to multiple MB.
 * The streaming byte-counter is therefore the only safe correctness
 * boundary, and EVERY accepted response flows through it.
 *
 * Flow:
 *   1. If `Content-Length` is present and already exceeds the cap,
 *      throw immediately. (Compressed-size oversize implies decoded-size
 *      oversize — a free early reject.)
 *   2. ALWAYS stream `response.body` via `getReader()`, accumulating
 *      chunks into an in-memory buffer with a running byte counter.
 *      Abort + cancel the stream the moment the accumulator exceeds
 *      the cap.
 *   3. After clean termination, concatenate, decode UTF-8, and JSON.parse.
 *
 * Throws `GeminiOversizeError` on overflow. The pipeline catches it
 * through its standard try/catch and persists the failure via
 * `recordFailure`.
 */
async function readBodyWithCap(response: Response): Promise<GeminiImageEnvelope> {
  // Early REJECT only — Content-Length below the cap is NOT proof the
  // decoded body is below the cap, so we never short-circuit to .json().
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      // Cancel the body so the underlying socket isn't held open by an
      // unread ReadableStream — Node 22 will GC the response, but
      // explicit cancellation is the cleanest signal.
      try {
        await response.body?.cancel();
      } catch {
        // ignore cancel errors — we're already throwing
      }
      throw new GeminiOversizeError(
        `Gemini response oversize: Content-Length=${contentLength} exceeds ${MAX_RESPONSE_BYTES}`,
      );
    }
  }

  // ALWAYS stream and count decoded bytes — this is the only true safety
  // for Content-Encoding: gzip/br responses where the compressed size on
  // the wire can be far smaller than the decoded payload.
  const reader = response.body?.getReader();
  if (!reader) {
    // No body available — fall back to .json() so the caller still
    // sees the standard "missing inlineData" path (returns null).
    return (await response.json()) as GeminiImageEnvelope;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        // Cancel the underlying stream so we don't drain bytes we'll
        // never use. `reader.cancel` propagates to the body's source.
        try {
          await reader.cancel();
        } catch {
          // ignore — we're already throwing
        }
        throw new GeminiOversizeError(
          `Gemini response oversize: streamed body exceeded ${MAX_RESPONSE_BYTES} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    // Release the lock so the body can be cancelled/GC'd cleanly.
    try {
      reader.releaseLock();
    } catch {
      // ignore — reader may already be released by cancel()
    }
  }

  // Concatenate chunks into a single buffer and JSON-parse via TextDecoder.
  // The byte-count gate above ensures `total <= MAX_RESPONSE_BYTES`.
  let merged: Uint8Array;
  if (chunks.length === 1) {
    merged = chunks[0]!;
  } else {
    merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
  }
  const text = new TextDecoder('utf-8').decode(merged);
  return JSON.parse(text) as GeminiImageEnvelope;
}
