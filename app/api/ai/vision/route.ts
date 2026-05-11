/**
 * `POST /api/ai/vision` — Gemini vision-to-parsed-meal route (Task 3.2).
 *
 * Mirrors /api/ai/text-parse pipeline with an image_base64 input (<500kb).
 * Cache key hashes the image bytes (via sha256 over normalized base64)
 * alongside userId + callType. Photo original is discarded in-memory after
 * the Gemini call; thumbnail persistence lives in Task 3.3's companion
 * route (I4 enforced there).
 *
 * `runtime = 'nodejs'` — Gemini REST + Node crypto.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { computeCacheKey, lookup as cacheLookup, write as cacheWrite } from '@/lib/ai/cache';
import { fetchCacheByHash, findPriorCall, logAICall } from '@/lib/ai/cost-log';
import { callGeminiWithFallback, getDefaultFallbackModel } from '@/lib/ai/fallback';
import { normalizeParsedPortions } from '@/lib/ai/portion-sanity';
import { v1_visionFoodParse, v1_visionFoodParseVnFallback } from '@/lib/ai/prompts';
import { ParseResult, type ParseResultT } from '@/lib/ai/schemas';
import { sanitizeUserText, sanitizeStringArray } from '@/lib/ai/sanitize';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';

export const runtime = 'nodejs';

const FIRST_BYTE_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 30_000;
const MAX_BASE64_BYTES = 500 * 1024; // 500kb decoded — per F7 spec.
const PRIMARY_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';

// F-UI-3.6-A-2 (Codex Split A round 1) — client_id tightened to z.uuid().
const BodySchema = z
  .object({
    client_id: z.uuid(),
    imageBase64: z.string().min(8),
    mimeType: z
      .string()
      .regex(/^image\/(jpeg|png|webp|heic|heif)$/u)
      .optional(),
    userText: z.string().max(1_000).optional(),
    region: z.enum(['vn', 'western', 'other']).optional(),
    dietaryPrefs: z.array(z.string().max(64)).max(16).optional(),
    allergens: z.array(z.string().max(64)).max(16).optional(),
  })
  .strict();

/**
 * Decoded-byte size of a base64 string. Uses `Buffer.byteLength(s, 'base64')`
 * which returns the EXACT decoded length — accounts for `=` padding (each
 * `=` consumes 6 bits but encodes 0 bytes) without allocating the decoded
 * buffer. F-AI-1 fix: replaces the legacy `Math.floor(s.length * 0.75)`
 * heuristic, which over-counted padded payloads by 1–2 bytes and produced
 * a false-positive 413 right at the boundary.
 */
function base64DecodedSize(s: string): number {
  return Buffer.byteLength(s, 'base64');
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

  // Size gate — cheap rejection BEFORE auth so oversized payloads don't
  // waste an auth-roundtrip.
  if (base64DecodedSize(parsed.data.imageBase64) > MAX_BASE64_BYTES) {
    return NextResponse.json(
      { error: 'payload_too_large', limit_bytes: MAX_BASE64_BYTES },
      { status: 413 },
    );
  }

  // Auth + orphan-profile fence (Phase A Codex Round 1 Improvement #5).
  // See /api/ai/text-parse for the full rationale; identical contract here.
  const fenced = await requireProfileOrJson401({ route: '/api/ai/vision' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;

  // Cache key over image bytes — the normalized input for vision is the
  // raw base64 string (already normalized by client-side compression).
  const normalizedInput = parsed.data.imageBase64;
  const inputHash = computeCacheKey({
    callType: 'vision',
    userId,
    normalizedInput,
  });

  const start = Date.now();
  try {
    // F-UI-3.6-A-2 — client_id replay short-circuit (same contract as
    // text-parse). See that route for the full rationale.
    const prior = await findPriorCall({ userId, clientId: parsed.data.client_id });
    if (prior) {
      const replay = await fetchCacheByHash<ParseResultT>({
        userId,
        inputHash: prior.inputHash,
      });
      if (replay) {
        return NextResponse.json({ result: normalizeParsedPortions(replay) }, { status: 200 });
      }
    }

    const hit = await cacheLookup<ParseResultT>({
      callType: 'vision',
      userId,
      normalizedInput,
    });
    if (hit.hit && hit.payload) {
      await logAICall({
        userId,
        callType: 'vision',
        inputHash,
        tokens: 0,
        costEstimate: 0,
        latencyMs: Date.now() - start,
        cachedFlag: true,
        clientId: parsed.data.client_id,
      });
      return NextResponse.json({ result: normalizeParsedPortions(hit.payload) }, { status: 200 });
    }

    const controller = new AbortController();
    const firstByteTimer = setTimeout(
      () => controller.abort(new Error('first-byte timeout')),
      FIRST_BYTE_TIMEOUT_MS,
    );
    const totalTimer = setTimeout(
      () => controller.abort(new Error('total timeout')),
      TOTAL_TIMEOUT_MS,
    );
    let geminiResult;
    try {
      // C5 — F11 Layer 2 applied to EVERY user-controlled string field, not
      // just `userText`. Sanitize caption, dietaryPrefs, allergens before they
      // reach the prompt. Base64 image data itself is binary and skipped.
      const { sanitized: sanitizedCaption } = sanitizeUserText(parsed.data.userText ?? '');
      const sanitizedDietary = parsed.data.dietaryPrefs
        ? sanitizeStringArray(parsed.data.dietaryPrefs)
        : undefined;
      const sanitizedAllergens = parsed.data.allergens
        ? sanitizeStringArray(parsed.data.allergens)
        : undefined;
      const promptInputs: {
        userText: string;
        imageBase64: string;
        mimeType?: string;
        region?: 'vn' | 'western' | 'other';
        dietaryPrefs?: readonly string[];
        allergens?: readonly string[];
      } = {
        userText: sanitizedCaption,
        imageBase64: parsed.data.imageBase64,
      };
      if (parsed.data.mimeType) promptInputs.mimeType = parsed.data.mimeType;
      if (parsed.data.region) promptInputs.region = parsed.data.region;
      if (sanitizedDietary) promptInputs.dietaryPrefs = sanitizedDietary;
      if (sanitizedAllergens) promptInputs.allergens = sanitizedAllergens;
      const prompt = v1_visionFoodParse(promptInputs);
      const fallbackPrompt = v1_visionFoodParseVnFallback(promptInputs);
      geminiResult = await callGeminiWithFallback({
        prompt,
        fallbackPrompt,
        primaryModel: PRIMARY_MODEL,
        fallbackModel: getDefaultFallbackModel(),
        // Codex R1 C1 — see text-parse route for rationale.
        primaryAbortSignal: controller.signal,
        deadlineMs: start + TOTAL_TIMEOUT_MS,
      });
    } finally {
      clearTimeout(firstByteTimer);
      clearTimeout(totalTimer);
    }
    if (geminiResult.usedFallback) {
      Sentry.addBreadcrumb({
        category: 'ai.fallback',
        message: 'vn-smoke fallback fired (vision)',
        level: 'info',
        data: {
          callType: 'vision',
          clientId: parsed.data.client_id,
          primaryError: geminiResult.primaryError?.message ?? 'unknown',
        },
      });
    }

    const validated = normalizeParsedPortions(ParseResult.parse(geminiResult.raw));

    await cacheWrite({
      callType: 'vision',
      userId,
      normalizedInput,
      parsedPayload: validated,
    });
    await logAICall({
      userId,
      callType: 'vision',
      inputHash,
      tokens: geminiResult.tokens,
      costEstimate: geminiResult.costEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });

    return NextResponse.json({ result: validated }, { status: 200 });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-vision' } });
    await logAICall({
      userId,
      callType: 'vision',
      inputHash,
      tokens: 0,
      costEstimate: 0,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });
    return NextResponse.json({ fallback: true, originalInput: '<image>' }, { status: 200 });
  }
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
