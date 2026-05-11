/**
 * `POST /api/library/dedup-check` — Task 3.4, preflight library dedup.
 *
 * Contract (synthesis §5.3 + architecture §3.2):
 *   - Body: `{ normalized_name: string (1..200) }`. Client precomputes via
 *     `lib/text/normalize.ts`.
 *   - Auth required; RLS scopes query to user's own library.
 *   - Returns 200 + `{ match: FoodLibraryItem | null }`. Exact equality only;
 *     no fuzzy (design-doc §18.3).
 *   - No cache-tag writes (read-only).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const BodySchema = z
  .object({
    normalized_name: z.string().min(1).max(200),
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

  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/library/dedup-check' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const { data: match } = (await supabase
    .from('food_library_items')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('normalized_name', parsed.data.normalized_name)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  return NextResponse.json({ match: match ?? null }, { status: 200 });
}
