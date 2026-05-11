/**
 * F-UI-3.6-A-4 (Task 4.7.6) — vn-smoke runtime fallback wrapper.
 *
 * `callGeminiWithFallback` runs the primary Gemini call. If it THROWS
 * (network error, non-2xx HTTP, AbortError on timeout), the wrapper
 * issues a secondary call with a different model + a VN-tuned prompt.
 * If the secondary also throws, the ORIGINAL primary error is re-thrown
 * so the route's existing catch block produces the I7 envelope.
 *
 * Trigger condition (locked): primary `await callGemini(...)` throws.
 * NOT a low-confidence-based trigger — that would introduce a confidence
 * threshold knob the codebase doesn't currently calibrate.
 *
 * Cost-log integrity: this wrapper does NOT call `logAICall` itself —
 * that's the route's job. It returns `{tokens, costEstimate, usedFallback}`
 * so the route logs ONE row per logical call against the same `client_id`,
 * preserving I2 (one ai_call_log row per logical call) and I11 (replay
 * idempotency keyed by client_id).
 *
 * Token accounting (Codex R1 I1): when both calls reach Gemini, the
 * returned `tokens` (and `costEstimate`) are the SUM of primary +
 * secondary consumption. Primary contribution comes from any
 * `tokens` field decorated onto the thrown Error (or 0 when primary
 * never reached Gemini, e.g. network error / abort).
 *
 * AbortSignal isolation (Codex R1 C1): the wrapper accepts the caller's
 * `abortSignal` (user-initiated cancel) and a separate `primaryAbortSignal`
 * (the route's first-byte / total timeout for the primary call). The
 * secondary call gets a FRESH `AbortController` derived from the caller
 * signal only — so a primary first-byte timeout does NOT abort the
 * secondary. User-initiated cancellation on `abortSignal` still
 * propagates to the secondary, preserving the cancel semantics.
 *
 * Time budget: callers may pass `deadlineMs` (an absolute Date.now() ms
 * cutoff). If primary consumed enough time that `deadlineMs - now() < 1000`,
 * the wrapper SKIPS the secondary and re-throws the primary error
 * immediately. This avoids stranding the user past the route's
 * AbortController timeout when the primary fails late.
 *
 * Configurable secondary model (Codex R1 I3): `getDefaultFallbackModel()`
 * reads `KALORI_AI_FALLBACK_MODEL` (server-only env var) with a default of
 * `'gemini-2.5-flash-lite'`. Both routes import this helper to centralize
 * the value and avoid drift.
 */
import { callGemini, type GeminiCallResult } from './client';
import type { PromptPayload } from './prompts';

const FALLBACK_FLOOR_MS = 1_000;

/** Codex R1 I3 — default secondary model + env var override. */
const DEFAULT_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/**
 * Returns the secondary fallback model identifier. Honors
 * `KALORI_AI_FALLBACK_MODEL` (server-only) when set, defaulting to
 * `gemini-2.5-flash-lite`. Both routes (text-parse + vision) import this
 * to keep the value DRY.
 */
export function getDefaultFallbackModel(): string {
  const fromEnv = process.env.KALORI_AI_FALLBACK_MODEL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_FALLBACK_MODEL;
}

export interface CallGeminiWithFallbackInput {
  /** Primary prompt (system instruction + user content parts). */
  readonly prompt: PromptPayload;
  /** Primary model identifier (e.g. `gemini-flash-latest`). */
  readonly primaryModel?: string;
  /** Secondary model identifier (e.g. `gemini-2.5-flash-lite`). */
  readonly fallbackModel: string;
  /** VN-tuned prompt to use for the secondary call. */
  readonly fallbackPrompt: PromptPayload;
  /**
   * Absolute Date.now()-ms deadline. When primary throws and
   * `deadlineMs - Date.now() < FALLBACK_FLOOR_MS` (1s), the secondary
   * is skipped and the primary error rethrows.
   */
  readonly deadlineMs?: number;
  /**
   * Caller-initiated AbortSignal (e.g. user cancel). Propagates to BOTH
   * primary and secondary calls — when this aborts, the user wants out.
   */
  readonly abortSignal?: AbortSignal;
  /**
   * Primary-call-specific AbortSignal (e.g. first-byte / total timeouts
   * the route uses to bound the PRIMARY call). Does NOT propagate to
   * the secondary — fixes Codex R1 C1 (first-byte abort no longer
   * collapses the secondary's budget).
   */
  readonly primaryAbortSignal?: AbortSignal;
  /**
   * Optional generationConfig override for both calls (mirrors
   * `GeminiCallInput.generationConfig`). Most callers should leave this
   * unset so the client wrapper picks `responseMimeType: application/json`.
   */
  readonly generationConfig?: {
    readonly responseMimeType?: 'application/json';
    readonly maxOutputTokens?: number;
  };
}

export interface CallGeminiWithFallbackResult extends GeminiCallResult {
  readonly usedFallback: boolean;
  readonly primaryError: Error | null;
}

/**
 * Compose a single AbortSignal from up to two upstream signals. Returns
 * undefined when both inputs are undefined so we don't allocate an
 * unused controller. The returned signal aborts on either upstream
 * abort.
 */
function composeAbortSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (b && !a) return b;
  // Both present — merge. Use a fresh controller and wire both signals to abort it.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a?.aborted || b?.aborted) {
    controller.abort();
  } else {
    a?.addEventListener('abort', onAbort, { once: true });
    b?.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

/** Pull tokens off a thrown error if the call layer attached them (I1). */
function extractTokensFromError(err: unknown): number {
  if (err && typeof err === 'object' && 'tokens' in err) {
    const t = (err as { tokens?: unknown }).tokens;
    if (typeof t === 'number' && Number.isFinite(t) && t >= 0) return t;
  }
  return 0;
}

const COST_PER_1K_TOKENS_USD = 0.000375;

export async function callGeminiWithFallback(
  input: CallGeminiWithFallbackInput,
): Promise<CallGeminiWithFallbackResult> {
  // Primary signal merges the caller's abort with the primary-only
  // first-byte / total timeouts. Secondary signal merges ONLY the
  // caller's abort (Codex R1 C1) so a primary timeout doesn't strand
  // the secondary.
  const primarySignal = composeAbortSignals(input.abortSignal, input.primaryAbortSignal);

  const primaryInput = {
    ...input.prompt,
    ...(input.primaryModel ? { model: input.primaryModel } : {}),
    ...(primarySignal ? { abortSignal: primarySignal } : {}),
    ...(input.generationConfig ? { generationConfig: input.generationConfig } : {}),
  };

  let primaryError: Error;
  let primaryTokens = 0;
  try {
    const result = await callGemini(primaryInput);
    return { ...result, usedFallback: false, primaryError: null };
  } catch (err) {
    primaryError = err instanceof Error ? err : new Error(String(err));
    primaryTokens = extractTokensFromError(err);
  }

  // Time-budget gate. If the deadline has passed (or the remaining budget
  // is below the 1s floor) skip the secondary and re-throw the primary
  // error so the route lands on the I7 envelope without further delay.
  if (typeof input.deadlineMs === 'number') {
    const remaining = input.deadlineMs - Date.now();
    if (remaining < FALLBACK_FLOOR_MS) {
      throw primaryError;
    }
  }

  // Codex R1 C1 — secondary gets a FRESH AbortController isolated from
  // the primary's first-byte / total timers. The caller's abort still
  // propagates so user-initiated cancellation cancels the secondary too.
  // A wrapper-internal timer bounds the secondary at the remaining
  // deadline budget (or the input.fallbackFirstByteTimeoutMs override).
  const fallbackController = new AbortController();
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let onCallerAbort: (() => void) | undefined;
  if (input.abortSignal) {
    if (input.abortSignal.aborted) {
      fallbackController.abort();
    } else {
      onCallerAbort = () => fallbackController.abort();
      input.abortSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }
  if (typeof input.deadlineMs === 'number') {
    const remaining = input.deadlineMs - Date.now();
    if (remaining > 0) {
      fallbackTimer = setTimeout(
        () => fallbackController.abort(new Error('fallback total timeout')),
        remaining,
      );
    }
  }

  const fallbackInput = {
    ...input.fallbackPrompt,
    model: input.fallbackModel,
    abortSignal: fallbackController.signal,
    ...(input.generationConfig ? { generationConfig: input.generationConfig } : {}),
  };

  try {
    const result = await callGemini(fallbackInput);
    // Codex R1 I1 — sum primary + secondary token consumption so the
    // route logs total cost in the single ai_call_log row.
    const summedTokens = primaryTokens + result.tokens;
    const summedCostEstimate = (summedTokens / 1000) * COST_PER_1K_TOKENS_USD;
    return {
      raw: result.raw,
      tokens: summedTokens,
      costEstimate: summedCostEstimate,
      usedFallback: true,
      primaryError,
    };
  } catch {
    // Secondary also failed — surface the ORIGINAL primary error so the
    // route's catch block treats this as a single logical failure and
    // returns the I7 envelope with the same diagnostic context as before
    // this wrapper existed.
    throw primaryError;
  } finally {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (onCallerAbort && input.abortSignal) {
      input.abortSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}
