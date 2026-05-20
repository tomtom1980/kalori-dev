/**
 * `POST /api/library/sketch/backfill` — Bug 5 (library overhaul
 * 2026-05-16).
 *
 * One-shot dashboard-triggered backfill. Selects library items that:
 *   - Belong to the authed user
 *   - Have NO sketch yet (`sketch_generated_at IS NULL`)
 *   - Are NOT already photo'd (`thumbnail_kind IS NULL` or = 'sketch')
 *   - Have NOT exceeded the retry cap (`sketch_attempt_count < 3`)
 *   - Are NOT tombstoned (`deleted_at IS NULL`)
 *
 * Processes sequentially (Gemini image rate-limits are tight) up to
 * MAX_BACKFILL_PER_INVOCATION rows. If the user clicks again, the next
 * call drains the next batch.
 *
 * Cost ceiling: hard-cap at 200 per call. The cap is enforced HERE,
 * not just in the UI — defense in depth.
 *
 * Returns `{ generated, failed, skipped, remaining }` counts so the
 * client widget can render progress.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import { runSketchPipeline } from '@/lib/library/sketch-pipeline';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

export const MAX_BACKFILL_PER_INVOCATION = 200;

interface CandidateRow {
  id: string;
  display_name: string;
}

export async function POST(request: Request): Promise<Response> {
  void request;
  const fenced = await requireProfileOrJson401({
    route: '/api/library/sketch/backfill',
    selectExtras: 'timezone',
  });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  // Select the next batch of backfill candidates.
  const { data, error } = (await supabase
    .from('food_library_items')
    .select('id, display_name')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .is('sketch_generated_at', null)
    .or('thumbnail_kind.is.null,thumbnail_kind.eq.sketch')
    .lt('sketch_attempt_count', 3)
    .order('log_count', { ascending: false })
    .limit(MAX_BACKFILL_PER_INVOCATION)) as {
    data: CandidateRow[] | null;
    error: unknown;
  };

  if (error) {
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  const candidates = data ?? [];
  const timezone = normalizeProfileTimezone(fenced.profile.timezone);

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of candidates) {
    const outcome = await runSketchPipeline({
      libraryItemId: row.id,
      userId,
      displayName: row.display_name,
      supabase,
      timezone,
    });
    if (outcome.status === 'generated') generated += 1;
    else if (outcome.status === 'failed') failed += 1;
    else skipped += 1;
  }

  // Single cache revalidation at end of batch (avoids N× invalidations).
  if (generated > 0) {
    revalidateTag(TAGS.userLibrary(userId), 'max');
    revalidatePath('/library', 'page');
  }

  // Remaining = count of items still eligible after this batch.
  const remainingRes = (await supabase
    .from('food_library_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .is('sketch_generated_at', null)
    .or('thumbnail_kind.is.null,thumbnail_kind.eq.sketch')
    .lt('sketch_attempt_count', 3)) as { count: number | null };
  const remaining = remainingRes.count ?? 0;

  return NextResponse.json(
    { generated, failed, skipped, remaining, processedBatchSize: candidates.length },
    { status: 200 },
  );
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
