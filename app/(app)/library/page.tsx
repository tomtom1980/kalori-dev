/**
 * `/library` — Task 4.1 sub-step 3.
 *
 * RSC entry for the dedicated library route. Auth-guarded via
 * `supabase.auth.getUser()` (crypto-verified per existing C1-B pattern).
 * Fetches the active library page (tombstone sweep + select) via
 * `lib/library/fetch.ts`, then renders:
 *   - <LibraryMasthead /> (RSC)
 *   - <LibraryEmptyState /> (RSC) if the user has zero active items
 *   - <LibraryClient /> (client island) otherwise, owning all interactive
 *     state (filter + sort + selection + optimistic deletes + merge).
 *
 * `export const dynamic = 'force-dynamic'` — matches the dashboard pattern;
 * Phase 5 migrates to `use cache` + cacheLife once the sweep + RLS contract
 * is settled.
 */
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { fetchLibraryPage } from '@/lib/library/fetch';

import { LibraryClient } from './_components/LibraryClient';
import { LibraryEmptyState } from './_components/LibraryEmptyState';
import { LibraryMasthead } from './_components/LibraryMasthead';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  // Task A.3 — orphan-profile fence (US-STAB-A3). Single-pass profile
  // lookup co-located with the auth check; on orphan state redirects 302
  // to /onboarding before any aggregate read.
  const { user } = await requireProfileOrRedirect({
    route: '/library',
    loginRedirectTo: '/library',
  });

  const { items } = await fetchLibraryPage(user.id);

  if (items.length === 0) {
    return (
      <section data-testid="page-library" className="kalori-library-main">
        <LibraryMasthead />
        <LibraryEmptyState kind="first-time" />
      </section>
    );
  }

  return (
    <section data-testid="page-library">
      <div className="kalori-library-main">
        <LibraryMasthead />
      </div>
      <LibraryClient initial={items} uid={user.id} />
    </section>
  );
}
