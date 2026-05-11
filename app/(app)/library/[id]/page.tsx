/**
 * `/library/[id]` — Task 4.2 server shell.
 *
 * Auth-guarded via `supabase.auth.getUser()`. Fetches the single library
 * item via `lib/library/getItem.ts` (tombstone-filtered, RLS-scoped) and
 * the 5 most-recent entry rows. Delegates rendering to the client
 * `<FoodDetail>` island.
 *
 * Tombstoned items → `notFound()` → `not-found.tsx`.
 */
import { notFound, redirect } from 'next/navigation';

import { getLibraryItemById, getLibraryItemHistory } from '@/lib/library/getItem';
import { getServerSupabase } from '@/lib/supabase/server';

import { FoodDetail } from '../_components/FoodDetail/FoodDetail';

export const dynamic = 'force-dynamic';

export default async function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    try {
      await supabase.auth.signOut();
    } catch {
      // best-effort
    }
    redirect(`/login?reason=session_expired&redirect_to=%2Flibrary%2F${id}`);
  }

  const item = await getLibraryItemById(id, user.id);
  if (!item) notFound();

  const history = await getLibraryItemHistory(id, user.id, { limit: 5 });

  return (
    <section data-testid="page-library-detail">
      <FoodDetail item={item} history={history} />
    </section>
  );
}
