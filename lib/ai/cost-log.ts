/**
 * Gemini cost logger (Task 3.2 I2).
 *
 * `logAICall` writes ONE row to `ai_call_log` per logical Gemini call via
 * the service-role admin client. Failure-tolerant synchronous: if the
 * insert itself fails, we capture to Sentry and return normally — the
 * caller still emits the user-facing response (I7).
 *
 * Every AI request (cache hit, miss, or error) MUST call this function
 * EXACTLY ONCE before responding. The route-handler integration tests
 * assert `insert` call count = 1 per logical call.
 */
import * as Sentry from '@sentry/nextjs';

// Task 3.2 approved use site (briefing §Architecture): the `ai_call_log`
// table has no RLS (service-role only), so cost-log writes here MUST use
// the admin client. Server-only; never reaches the client bundle.
// eslint-disable-next-line kalori/no-admin-in-app
import { getAdminSupabase } from '@/lib/supabase/admin';

export type AICallType =
  | 'text-parse'
  | 'vision'
  | 'weekly-review'
  | 'image-analysis-sketch'
  | 'nutrition-summary'
  | 'library-recipe';

export interface AICallLogInput {
  readonly userId: string;
  readonly callType: AICallType;
  readonly inputHash: string;
  readonly tokens: number;
  readonly costEstimate: number;
  readonly latencyMs: number;
  readonly cachedFlag: boolean;
  /**
   * F-UI-3.6-A-2 (Codex Split A round 1) — UUIDv4 client-provided idempotency
   * key. Route handlers use `(user_id, client_id)` to short-circuit replays
   * before calling Gemini. Insert surfaces `23505 unique_violation` on the
   * partial unique index (`ai_call_log_user_client_unique_idx`, migration
   * 0005) if a replay makes it past the route-level check; the caller
   * treats 23505 as a benign replay. Omitted on internal callers that do
   * not own a client_id (none today; future non-client-driven logs).
   */
  readonly clientId?: string;
}

export async function logAICall(input: AICallLogInput): Promise<void> {
  try {
    const admin = getAdminSupabase();
    const row: Record<string, unknown> = {
      user_id: input.userId,
      call_type: input.callType,
      input_hash: input.inputHash,
      tokens: input.tokens,
      cost_estimate: input.costEstimate,
      latency_ms: input.latencyMs,
      cached_flag: input.cachedFlag,
    };
    if (input.clientId) row.client_id = input.clientId;
    const { error } = await admin.from('ai_call_log').insert(row);
    if (error) {
      // 23505 unique_violation on (user_id, client_id) is an expected race
      // condition (client retried before the first-call log landed). The
      // route-level replay check guarantees the user still gets a valid
      // response — we just swallow the DB-level duplicate here.
      if (error.code === '23505') return;
      Sentry.captureException(
        new Error(`ai_call_log insert failed: ${error.message ?? error.code ?? 'unknown'}`),
        { tags: { component: 'ai-cost-log' } },
      );
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-cost-log' } });
  }
}

/**
 * F-UI-3.6-A-2 — look up a prior `ai_call_log` row by
 * `(user_id, client_id)`. When a row exists, the route treats the incoming
 * request as an idempotent replay and returns the cached payload
 * (`ai_response_cache`) keyed by the prior `input_hash` without calling
 * Gemini again. Returns `null` on miss or DB error (best-effort — the
 * route falls through to the cache-miss/Gemini path).
 */
export async function findPriorCall(input: {
  readonly userId: string;
  readonly clientId: string;
}): Promise<{ inputHash: string; callType: AICallType } | null> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('ai_call_log')
      .select('input_hash, call_type')
      .eq('user_id', input.userId)
      .eq('client_id', input.clientId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { input_hash?: string; call_type?: string };
    if (!row.input_hash || !row.call_type) return null;
    return {
      inputHash: row.input_hash,
      callType: row.call_type as AICallType,
    };
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-cost-log' } });
    return null;
  }
}

/**
 * F-UI-3.6-A-2 — fetch cached parsed payload by `input_hash` (route-level
 * replay helper). The normal cache path uses `computeCacheKey` to derive
 * the hash from input material; this helper bypasses that step because the
 * replay path already has the prior hash from `findPriorCall`. TTL check
 * mirrors `lib/ai/cache.ts#lookup` — expired rows return null.
 */
export async function fetchCacheByHash<T>(input: {
  readonly userId: string;
  readonly inputHash: string;
}): Promise<T | null> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('ai_response_cache')
      .select('parsed_payload, expires_at, user_id')
      .eq('user_id', input.userId)
      .eq('input_hash', input.inputHash)
      .single();
    if (error || !data) return null;
    const row = data as { parsed_payload?: T; expires_at?: string; user_id?: string };
    if (row.user_id !== undefined && row.user_id !== input.userId) return null;
    if (row.expires_at !== undefined) {
      const ms = new Date(row.expires_at).getTime();
      if (Number.isFinite(ms) && ms <= Date.now()) return null;
    }
    return (row.parsed_payload as T) ?? null;
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-cost-log' } });
    return null;
  }
}
