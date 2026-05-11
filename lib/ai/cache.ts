/**
 * Gemini response cache (Task 3.2).
 *
 * Owns:
 *   - `computeCacheKey` — SHA-256 of `{callType, userId, normalizedInput}`
 *     (F8 CRITICAL — userId in the key prevents cross-user cache poisoning)
 *   - `lookup` — service-role SELECT on `ai_response_cache` by PK
 *   - `write` — service-role INSERT with `expires_at = created_at + 30d`
 *
 * The input_hash PK in `ai_response_cache` IS the F8 composite key; the
 * schema also carries a standalone `user_id` column for forward-compat.
 * Tenant isolation relies on (a) userId being part of the hash input AND
 * (b) the `.eq('user_id', userId)` filter we apply on lookup.
 */
import { createHash } from 'node:crypto';

// Task 3.2 approved use site (briefing §Architecture): the `ai_response_cache`
// table has no RLS (service-role only), so cache reads/writes here MUST use
// the admin client. This file is SERVER-ONLY and never ends up in the client
// bundle — the `no-gemini-leak` rule + Route Handler boundary keep it so.
// eslint-disable-next-line kalori/no-admin-in-app
import { getAdminSupabase } from '@/lib/supabase/admin';

export type CacheCallType = 'text-parse' | 'vision' | 'weekly-review';

export interface CacheKeyInput {
  readonly callType: CacheCallType;
  readonly userId: string;
  readonly normalizedInput: string;
}

export interface CacheLookupResult<T> {
  readonly hit: boolean;
  readonly payload: T | null;
}

export interface CacheWriteInput<T> {
  readonly callType: CacheCallType;
  readonly userId: string;
  readonly normalizedInput: string;
  readonly parsedPayload: T;
  readonly ttlDays?: number;
}

const DEFAULT_TTL_DAYS = 30;

/**
 * Deterministic SHA-256 over `{callType}:{userId}:{normalizedInput}`. The
 * separators prevent collisions between e.g. `('text-parse','a','b')` and
 * `('text','parsea','b')` since `:` is explicitly disallowed inside userId
 * by Supabase UUID shape.
 *
 * Throws if userId is empty — defence-in-depth. The service-role table has
 * no RLS; this guard ensures a missing userId can never silently produce a
 * key that collides across users.
 */
export function computeCacheKey(input: CacheKeyInput): string {
  if (!input.userId || input.userId.trim().length === 0) {
    throw new Error('computeCacheKey: userId is required (F8 defence-in-depth)');
  }
  const material = `${input.callType}:${input.userId}:${input.normalizedInput}`;
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Look up a cached entry by `{callType, userId, normalizedInput}`. Returns
 * `hit: false, payload: null` for misses (row not found OR row expired).
 * Expired rows do NOT count as hits — the route will overwrite them on
 * the subsequent write.
 */
export async function lookup<T>(input: CacheKeyInput): Promise<CacheLookupResult<T>> {
  const key = computeCacheKey(input);
  const admin = getAdminSupabase();
  // I3 — SQL filters on BOTH `input_hash` AND `user_id`. The PK already
  // encodes userId (SHA-256 composite) but the explicit `.eq('user_id', ...)`
  // is defence-in-depth: if a row ever lands under the wrong user (e.g. a
  // future migration bug), the filter still rejects it. Architecture.md §8
  // requires both filters.
  const { data, error } = await admin
    .from('ai_response_cache')
    .select('parsed_payload, expires_at, user_id')
    .eq('user_id', input.userId)
    .eq('input_hash', key)
    .single();

  if (error || !data) {
    return { hit: false, payload: null };
  }

  const row = data as {
    parsed_payload: T;
    expires_at?: string;
    user_id?: string;
  };

  // Defense-in-depth: if the row carries an explicit user_id column, reject
  // mismatches. The PK already embeds userId via SHA-256, so this second
  // rail is defence-only — a missing column is tolerated (forward-compat).
  if (row.user_id !== undefined && row.user_id !== input.userId) {
    return { hit: false, payload: null };
  }

  // TTL check: expired rows are treated as misses. Missing expires_at is
  // tolerated (defence — the real schema has it NOT NULL).
  if (row.expires_at !== undefined) {
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return { hit: false, payload: null };
    }
  }

  return { hit: true, payload: row.parsed_payload };
}

/**
 * Write a fresh cache row. `expires_at = now + ttlDays * 24h`. Upsert on
 * `input_hash` (the PK) so two concurrent identical requests from the same
 * user don't blow up — the second write is idempotent. C4 fix: previously
 * `.insert()` threw on PK conflict and pushed the successful Gemini call
 * into the error fallback path, double-charging the cost log.
 */
export async function write<T>(input: CacheWriteInput<T>): Promise<void> {
  const key = computeCacheKey({
    callType: input.callType,
    userId: input.userId,
    normalizedInput: input.normalizedInput,
  });
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const admin = getAdminSupabase();
  await admin.from('ai_response_cache').upsert(
    {
      input_hash: key,
      call_type: input.callType,
      user_id: input.userId,
      parsed_payload: input.parsedPayload,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'input_hash', ignoreDuplicates: false },
  );
}
