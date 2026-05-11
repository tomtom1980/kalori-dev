/**
 * `GET /api/library/list` — client-hydration source for the LogFlow modal's
 * Library tab. Used when the modal opens from a chrome trigger (FAB / `n`
 * keybinding / meal-column +ADD) instead of `/log` direct-nav.
 *
 * Read-only mirror of the `/log` page's RSC fetch. Reuses `fetchLibraryPage`
 * (server-only) so the lazy tombstone sweep + active-list contract stays in
 * one place. Maps each row through `toLogLibraryItem` so the client receives
 * the same `LogLibraryItem` shape it already consumes from
 * `useLogFlowStore.libraryItems`.
 *
 * Auth fence: `requireProfileOrJson401` (Task A.3). Orphan profile → 401
 * `profile_lookup_failed`; transient profile-lookup error → 503
 * `profile_lookup_unavailable` (distinct from 401 so the refresh interceptor
 * does not force-sign-out on a transient blip).
 */
import { NextResponse } from 'next/server';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { fetchLibraryPage } from '@/lib/library/fetch';
import { toLogLibraryItem } from '@/lib/library/to-log-library-item';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const fenced = await requireProfileOrJson401({ route: '/api/library/list' });
  if (fenced instanceof Response) return fenced;
  const { items } = await fetchLibraryPage(fenced.user.id);
  return NextResponse.json({ items: items.map(toLogLibraryItem) }, { status: 200 });
}
