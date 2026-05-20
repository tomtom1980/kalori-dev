/**
 * `POST /api/library/create` — Bug 6 (library overhaul 2026-05-16).
 *
 * Net-new endpoint for manually creating a library item without
 * logging a meal. Companion to the entry-save's `save_to_library`
 * branch but standalone.
 *
 * Contract (proposal-end defaults):
 *   - Body validated by `lib/library/create-schema.ts` (shared with the
 *     client form).
 *   - I11 idempotency: same `client_id` replayed → 200 + same row +
 *     `replayed: true`. Different `client_id` but matching normalized
 *     name → 409 + existing item. Otherwise INSERT with
 *     `created_from='manual'`, `user_edited_flag=true`.
 *   - On success: `revalidateTag(TAGS.userLibrary(uid))` + fire
 *     sketch generation via `after()` (out-of-band so the response
 *     returns immediately).
 *   - Auth via `requireProfileOrJson401` + `deleting-fence`.
 *
 * Bug 5 integration:
 *   - Sketch generation is enqueued via `enqueueSketchGeneration` on
 *     successful INSERT. The enqueue helper itself is responsible for
 *     `after()` lifecycle — this route just calls it.
 */
import * as Sentry from '@sentry/nextjs';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { TAGS } from '@/lib/cache/tags';
import { CreateLibraryBodySchema } from '@/lib/library/create-schema';
import { getLibraryCreateQuota } from '@/lib/library/create-quota';
import { enqueueSketchGeneration } from '@/lib/library/sketch-enqueue';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeName } from '@/lib/text/normalize';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

export const runtime = 'nodejs';

interface ExistingLibraryRow {
  id: string;
  user_id: string;
  client_id: string;
  display_name: string;
  normalized_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: unknown;
  thumbnail_url: string | null;
  log_count: number;
  last_used_at: string | null;
  user_edited_flag: boolean;
  created_from: string;
  created_at: string;
  deleted_at: string | null;
  recipe_eligibility?: string;
  recipe_eligibility_reason?: string | null;
  recipe_eligibility_checked_at?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  let parsed;
  try {
    const raw = (await request.json()) as unknown;
    parsed = CreateLibraryBodySchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Auth fence — orphan profile + deletion fence.
  const fenced = await requireProfileOrJson401({
    route: '/api/library/create',
    selectExtras: 'timezone',
  });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const body = parsed.data;
  const displayName = body.display_name.trim();
  const normalized = normalizeName(displayName);
  if (!normalized) {
    // Pathological all-whitespace-after-normalize. Schema should have
    // caught this but defense in depth.
    return NextResponse.json({ error: 'normalized_name_empty' }, { status: 400 });
  }

  // 1. I11 idempotency check — replay-by-client_id.
  const existingByClientId = (await supabase
    .from('food_library_items')
    .select(
      'id, user_id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at, deleted_at, recipe_eligibility, recipe_eligibility_reason, recipe_eligibility_checked_at',
    )
    .eq('user_id', userId)
    .eq('client_id', body.client_id)
    .is('deleted_at', null)
    .maybeSingle()) as { data: ExistingLibraryRow | null; error: unknown };
  if (existingByClientId.data) {
    return NextResponse.json({ item: existingByClientId.data, replayed: true }, { status: 200 });
  }

  // 2. Normalized-name dedup — different client_id but same item.
  const existingByName = (await supabase
    .from('food_library_items')
    .select(
      'id, user_id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at, deleted_at, recipe_eligibility, recipe_eligibility_reason, recipe_eligibility_checked_at',
    )
    .eq('user_id', userId)
    .eq('normalized_name', normalized)
    .is('deleted_at', null)
    .maybeSingle()) as { data: ExistingLibraryRow | null; error: unknown };
  if (existingByName.data) {
    return NextResponse.json(
      { error: 'duplicate_name', existing: existingByName.data },
      { status: 409 },
    );
  }

  const timezone = normalizeProfileTimezone(fenced.profile.timezone);
  let quota;
  try {
    quota = await getLibraryCreateQuota({ supabase, userId, tz: timezone });
  } catch (quotaError) {
    Sentry.captureException(quotaError, {
      tags: { component: 'library-create', scope: 'quota_check' },
      extra: { userId, normalized },
    });
    return NextResponse.json({ error: 'quota_lookup_failed' }, { status: 503 });
  }
  if (quota.exceeded) {
    return NextResponse.json({ error: 'library_create_quota_exceeded', quota }, { status: 429 });
  }

  // 3. INSERT.
  const insertPayload = {
    user_id: userId,
    client_id: body.client_id,
    display_name: displayName,
    normalized_name: normalized,
    default_portion: body.default_portion ?? null,
    default_unit: body.default_unit ?? null,
    nutrition: body.nutrition,
    created_from: 'manual' as const,
    user_edited_flag: true,
    ...(body.recipe_eligibility
      ? {
          recipe_eligibility: body.recipe_eligibility,
          recipe_eligibility_reason: body.recipe_eligibility_reason ?? null,
          recipe_eligibility_checked_at: new Date().toISOString(),
        }
      : {}),
  };
  const { data, error } = (await supabase
    .from('food_library_items')
    .insert(insertPayload)
    .select(
      'id, client_id, display_name, normalized_name, default_portion, default_unit, nutrition, thumbnail_url, log_count, last_used_at, user_edited_flag, created_from, created_at, recipe_eligibility, recipe_eligibility_reason, recipe_eligibility_checked_at',
    )
    .single()) as {
    data: ExistingLibraryRow | null;
    error: { code?: string; message?: string } | null;
  };

  if (error || !data) {
    Sentry.captureException(error ?? new Error('library_create_insert_failed'), {
      tags: { component: 'library-create', scope: 'insert' },
      extra: { userId, normalized },
    });
    // Error-path discipline (lessons line 16): NO cache revalidation on
    // the failure leg. A future test asserts revalidateTag was not
    // called when insert returned an error.
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // 4. Cache invalidation (success only).
  revalidateTag(TAGS.userLibrary(userId), 'max');
  revalidatePath('/library', 'page');

  // 5. Fire sketch generation out-of-band — non-blocking.
  enqueueSketchGeneration({
    libraryItemId: data.id,
    userId,
    displayName,
    timezone,
  });

  return NextResponse.json({ item: data }, { status: 201 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
