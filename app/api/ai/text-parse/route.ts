/**
 * `POST /api/ai/text-parse` — Gemini text-to-parsed-meal route (Task 3.2).
 *
 * Flow:
 *   1. Zod-validate request body (strict — unknown keys yield 400).
 *   2. Auth + orphan-profile fence via `requireProfileOrJson401` —
 *      401 on missing session, 422 on orphan profile, 503 on transient
 *      profile-lookup error (Phase A Codex Round 1 Improvement #5).
 *   3. Sanitize input (F11 Layer 2).
 *   4. Compute cache key (F8 — includes userId).
 *   5. Cache lookup. On hit: log with cached=true, return cached payload.
 *   6. Build prompt via `v1_foodParse` (F11 Layer 1 — role-separated parts).
 *   7. Call Gemini via `callGeminiWithFallback` (Task 4.7.6 — primary
 *      `gemini-flash-latest` → secondary `getDefaultFallbackModel()` with
 *      VN-tuned prompt) wrapped by 8s/30s AbortController timeouts.
 *   8. Zod-parse the raw response (F11 Layer 3 / I10).
 *   9. Cache.write + logAICall(cached=false) in parallel.
 *  10. Return `{result}`.
 * Any throw in steps 6–8 lands in the catch block: logAICall(cached=false,
 * tokens=0) then return `{fallback: true, originalInput}` with status 200 (I7).
 *
 * `runtime = 'nodejs'` — the Gemini wrapper uses Node crypto for cache key.
 */
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { computeCacheKey, lookup as cacheLookup, write as cacheWrite } from '@/lib/ai/cache';
import { fetchCacheByHash, findPriorCall, logAICall } from '@/lib/ai/cost-log';
import { callGeminiWithFallback, getDefaultFallbackModel } from '@/lib/ai/fallback';
import { normalizeParsedPortions } from '@/lib/ai/portion-sanity';
import { v1_foodParse, v1_foodParseVnFallback } from '@/lib/ai/prompts';
import { ParseResult, type ParseResultT } from '@/lib/ai/schemas';
import { sanitizeStringArray, sanitizeUserText } from '@/lib/ai/sanitize';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';

export const runtime = 'nodejs';

const FIRST_BYTE_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 30_000;
const PRIMARY_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';

// F-UI-3.6-A-2 (Codex Split A round 1) — client_id tightened to z.uuid().
// Routes use (user_id, client_id) to short-circuit replays via
// `findPriorCall`; the UUID shape is required by the new DB partial unique
// index (migration 0005) and by the idempotency contract.
const BodySchema = z
  .object({
    client_id: z.uuid(),
    userText: z.string().min(1).max(4_000),
    region: z.enum(['vn', 'western', 'other']).optional(),
    dietaryPrefs: z.array(z.string().max(64)).max(16).optional(),
    allergens: z.array(z.string().max(64)).max(16).optional(),
  })
  .strict();

function normalizeInput(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function POST(request: Request): Promise<Response> {
  // Parse body BEFORE auth — we need to reject malformed payloads with 400
  // regardless of session state, and the strict schema check itself cannot
  // leak any private data.
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

  // Auth + orphan-profile fence (Phase A Codex Round 1 Improvement #5).
  // Without this fence, an authenticated user with a deleted profile could
  // still consume AI quota and write `ai_call_log` rows while every other
  // aggregate / mutation route returns 422 `profile_lookup_failed`. The
  // helper returns 401 on missing session, 422 on orphan profile, 503 on
  // transient lookup error — all distinct from each other so the client
  // refresh-interceptor's session-expiry pattern only fires on the true 401.
  const fenced = await requireProfileOrJson401({ route: '/api/ai/text-parse' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;

  // Sanitize + cache key.
  const { sanitized } = sanitizeUserText(parsed.data.userText);
  const normalizedInput = normalizeInput(sanitized);
  const inputHash = computeCacheKey({
    callType: 'text-parse',
    userId,
    normalizedInput,
  });

  const start = Date.now();
  try {
    // F-UI-3.6-A-2 — client_id replay short-circuit. If a prior
    // ai_call_log row exists for (user_id, client_id), use its input_hash to
    // fetch the cached payload and return 200 without firing Gemini. A
    // prior log whose cache has since expired falls through to the normal
    // cache/Gemini path (best-effort idempotency — the retry proceeds as
    // a fresh call).
    const prior = await findPriorCall({ userId, clientId: parsed.data.client_id });
    if (prior) {
      const replay = await fetchCacheByHash<ParseResultT>({
        userId,
        inputHash: prior.inputHash,
      });
      if (replay) {
        // Do NOT log a second ai_call_log row — the prior row IS the replay
        // receipt. Returning without a fresh log keeps the I2 (exact-once
        // ai_call_log per logical call) invariant intact.
        return NextResponse.json({ result: normalizeParsedPortions(replay) }, { status: 200 });
      }
    }

    // Cache lookup.
    const hit = await cacheLookup<ParseResultT>({
      callType: 'text-parse',
      userId,
      normalizedInput,
    });
    if (hit.hit && hit.payload) {
      await logAICall({
        userId,
        callType: 'text-parse',
        inputHash,
        tokens: 0,
        costEstimate: 0,
        latencyMs: Date.now() - start,
        cachedFlag: true,
        clientId: parsed.data.client_id,
      });
      return NextResponse.json({ result: normalizeParsedPortions(hit.payload) }, { status: 200 });
    }

    // Gemini call with 8s first-byte + 30s total timeout (AbortController
    // fires at whichever boundary hits first).
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
      // C5 — F11 Layer 2 covers every user-controlled prompt field. `sanitized`
      // already handles userText above; dietaryPrefs + allergens are routed
      // through the same regex + unicode normalization pipeline so an
      // attacker can't smuggle a role token via a preference label.
      const sanitizedDietary = parsed.data.dietaryPrefs
        ? sanitizeStringArray(parsed.data.dietaryPrefs)
        : undefined;
      const sanitizedAllergens = parsed.data.allergens
        ? sanitizeStringArray(parsed.data.allergens)
        : undefined;
      const promptInputs: {
        userText: string;
        region?: 'vn' | 'western' | 'other';
        dietaryPrefs?: readonly string[];
        allergens?: readonly string[];
      } = { userText: sanitized };
      if (parsed.data.region) promptInputs.region = parsed.data.region;
      if (sanitizedDietary) promptInputs.dietaryPrefs = sanitizedDietary;
      if (sanitizedAllergens) promptInputs.allergens = sanitizedAllergens;
      const prompt = v1_foodParse(promptInputs);
      const fallbackPrompt = v1_foodParseVnFallback(promptInputs);
      geminiResult = await callGeminiWithFallback({
        prompt,
        fallbackPrompt,
        primaryModel: PRIMARY_MODEL,
        fallbackModel: getDefaultFallbackModel(),
        // Codex R1 C1 — `primaryAbortSignal` carries the route's
        // first-byte / total timers and aborts the PRIMARY only. The
        // secondary gets a fresh budget; the wrapper would propagate a
        // user-initiated `abortSignal` separately if we passed one here.
        primaryAbortSignal: controller.signal,
        deadlineMs: start + TOTAL_TIMEOUT_MS,
      });
    } finally {
      clearTimeout(firstByteTimer);
      clearTimeout(totalTimer);
    }
    if (geminiResult.usedFallback) {
      // I7 chain — observability breadcrumb, NOT an exception. The
      // successful recovery is by design; capturing as an exception would
      // pollute Sentry with non-error events.
      Sentry.addBreadcrumb({
        category: 'ai.fallback',
        message: 'vn-smoke fallback fired (text-parse)',
        level: 'info',
        data: {
          callType: 'text-parse',
          clientId: parsed.data.client_id,
          primaryError: geminiResult.primaryError?.message ?? 'unknown',
        },
      });
    }

    // Zod-validate output (F11 Layer 3 / I10). A parse failure falls to the
    // catch block and produces a fallback payload.
    const validated = normalizeParsedPortions(ParseResult.parse(geminiResult.raw));

    // Cache write + log.
    await cacheWrite({
      callType: 'text-parse',
      userId,
      normalizedInput,
      parsedPayload: validated,
    });
    await logAICall({
      userId,
      callType: 'text-parse',
      inputHash,
      tokens: geminiResult.tokens,
      costEstimate: geminiResult.costEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });

    return NextResponse.json({ result: validated }, { status: 200 });
  } catch (err) {
    // I7 graceful degradation: log to Sentry, write one ai_call_log row,
    // return the fallback envelope (status 200 so the client can open
    // manual-entry synchronously).
    Sentry.captureException(err, { tags: { component: 'ai-text-parse' } });
    await logAICall({
      userId,
      callType: 'text-parse',
      inputHash,
      tokens: 0,
      costEstimate: 0,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });
    return NextResponse.json(
      { fallback: true, originalInput: parsed.data.userText },
      { status: 200 },
    );
  }
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
