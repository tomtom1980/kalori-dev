/**
 * `/log` — Task 3.3 host + Task 4.2 LogFlow backfill + Task 4.7.4 wiring.
 *
 * Thin RSC shell. Passes `?tab=library&item={id}` searchParams to the
 * client island so it can seed the LogFlow store's active tab and
 * initial library selection on mount.
 *
 * Task 4.7.4 — server-side library hydration:
 *   - Fetches the active library list via `fetchLibraryPage` (RLS-scoped,
 *     tombstone-swept, request-deduped via React `cache()`).
 *   - When `?tab=library&item=<id>` is set, also resolves the targeted
 *     item via `getLibraryItemById`. If the item is missing (tombstoned
 *     / RLS / wrong owner), `deepLinkError = 'not_found'` is forwarded
 *     to the client so the modal degrades gracefully to the library tab.
 *   - Auth-guards on `supabase.auth.getUser()` (mirrors the dashboard +
 *     library page patterns); on failure, redirects to `/login` with
 *     `redirect_to` preserved.
 */
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { fetchLibraryPage, type LibraryItem } from '@/lib/library/fetch';
import { getLibraryItemById } from '@/lib/library/getItem';
import type { LogLibraryItem } from '@/lib/stores/useLogFlowStore';

import { LogPageClient } from './_components/LogPageClient';

/**
 * DB row → UI shape mapper. Flatten the nested `nutrition.macros` so the
 * card grid + the `<LibraryTab />` "LOG SELECTED" CTA can convert each
 * row into a `ParsedItemT` without a second roundtrip through nested
 * accessors. Defaults to 0 for any missing macro.
 */
function toLogLibraryItem(it: LibraryItem): LogLibraryItem {
  const macros = it.nutrition.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0 };
  return {
    id: it.id,
    name: it.display_name,
    kcal: it.nutrition.kcal,
    lastUsedIso: it.last_used_at,
    logCount: it.log_count,
    proteinG: macros.protein_g,
    carbsG: macros.carbs_g,
    fatG: macros.fat_g,
    fiberG: macros.fiber_g ?? 0,
    unit: it.default_unit ?? 'g',
    thumbnailUrl: it.thumbnail_url,
  };
}

export default async function LogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const rawItem = Array.isArray(params.item) ? params.item[0] : params.item;
  const rawQuantity = Array.isArray(params.quantity) ? params.quantity[0] : params.quantity;
  const initialTab = rawTab === 'type' || rawTab === 'snap' || rawTab === 'library' ? rawTab : null;
  const initialItemId = typeof rawItem === 'string' && rawItem.length > 0 ? rawItem : null;
  // Task 4.2 round 1 I2 — parse &quantity= once at the server boundary so
  // the client doesn't duplicate the parse. Non-numeric / non-positive
  // values fall through as null; LogPageClient defaults to 1 in that case.
  const parsedQuantity = typeof rawQuantity === 'string' ? Number(rawQuantity) : NaN;
  const initialQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null;

  // Task A.3 — orphan-profile fence (US-STAB-A3). Single-pass profile
  // lookup co-located with the auth check; on orphan state redirects 302
  // to /onboarding before any aggregate read.
  const search = new URLSearchParams();
  if (initialTab) search.set('tab', initialTab);
  if (initialItemId) search.set('item', initialItemId);
  if (initialQuantity !== null) search.set('quantity', String(initialQuantity));
  const qs = search.toString();
  const loginRedirectTo = `/log${qs ? `?${qs}` : ''}`;
  const { user } = await requireProfileOrRedirect({
    route: '/log',
    loginRedirectTo,
  });

  const { items: dbItems } = await fetchLibraryPage(user.id);
  const libraryItems = dbItems.map(toLogLibraryItem);

  // Resolve the deep-link target only when the URL asked for one.
  let deepLinkItem: LibraryItem | null = null;
  let deepLinkError: string | null = null;
  if (initialItemId && initialTab === 'library') {
    const resolved = await getLibraryItemById(initialItemId, user.id);
    if (resolved) {
      deepLinkItem = resolved;
    } else {
      deepLinkError = 'not_found';
    }
  }

  return (
    <LogPageClient
      initialTab={initialTab}
      initialItemId={initialItemId}
      initialQuantity={initialQuantity}
      libraryItems={libraryItems}
      deepLinkItem={deepLinkItem}
      deepLinkError={deepLinkError}
    />
  );
}
