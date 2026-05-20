/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callGemini } from '@/lib/ai/client';

describe('callGemini', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-secret-api-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it('throws compact sanitized provider details for Gemini non-2xx responses', async () => {
    const fakePhotoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'.repeat(12);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 400,
                status: 'INVALID_ARGUMENT',
                message: `Invalid JSON payload received. Unknown name "maxLength". api key test-secret-api-key photo ${fakePhotoBase64}`,
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    let thrown: (Error & { status?: number; providerMessage?: string }) | null = null;
    try {
      await callGemini({
        systemInstruction: { parts: [{ text: 'Extract food.' }] },
        contents: [{ role: 'user', parts: [{ text: 'photo of food' }] }],
      });
    } catch (err) {
      thrown = err as Error & { status?: number; providerMessage?: string };
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.status).toBe(400);
    expect(thrown?.providerMessage).toContain('Invalid JSON payload received');
    expect(thrown?.providerMessage).toContain('INVALID_ARGUMENT');
    expect(thrown?.message).toContain('Gemini call failed: HTTP 400');
    expect(thrown?.message).toContain('Invalid JSON payload received');
    expect(thrown?.message).not.toContain('test-secret-api-key');
    expect(thrown?.message).not.toContain(fakePhotoBase64);
    expect(thrown?.providerMessage).not.toContain('test-secret-api-key');
    expect(thrown?.providerMessage).not.toContain(fakePhotoBase64);
    expect((thrown?.providerMessage ?? '').length).toBeLessThanOrEqual(600);
  });
});
