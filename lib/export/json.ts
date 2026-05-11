/**
 * Server-only JSON export builder (Task 5.2).
 *
 * Produces a single JSON object with `schema_version: 'v1'` per design-doc
 * §10.9 + briefing F-EXPORT. All reads use the user-scoped SSR Supabase
 * client so RLS enforces the user-only-exports-own-data invariant (I1) —
 * the admin client is FORBIDDEN here per briefing line 542.
 *
 * Shape:
 *   {
 *     schema_version: 'v1',
 *     exported_at: ISO string (UTC, server-side `new Date().toISOString()`),
 *     user_id: uuid,
 *     profile: { ... },
 *     library: [...],
 *     entries: [...],
 *     logs: { weight: [...], water: [...] },
 *     weekly_reviews: [...],
 *   }
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface JsonExportV1 {
  schema_version: 'v1';
  exported_at: string;
  user_id: string;
  profile: Record<string, unknown> | null;
  library: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
  logs: {
    weight: Array<Record<string, unknown>>;
    water: Array<Record<string, unknown>>;
  };
  weekly_reviews: Array<Record<string, unknown>>;
}

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`profile_read_failed: ${error.message ?? 'unknown'}`);
  return (data ?? null) as Record<string, unknown> | null;
}

/**
 * Codex C1 fix — page reads via `.range(start, end)` so users with more
 * than PostgREST's 1000-row default cap get a complete export. Each page
 * is a 1000-row inclusive window; we loop while the last batch returns a
 * full page (== PAGE_SIZE rows) and short-circuit on the first short page.
 *
 * Defensive `MAX_ITERATIONS` cap mirrors the
 * `deleteStorageObjectsForUser` pattern in `lib/account/delete.ts:113` —
 * a misbehaving server that never returns a short page would otherwise
 * loop forever. 100 iterations × 1000 rows = 100,000 rows ceiling, which
 * comfortably exceeds any single user's expected ledger.
 */
const PAGE_SIZE = 1000;
const MAX_ITERATIONS = 100;

async function fetchAll<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  userIdColumn: string,
  userId: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const from = i * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Codex R1 I1 fix — Postgres does not guarantee row order across pages
    // without an explicit ORDER BY. `.range(...)` plus a non-deterministic
    // plan order produces duplicates and skips for users with >1000 rows.
    // Order by `id` (uuid PK on every table here) before paginating so the
    // window is stable.
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(userIdColumn, userId)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`${table}_read_failed: ${error.message ?? 'unknown'}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

export async function buildJsonExport(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<JsonExportV1> {
  const { supabase, userId } = args;

  // Parallelize independent reads — RLS already scopes them per-user.
  const [profile, library, entries, weight, water, weekly] = await Promise.all([
    fetchProfile(supabase, userId),
    fetchAll(supabase, 'food_library_items', 'user_id', userId),
    fetchAll(supabase, 'food_entries', 'user_id', userId),
    fetchAll(supabase, 'weight_log', 'user_id', userId),
    fetchAll(supabase, 'water_log', 'user_id', userId),
    fetchAll(supabase, 'weekly_reviews', 'user_id', userId),
  ]);

  return {
    schema_version: 'v1',
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile,
    library,
    entries,
    logs: { weight, water },
    weekly_reviews: weekly,
  };
}
