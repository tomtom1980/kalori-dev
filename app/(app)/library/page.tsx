/**
 * `/library` — Task 4.1 sub-step 3 + Task C.2 (US-STAB-C2 AC1).
 *
 * RSC entry for the dedicated library route. Auth-guarded via
 * `supabase.auth.getUser()` (crypto-verified per existing C1-B pattern).
 * Fetches the active library page (tombstone sweep + select) via
 * `lib/library/fetch.ts` IN PARALLEL with the Recent Entries fetch (the
 * temporal sibling section introduced by Task C.2), then renders:
 *   - <LibraryMasthead /> (RSC)
 *   - <LibraryClient /> (client island) — owns interactive state for the
 *     grid AND surfaces the page-level "Add Item" button + toolbar even
 *     when the user has zero items, so empty libraries still expose the
 *     primary entry point. The first-time empty state is rendered inside
 *     the grid via `renderEmpty`.
 *   - <RecentEntriesSection /> (RSC) — last-14-day `food_entries` sibling
 *     section (Task C.2 AC1).
 *
 * Parallel fetch contract (vercel-react-best-practices `async-parallel`):
 *   const [{ items }, recentEntries] = await Promise.all([
 *     fetchLibraryPage(user.id),
 *     fetchRecentEntries(user.id, { maxRows, windowDays }),
 *   ]);
 *
 * Phase 3 Round 1 fix (C-CRIT-2 react-perf): removed the <Suspense>
 * wrapper that previously surrounded <RecentEntriesSection>. The boundary
 * was dead UI — the parent `await`s both promises in `Promise.all` before
 * returning JSX, so the fallback could never render. Rendering inline is
 * honest about the synchronous-await pattern; per-section streaming via
 * `use(promise)` is deferred (see followups; not in scope for AC1).
 *
 * `export const dynamic = 'force-dynamic'` — matches the dashboard pattern;
 * Phase 5 migrates to `use cache` + cacheLife once the sweep + RLS contract
 * is settled.
 */
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { fetchLibraryPage } from '@/lib/library/fetch';
import { fetchRecentEntries } from '@/lib/library/fetchRecentEntries';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

import { LibraryClient } from './_components/LibraryClient';
import { LibraryMasthead } from './_components/LibraryMasthead';
import { RecentEntriesSection } from './_components/RecentEntriesSection';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  // Task A.3 — orphan-profile fence (US-STAB-A3). Single-pass profile
  // lookup co-located with the auth check; on orphan state redirects 302
  // to /onboarding before any aggregate read.
  //
  // Codex R1 Finding 3 fix — widen the profile SELECT to include the
  // `timezone` column so `<RecentEntriesSection />` can group rows by
  // user-local day (Today / Yesterday / "Mon, May 12") instead of UTC.
  // Without this, a Bangkok user logging at 23:30 local sees the row in
  // "Yesterday" because UTC sits one calendar day behind.
  const { user, profile } = await requireProfileOrRedirect({
    route: '/library',
    loginRedirectTo: '/library',
    selectExtras: 'timezone',
  });
  // Codex R2 Finding 2 (MEDIUM) fix — normalize at the page boundary. The
  // raw `profile.timezone` is `unknown` and a malformed legacy value
  // (e.g. abandoned onboarding rows from older code) throws inside
  // `Intl.DateTimeFormat({ timeZone })` in <RecentEntriesSection />. Invalid
  // values fall back to UTC + Sentry-capture for operator audit (same
  // observability contract as the log-now route boundary).
  const timezone = normalizeProfileTimezone(profile.timezone, {
    sentryTag: 'library-page',
    userId: user.id,
  });

  // Task C.2 — parallel fetch (rule `async-parallel`). Both queries are
  // RLS-scoped + independent; sequential `await`s would double TTFB. The
  // recent-entries fetcher soft-fails to `[]` on Supabase error; the empty
  // state covers both "user has no logs" and "fetch errored" branches.
  const [{ items }, recentEntries] = await Promise.all([
    fetchLibraryPage(user.id),
    fetchRecentEntries(user.id, { maxRows: 20, windowDays: 14 }),
  ]);

  return (
    <section data-testid="page-library">
      <div className="kalori-library-main">
        <LibraryMasthead />
      </div>
      <LibraryClient initial={items} uid={user.id} />
      <RecentEntriesSection entries={recentEntries} timezone={timezone} />
    </section>
  );
}
