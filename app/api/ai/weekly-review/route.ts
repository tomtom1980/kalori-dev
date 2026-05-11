/**
 * `POST /api/ai/weekly-review` — Gemini weekly-review route (Task 3.2).
 *
 * Contract (architecture.md §6 row 3, §2.9; PRD.md:376-380):
 *   - Input: `{client_id, week_start_on: YYYY-MM-DD (Monday)}`
 *   - Output: `{body_markdown, sparse_data}` — NOT wrapped in `{result:...}`
 *   - Persistence: writes one row to `weekly_reviews` via upsert keyed on
 *     `(user_id, week_start_on)` with `insights = {body_markdown, sparse_data}`
 *   - Cache tag: `TAGS.weeklyReview(userId, weekStartOn)` on success
 *
 * Flow differs from text-parse/vision because of the sparse-data short
 * circuit: if the user has <3 distinct logged days in the past 7, return
 * a static template WITH NO Gemini call (tokens=0, cached=true). C2-R2
 * contract: `weekly_reviews` is persisted on EVERY review-returning path
 * (sparse fallback, cache hit, full Gemini) — architecture.md:354 note
 * "sparse-data fallback stores a stub `insights` payload with
 * `sparse_data: true` so downstream reads render the template without
 * round-tripping to Gemini". The upsert is idempotent on
 * `(user_id, week_start_on)` so re-runs within the week refresh the row
 * (F4 freshness) regardless of which branch produced the payload.
 *
 * I2 discipline: `logAICall()` fires EXACTLY ONCE per logical call. A local
 * `logged` flag gates the catch branch so failures anywhere after the
 * happy-path log don't double-insert. I1 discipline: invalid `week_start_on`
 * (bad shape, invalid date, non-Monday) returns 400 — NOT 500.
 *
 * `runtime = 'nodejs'` — Gemini + Node crypto.
 */
import * as Sentry from '@sentry/nextjs';
import { updateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { callGemini } from '@/lib/ai/client';
import { computeCacheKey, lookup as cacheLookup, write as cacheWrite } from '@/lib/ai/cache';
import { fetchCacheByHash, findPriorCall, logAICall } from '@/lib/ai/cost-log';
import { v1_weeklyReview, type WeeklyReviewDailyTotals } from '@/lib/ai/prompts';
import { sanitizeStringArray } from '@/lib/ai/sanitize';
import { WeeklyReviewResult, type WeeklyReviewResultT } from '@/lib/ai/schemas';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const FIRST_BYTE_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 30_000;
const SPARSE_THRESHOLD_DAYS = 3;
const MAX_HIGHLIGHTS_PER_DAY = 3;

/**
 * I1 — strict request validation. Shape regex + parseable date + Monday
 * refinement. Any malformed date returns 400 via the normal safeParse
 * branch, never 500.
 *
 * F-UI-3.6-A-5 (Codex Split A round 1) — reject future Mondays. A caller
 * cannot request a review for a week that hasn't happened yet. We compare
 * `week_start_on` against the current week's Monday (server UTC) rather
 * than `today`, so the user can request this week's review mid-week.
 */
function currentWeekMondayUtc(): string {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun, 1=Mon
  const delta = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() - delta);
  return mon.toISOString().slice(0, 10);
}

const BodySchema = z
  .object({
    // F-UI-3.6-A-2 (Codex Split A round 1) — client_id tightened to z.uuid().
    client_id: z.uuid(),
    week_start_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'week_start_on must be YYYY-MM-DD')
      .refine((s) => {
        const ms = Date.parse(`${s}T00:00:00.000Z`);
        if (!Number.isFinite(ms)) return false;
        // Reject Feb 30 / Apr 31 etc. — Date.parse accepts these but the
        // round-trip through toISOString shifts them; reject shift.
        const iso = new Date(ms).toISOString().slice(0, 10);
        return iso === s;
      }, 'week_start_on must be a real calendar date')
      .refine(
        (s) => new Date(`${s}T00:00:00.000Z`).getUTCDay() === 1,
        'week_start_on must be a Monday',
      )
      .refine((s) => s <= currentWeekMondayUtc(), 'week_start_on must not be in the future'),
  })
  .strict();

const SPARSE_TEMPLATE: WeeklyReviewResultT = {
  body_markdown:
    'Too little logged this week for a full review. Return after three days of entries and the ledger will have a story to tell.',
  sparse_data: true,
};

/**
 * Food_entries.items is a jsonb array of parsed items shaped like
 * ParsedItemT (design-doc §7 / architecture.md §2.3). We sum kcal + macros
 * defensively: missing keys count as zero, malformed rows are skipped.
 */
interface FoodEntryRow {
  readonly logged_at: string;
  readonly items?: unknown;
}

interface ItemLike {
  readonly name?: unknown;
  readonly kcal?: unknown;
  readonly macros?: {
    readonly protein_g?: unknown;
    readonly carbs_g?: unknown;
    readonly fat_g?: unknown;
    readonly fiber_g?: unknown;
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function aggregateByDay(rows: readonly FoodEntryRow[]): WeeklyReviewDailyTotals[] {
  const byDay = new Map<
    string,
    {
      totals: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
      entryCount: number;
      highlights: string[];
    }
  >();
  for (const row of rows) {
    if (typeof row.logged_at !== 'string') continue;
    const day = row.logged_at.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) continue;
    const bucket = byDay.get(day) ?? {
      totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
      entryCount: 0,
      highlights: [] as string[],
    };
    bucket.entryCount += 1;
    const items = Array.isArray(row.items) ? (row.items as ItemLike[]) : [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      bucket.totals.kcal += num(item.kcal);
      bucket.totals.protein_g += num(item.macros?.protein_g);
      bucket.totals.carbs_g += num(item.macros?.carbs_g);
      bucket.totals.fat_g += num(item.macros?.fat_g);
      bucket.totals.fiber_g += num(item.macros?.fiber_g);
      const name = str(item.name);
      if (name && bucket.highlights.length < MAX_HIGHLIGHTS_PER_DAY) {
        bucket.highlights.push(name);
      }
    }
    byDay.set(day, bucket);
  }
  // Round totals to 1 decimal — Gemini doesn't need sub-decimal precision
  // and the prompt-surface text stays tidy.
  const round = (n: number): number => Math.round(n * 10) / 10;
  // F-UI-3.6-A-3 (Codex Split A round 1, F11 prompt injection) — highlights
  // come from `food_entries.items[].name`, which is user-controlled at save
  // time. Route them through the F11 Layer 2 sanitizer before returning so
  // the outbound Gemini prompt cannot be injected via stored food names.
  // `sanitizeStringArray` drops elements that sanitize to empty, keeping
  // the invariant that every returned highlight is a harmless label.
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      totals: {
        kcal: round(v.totals.kcal),
        protein_g: round(v.totals.protein_g),
        carbs_g: round(v.totals.carbs_g),
        fat_g: round(v.totals.fat_g),
        fiber_g: round(v.totals.fiber_g),
      },
      entryCount: v.entryCount,
      highlights: sanitizeStringArray(v.highlights),
    }));
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
  const fenced = await requireProfileOrJson401({ route: '/api/ai/weekly-review' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex Round 2 NEW-C3-gap — `profiles.deleting_at` mutation fence.
  // weekly-review upserts into `weekly_reviews` (user-owned table) so it
  // MUST be fenced like every other mutation route. R1 enumeration of "12
  // mutation routes" missed this one. Codex Round 2 NEW-I1 fail-closed
  // applies — fence read errors return HTTP 503.
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const weekStartOn = parsed.data.week_start_on;
  const clientId = parsed.data.client_id;

  // Pull the past 7 days of food_entries for the aggregator. The range is
  // [weekStartOn, weekStartOn+7). Select `items` jsonb + `logged_at` so
  // the aggregator can compute real daily totals + highlights (C3 fix).
  const weekStartIso = new Date(`${weekStartOn}T00:00:00.000Z`).toISOString();
  const weekEndIso = new Date(
    new Date(`${weekStartOn}T00:00:00.000Z`).getTime() + 7 * 24 * 3600 * 1000,
  ).toISOString();

  const { data: entriesData } = await supabase
    .from('food_entries')
    .select('logged_at, items')
    .eq('user_id', userId)
    .gte('logged_at', weekStartIso)
    .lt('logged_at', weekEndIso);

  const rows = (entriesData ?? []) as FoodEntryRow[];
  const dailyTotals = aggregateByDay(rows);
  const distinctDays = dailyTotals.length;

  const inputHash = computeCacheKey({
    callType: 'weekly-review',
    userId,
    normalizedInput: weekStartOn,
  });
  const start = Date.now();

  // I2 — exactly one log row per logical call. The flag gates every exit
  // path so a failure in updateTag() / cache.write() / weekly_reviews upsert
  // after the happy-path log cannot trigger a second log in the catch.
  //
  // F-UI-3.6-A-2 — client_id is recorded on every log write so the next
  // replay with the same (user_id, client_id) can short-circuit.
  let logged = false;
  async function logOnce(input: {
    tokens: number;
    costEstimate: number;
    cachedFlag: boolean;
  }): Promise<void> {
    if (logged) return;
    logged = true;
    await logAICall({
      userId,
      callType: 'weekly-review',
      inputHash,
      tokens: input.tokens,
      costEstimate: input.costEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: input.cachedFlag,
      clientId,
    });
  }

  /**
   * C2-R2 — weekly_reviews persistence is a single callsite invoked on
   * every review-returning path (sparse, cache-hit, Gemini). Upsert is
   * idempotent on (user_id, week_start_on); re-running within the week
   * refreshes the row (F4 freshness) without branch-specific drift.
   *
   * F-UI-3.6-A-1 (Codex Split A round 1, I1 RLS) — writes now go through
   * the AUTHENTICATED server client so the `weekly_reviews_insert_own` +
   * `weekly_reviews_update_own` RLS policies (supabase/migrations/0003_food_
   * schema.sql:244-274) enforce `auth.uid() = user_id` at the DB. The
   * earlier admin-client path bypassed RLS entirely — if `userId` were ever
   * miscomputed (e.g. a future refactor), cross-tenant writes would have
   * succeeded. With the auth client, a mismatch surfaces as a 42501 / RLS
   * denial at the DB, upheld by the same policies the E2E RLS suite tests.
   *
   * `ai_call_log` and `ai_response_cache` remain service-role-only by design
   * (they have no user-facing RLS policies) — those writes keep their admin
   * clients via `logAICall()` and `cacheWrite()`.
   */
  async function persistWeeklyReview(payload: WeeklyReviewResultT): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabase.from('weekly_reviews').upsert(
      {
        user_id: userId,
        week_start_on: weekStartOn,
        insights: payload,
        expires_at: expiresAt,
      },
      { onConflict: 'user_id,week_start_on' },
    );
  }

  // F-UI-3.6-A-2 — client_id replay short-circuit. If a prior
  // ai_call_log row exists for (user_id, client_id), use its input_hash to
  // fetch the cached payload from ai_response_cache and return it. No
  // second log row is written — the prior row IS the replay receipt (I2
  // exact-once). The weekly_reviews upsert still fires via persistWeeklyReview
  // so the dashboard island stays fresh; the upsert is idempotent on
  // (user_id, week_start_on).
  const prior = await findPriorCall({ userId, clientId });
  if (prior) {
    const replay = await fetchCacheByHash<WeeklyReviewResultT>({
      userId,
      inputHash: prior.inputHash,
    });
    if (replay) {
      await persistWeeklyReview(replay);
      return NextResponse.json(replay satisfies WeeklyReviewResultT, { status: 200 });
    }
  }

  // Sparse-data short-circuit — no Gemini call, static template, log
  // cached=true/tokens=0. C2-R2: sparse path MUST still persist a
  // weekly_reviews row so downstream reads (Task 4.3a dashboard island)
  // render from the DB row without round-tripping to this route
  // (architecture.md:354 note).
  if (distinctDays < SPARSE_THRESHOLD_DAYS) {
    await persistWeeklyReview(SPARSE_TEMPLATE);
    await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: true });
    return NextResponse.json(SPARSE_TEMPLATE satisfies WeeklyReviewResultT, { status: 200 });
  }

  try {
    const hit = await cacheLookup<WeeklyReviewResultT>({
      callType: 'weekly-review',
      userId,
      normalizedInput: weekStartOn,
    });
    if (hit.hit && hit.payload) {
      // C2-R2: cache-hit path also persists weekly_reviews. Idempotent on
      // the unique index so a re-run with the same payload is a no-op at
      // the DB level but keeps the row's expires_at fresh.
      await persistWeeklyReview(hit.payload);
      await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: true });
      return NextResponse.json(hit.payload satisfies WeeklyReviewResultT, { status: 200 });
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
      const prompt = v1_weeklyReview({
        weekStartOn,
        recentEntries: dailyTotals,
      });
      geminiResult = await callGemini({
        ...prompt,
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(firstByteTimer);
      clearTimeout(totalTimer);
    }

    const validated = WeeklyReviewResult.parse(geminiResult.raw);

    // Happy path — persist the Gemini-generated review.
    await persistWeeklyReview(validated);

    await cacheWrite({
      callType: 'weekly-review',
      userId,
      normalizedInput: weekStartOn,
      parsedPayload: validated,
    });
    await logOnce({
      tokens: geminiResult.tokens,
      costEstimate: geminiResult.costEstimate,
      cachedFlag: false,
    });
    // I12 — cache-tag write via typed factory (no inline literals).
    updateTag(TAGS.weeklyReview(userId, weekStartOn));

    return NextResponse.json(validated satisfies WeeklyReviewResultT, { status: 200 });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-weekly-review' } });
    // I2 — only log if the happy-path branch hasn't already. Avoids the
    // double-charge when updateTag / cache.write / upsert throws after
    // Gemini success + log already landed.
    await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: false });
    return NextResponse.json({ fallback: true, originalInput: weekStartOn }, { status: 200 });
  }
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
