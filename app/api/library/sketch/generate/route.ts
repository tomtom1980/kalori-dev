/**
 * `POST /api/library/sketch/generate` — Bug 5 (library overhaul
 * 2026-05-16).
 *
 * Single-row sketch retry endpoint. Used by:
 *   - The backfill route, which delegates per-row work here (or
 *     inlines the pipeline call — see backfill route for the chosen
 *     pattern).
 *   - Future manual-retry UI affordance on FoodDetail "regenerate
 *     sketch" buttons (out of scope for this batch but the surface
 *     exists so the UI can land later without backend changes).
 *
 * Contract:
 *   - Body: `{ libraryItemId: UUID }` — userId derives from auth.
 *   - Returns 200 + `{ status, thumbnailUrl? }` on the pipeline
 *     `SketchPipelineOutcome` envelope.
 *   - Returns 503 if the pipeline reported a `failed` outcome (so the
 *     client can backoff + retry).
 *   - Idempotent: a row already in `thumbnail_kind='sketch'` returns
 *     200 + `status='skipped'`, NO regeneration, NO retry-counter bump.
 *
 * Server-only (runtime=nodejs). Auth-fenced.
 */
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import { runSketchPipeline } from '@/lib/library/sketch-pipeline';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    libraryItemId: z.string().uuid(),
  })
  .strict();

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

  const fenced = await requireProfileOrJson401({
    route: '/api/library/sketch/generate',
    selectExtras: 'timezone',
  });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const outcome = await runSketchPipeline({
    libraryItemId: parsed.data.libraryItemId,
    userId,
    supabase,
    timezone: normalizeProfileTimezone(fenced.profile.timezone),
  });

  if (outcome.status === 'generated') {
    revalidateTag(TAGS.userLibrary(userId), 'max');
    revalidatePath('/library', 'page');
    return NextResponse.json(outcome, { status: 200 });
  }

  if (outcome.status === 'failed') {
    return NextResponse.json(outcome, {
      status: outcome.code === 'image_analysis_quota_exceeded' ? 429 : 503,
    });
  }

  // status='skipped' is a normal idempotent outcome.
  return NextResponse.json(outcome, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
