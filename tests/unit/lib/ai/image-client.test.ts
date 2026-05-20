/**
 * @vitest-environment node
 *
 * Unit tests for `lib/ai/image-client.ts` — Bug 5 (library overhaul
 * 2026-05-16).
 *
 * The wrapper has three observable surfaces:
 *   1. Fixture mode (env-gated) — returns deterministic bytes without
 *      touching the network. Used by route integration tests.
 *   2. Network mode — POST to v1beta generateContent endpoint, parse
 *      `inlineData.data` from the candidate.
 *   3. Error path — non-2xx throws; missing inlineData returns null.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callGeminiImage, GeminiOversizeError, MAX_RESPONSE_BYTES } from '@/lib/ai/image-client';
import { v1_sketchPrompt } from '@/lib/ai/sketch-prompt';

// 1x1 transparent PNG, base64-encoded. Stable bytes — safe to use as
// the fixture for tests that need a real-looking image payload.
const FIXTURE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAUAAen63NgAAAAASUVORK5CYII=';

describe('callGeminiImage', () => {
  const originalEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.KALORI_SKETCH_FIXTURE_BASE64;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fetchSpy.mockRestore();
  });

  it('returns fixture bytes when KALORI_SKETCH_FIXTURE_BASE64 is set (deterministic mode)', async () => {
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
    const payload = v1_sketchPrompt({ displayName: 'Apple' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
    expect(result!.mimeType).toBe('image/png');
    // Fixture mode MUST NOT touch the network.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('makes a real fetch when fixture env is unset and parses inlineData', async () => {
    const envelope = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 },
              },
            ],
          },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const payload = v1_sketchPrompt({ displayName: 'Banana' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
    expect(result!.mimeType).toBe('image/png');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toContain('gemini-2.5-flash-image:generateContent');
    // Regression-lock: pin the cheap flash variant; prevent silent
    // upgrade to the expensive Pro variant (gemini-3-pro-image-preview,
    // a.k.a. "Nano Banana Pro"). See Planning bugfix batch
    // 2026-05-16-library-sketch-display Bug 1.
    expect(calledUrl).not.toContain('gemini-3-pro-image-preview');
  });

  it('returns null when the envelope has no inlineData part', async () => {
    const envelope = {
      candidates: [
        {
          content: { parts: [{ text: 'I cannot draw' }] },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const payload = v1_sketchPrompt({ displayName: 'Cherry' });
    const result = await callGeminiImage({ payload });
    expect(result).toBeNull();
  });

  it('throws on non-2xx response (error-path coverage)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('quota exceeded', {
        status: 429,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    const payload = v1_sketchPrompt({ displayName: 'Date' });
    await expect(callGeminiImage({ payload })).rejects.toThrow(/HTTP 429/);
  });

  it('throws when GEMINI_API_KEY is missing (and fixture is not set)', async () => {
    delete process.env.GEMINI_API_KEY;
    const payload = v1_sketchPrompt({ displayName: 'Egg' });
    await expect(callGeminiImage({ payload })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('accepts a custom model name in the URL', async () => {
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 } }],
          },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const payload = v1_sketchPrompt({ displayName: 'Fig' });
    await callGeminiImage({ payload, model: 'gemini-test-image' });
    const calledUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(calledUrl).toContain('gemini-test-image:generateContent');
  });

  // ---------------------------------------------------------------
  // Production prod-gate guard (SEC-M2). Mirrors the positive-allowlist
  // pattern at `lib/library/sketch-enqueue.ts:55-58`. The fixture env
  // var MUST NOT short-circuit to the fixture bytes when
  // `NODE_ENV='production'` — otherwise an operator typo or leftover
  // debug var in the Production Vercel scope silently fences every
  // user's sketch to the fixture image.
  // ---------------------------------------------------------------

  it('falls through to live API when NODE_ENV=production even if fixture env is set (prod-gate)', async () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 } }],
          },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const payload = v1_sketchPrompt({ displayName: 'Grape' });
    const result = await callGeminiImage({ payload });
    // Proof of prod-gate: the live fetch path was exercised, NOT the
    // fixture short-circuit. The returned bytes happen to match the
    // fixture because we mocked the envelope with the same bytes — the
    // load-bearing assertion is `fetchSpy.toHaveBeenCalledOnce`.
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
  });

  it('keeps fixture-mode active when NODE_ENV=test (no regression for unit tests)', async () => {
    process.env = { ...process.env, NODE_ENV: 'test' };
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
    const payload = v1_sketchPrompt({ displayName: 'Honeydew' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
    expect(result!.mimeType).toBe('image/png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps fixture-mode active when NODE_ENV=development (no regression for local dev)', async () => {
    process.env = { ...process.env, NODE_ENV: 'development' };
    process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
    const payload = v1_sketchPrompt({ displayName: 'Imbe' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
    expect(result!.mimeType).toBe('image/png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // SEC-M1 — Codex Round 1 Critical #2 fix: upstream response-body cap.
  //
  // Pre-fix, the 5MB cap fired AFTER `response.json()` had already
  // materialized the full base64 string in heap — so the "heap
  // amplification" defense was illusion. The cap now lives in
  // `callGeminiImage` BEFORE `.json()`, using `Content-Length` when
  // available and a streaming byte-accumulator otherwise. Throws a
  // typed `GeminiOversizeError` that `runSketchPipeline` catches via
  // its existing try/catch and routes to `recordFailure`.
  // ---------------------------------------------------------------

  it('exposes MAX_RESPONSE_BYTES as a numeric constant (sanity)', () => {
    // 5MB decoded image + ~33% base64 overhead + JSON envelope frame =
    // 7MB ceiling for the wire-level response body. Decoded buffer in
    // sketch-pipeline still defends with its own 5MB cap.
    expect(typeof MAX_RESPONSE_BYTES).toBe('number');
    expect(MAX_RESPONSE_BYTES).toBeGreaterThan(5 * 1024 * 1024);
    expect(MAX_RESPONSE_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it('exports GeminiOversizeError as a typed Error subclass', () => {
    const err = new GeminiOversizeError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GeminiOversizeError');
    expect(err.message).toBe('test');
  });

  it('rejects oversized response via Content-Length BEFORE response.json() is read', async () => {
    // Mock a Response whose Content-Length exceeds the cap. We replace
    // .json() with a spy that throws — if the code path ever reaches
    // .json(), the test will fail with the spy error rather than the
    // upstream cap error. The cap must fire FIRST.
    const oversizeBytes = MAX_RESPONSE_BYTES + 1024;
    const jsonSpy = vi.fn(() => {
      throw new Error('SHOULD_NOT_REACH_JSON');
    });
    const fakeBody = new ReadableStream({
      start(controller) {
        // We won't actually stream here — the cap should reject on
        // Content-Length alone without consuming the body.
        controller.close();
      },
    });
    const oversizeResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': String(oversizeBytes),
        'content-type': 'application/json',
      }),
      json: jsonSpy,
      body: fakeBody,
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(oversizeResponse);

    const payload = v1_sketchPrompt({ displayName: 'Jackfruit' });
    await expect(callGeminiImage({ payload })).rejects.toBeInstanceOf(GeminiOversizeError);
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('accepts response when Content-Length is within cap (normal path streams decoded bytes)', async () => {
    // Post-Round-3 (C-R2-1 fix): even when Content-Length is within the cap,
    // the implementation MUST stream the body and count decoded bytes —
    // never trust Content-Length for an early-accept. Content-Length is the
    // *compressed* wire size under Content-Encoding: gzip/br; the decoded
    // payload may be much larger. The streaming counter is the only true
    // safety, so `.json()` must NOT be called on this path.
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 } }],
          },
        },
      ],
    };
    const bodyText = JSON.stringify(envelope);
    const bodyBytes = new TextEncoder().encode(bodyText);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    });
    const jsonSpy = vi.fn(() => {
      throw new Error('SHOULD_NOT_REACH_JSON');
    });
    const inCapResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(bodyBytes.byteLength),
      }),
      json: jsonSpy,
      body,
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(inCapResponse);

    const payload = v1_sketchPrompt({ displayName: 'Kiwi' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
    // Critical: even with Content-Length within cap, .json() must NOT be
    // called — the streaming/counting path is mandatory.
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // SEC-M1 — Codex Round 3 (C-R2-1) regression: gzip/br bomb.
  //
  // Round 1's C2 fix used Content-Length as an early-accept signal. But
  // under `Content-Encoding: gzip` (or `br`), Content-Length is the
  // *compressed* wire-size. A 200KB gzipped response can decompress to
  // multiple MB. The streaming counter is the only true safety, so the
  // implementation must ALWAYS stream the body and count decoded bytes,
  // never short-circuit to `.json()` on a "small" Content-Length.
  // ---------------------------------------------------------------

  it('gzip-bomb scenario: small Content-Length but streamed body exceeds cap → throws mid-stream', async () => {
    // Simulate a gzipped response: server advertises Content-Length=200KB
    // (the compressed wire size) with Content-Encoding: gzip, but the
    // ReadableStream actually yields decoded bytes well past the cap.
    // The implementation MUST detect the overflow during stream-counting
    // and throw, NOT after a .json() materialization.
    const chunkSize = 256 * 1024; // 256 KB chunks
    let produced = 0;
    let pullCallsAfterCap = 0;
    let capReached = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (capReached) pullCallsAfterCap += 1;
        if (produced > MAX_RESPONSE_BYTES + 4 * chunkSize) {
          // Safety valve: if the cap is somehow never hit, close so the
          // test fails with a clear assertion instead of timing out.
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(chunkSize));
        produced += chunkSize;
        if (produced > MAX_RESPONSE_BYTES) capReached = true;
      },
    });
    const jsonSpy = vi.fn(() => {
      throw new Error('SHOULD_NOT_REACH_JSON');
    });
    const gzipBombResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        // Compressed size is well within cap — the OLD (pre-Round-3)
        // implementation would have short-circuited on this and called
        // .json(), letting the oversized decoded body materialize in heap.
        'content-length': '204800', // 200 KB
        'content-encoding': 'gzip',
      }),
      json: jsonSpy,
      body,
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(gzipBombResponse);

    const payload = v1_sketchPrompt({ displayName: 'Nectarine' });
    await expect(callGeminiImage({ payload })).rejects.toBeInstanceOf(GeminiOversizeError);
    // The fix must NOT have invoked .json() — the cap fired mid-stream.
    expect(jsonSpy).not.toHaveBeenCalled();
    // And no continued pulls after the throw (reader cancelled).
    await new Promise((r) => setTimeout(r, 0));
    expect(pullCallsAfterCap).toBeLessThanOrEqual(1);
  });

  it('streams body and aborts when no Content-Length header is present and size exceeds cap', async () => {
    // Build a chunked ReadableStream that produces unbounded chunks
    // (would keep going until the consumer aborts). The cap must
    // accumulate during stream-read and abort once exceeded — the test
    // would HANG (timeout) if the abort didn't fire, because pull would
    // keep enqueueing forever.
    //
    // Note on vitest runtime: vitest sandboxes do NOT propagate
    // `reader.cancel()` to a user-supplied `source.cancel` callback in
    // a synchronously observable way. We rely instead on the BEHAVIOR
    // that matters — `pull()` stops being called after the throw, the
    // function rejects with `GeminiOversizeError`, and `response.json()`
    // is never invoked. In real Node 22 with a real Response, the cancel
    // does propagate (verified via standalone Node repro).
    const chunkSize = 256 * 1024; // 256 KB
    let produced = 0;
    let pullCallsAfterCap = 0;
    let capReached = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (capReached) pullCallsAfterCap += 1;
        if (produced > MAX_RESPONSE_BYTES + 4 * chunkSize) {
          // Safety valve: if the cap is somehow never hit, close so the
          // test can fail with a clear assertion instead of timing out.
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(chunkSize));
        produced += chunkSize;
        if (produced > MAX_RESPONSE_BYTES) capReached = true;
      },
    });
    const jsonSpy = vi.fn(() => {
      throw new Error('SHOULD_NOT_REACH_JSON');
    });
    const streamedResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }), // no content-length
      json: jsonSpy,
      body,
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(streamedResponse);

    const payload = v1_sketchPrompt({ displayName: 'Lychee' });
    await expect(callGeminiImage({ payload })).rejects.toBeInstanceOf(GeminiOversizeError);
    // The streaming path must NOT have invoked .json() — it discovered
    // oversize during accumulation and threw before parsing.
    expect(jsonSpy).not.toHaveBeenCalled();
    // After the throw, the implementation must release the reader; no
    // additional `pull` calls should happen. (Allow a small slack of 1
    // for the in-flight pull that was already scheduled by the time the
    // cap was hit.)
    await new Promise((r) => setTimeout(r, 0));
    expect(pullCallsAfterCap).toBeLessThanOrEqual(1);
  });

  it('streams body and parses when no Content-Length header is present and size is within cap', async () => {
    // Same shape as the streaming-oversize test, but small body — the
    // streamed parser must accumulate the bytes and JSON-parse them.
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 } }],
          },
        },
      ],
    };
    const bodyText = JSON.stringify(envelope);
    const bodyBytes = new TextEncoder().encode(bodyText);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bodyBytes);
        controller.close();
      },
    });
    const noContentLengthResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      // .json() should NOT be called because the streaming path consumes
      // the body itself. If it's called, this spy will throw.
      json: vi.fn(() => {
        throw new Error('streaming path should not call response.json()');
      }),
      body,
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(noContentLengthResponse);

    const payload = v1_sketchPrompt({ displayName: 'Mango' });
    const result = await callGeminiImage({ payload });
    expect(result).not.toBeNull();
    expect(result!.base64).toBe(FIXTURE_PNG_B64);
  });
});
