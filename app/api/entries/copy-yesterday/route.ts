/**
 * `POST /api/entries/copy-yesterday` — Task 3.4, batched entry copy.
 *
 * Contract (synthesis §5.4):
 *   - Body: `{ ids: UUID[] (1..20), new_client_ids: UUID[] (length === ids.length) }`.
 *     Client-generated `new_client_ids` keep retry semantics I11-compatible
 *     (same payload bytes → no duplicates).
 *   - Auth required; RLS scopes source SELECT to user's entries.
 *   - Inserts N new rows with new client_ids, logged_at = now() in UTC,
 *     preserved meal_category + items + ai_reasoning.
 *   - `revalidateTag(TAGS.userEntries(uid, target_day))` fires once, where
 *     target_day is resolved from the caller's profile.timezone on the
 *     server (F-UI-3.6-B-5: the `target_date` parameter was removed so the
 *     inserted `logged_at` and the invalidated tag always describe the same
 *     day).
 *   - 23505 on any new client_id → re-SELECT committed rows → replayed.
 *   - Empty source result → 400 (either ids belong to other user via RLS, or
 *     they simply don't exist).
 */
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { revalidateAllProgressRanges } from '@/lib/cache/revalidate-progress';
import { TAGS } from '@/lib/cache/tags';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzToday } from '@/lib/time/day';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(20),
    new_client_ids: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict()
  .refine((v) => v.ids.length === v.new_client_ids.length, {
    message: 'ids and new_client_ids must have equal length',
  });

type SourceEntry = {
  id: string;
  meal_category: string;
  source: string;
  items: unknown;
  ai_reasoning: string | null;
  library_item_id: string | null;
};

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
  const fenced = await requireProfileOrJson401({ route: '/api/entries/copy-yesterday' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  // Codex R1 C3 — `profiles.deleting_at` mutation fence (HTTP 423 Locked).
  // Codex Round 2 NEW-I1 — fence read errors fail closed (HTTP 503).
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { ids, new_client_ids } = parsed.data;

  // Resolve target_day from user-TZ today. F-UI-3.6-B-5: `target_date` param
  // was removed from the contract — rows insert with `now()` in UTC, so the
  // cache tag MUST describe user-TZ today (no more client-controlled skew).
  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: string } | null };
  const targetDay = userTzToday(profile?.timezone ?? 'UTC');

  // Source SELECT (RLS-scoped).
  const { data: sourceRows, error: srcErr } = (await supabase
    .from('food_entries')
    .select('id, meal_category, source, items, ai_reasoning, library_item_id')
    .eq('user_id', userId)
    .in('id', ids)
    .order('logged_at', { ascending: true })) as {
    data: SourceEntry[] | null;
    error: { message?: string } | null;
  };

  if (srcErr || !sourceRows) {
    return NextResponse.json(
      { error: 'ValidationError', message: 'source query failed' },
      { status: 400 },
    );
  }
  // I5 — Some ids resolved to rows the user can't see (RLS-hidden) OR simply
  // don't exist. Surface the missing ids so the client can pinpoint which
  // entries failed instead of getting an opaque generic error.
  if (sourceRows.length !== ids.length) {
    const foundIds = new Set(sourceRows.map((r) => r.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    return NextResponse.json({ error: 'missing_entries', missingIds }, { status: 400 });
  }

  // Build insert payload. Pair each source row with its matching
  // new_client_id at the same index (ids[i] ↔ new_client_ids[i]).
  const now = new Date().toISOString();
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  const insertPayload = sourceRows.map((src) => {
    const i = idOrder.get(src.id) ?? 0;
    return {
      user_id: userId,
      client_id: new_client_ids[i],
      logged_at: now,
      meal_category: src.meal_category,
      source: src.source,
      items: src.items,
      ai_reasoning: src.ai_reasoning,
      library_item_id: src.library_item_id,
    };
  });

  const { data: inserted, error: insertErr } = (await supabase
    .from('food_entries')
    .insert(insertPayload)
    .select()) as {
    data: Record<string, unknown>[] | null;
    error: { code?: string; message?: string } | null;
  };

  if (insertErr) {
    // 23505 race — re-SELECT previously-committed rows by their client_ids.
    if (insertErr.code === '23505') {
      const { data: replayed } = (await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', userId)
        .in('client_id', new_client_ids)) as {
        data: Record<string, unknown>[] | null;
      };
      if (replayed && replayed.length === ids.length) {
        revalidateTag(TAGS.userEntries(userId, targetDay), 'max');
        // Task 4.5 R2 S3: full canonical 6-tag invalidation via shared helper.
        revalidateAllProgressRanges(userId);
        return NextResponse.json({ created: replayed, replayed: true }, { status: 200 });
      }
    }
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  revalidateTag(TAGS.userEntries(userId, targetDay), 'max');
  // Task 4.5 R2 S3: full canonical 6-tag invalidation via shared helper.
  revalidateAllProgressRanges(userId);
  return NextResponse.json({ created: inserted ?? [] }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
