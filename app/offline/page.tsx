/**
 * Task 5.1.2 — Offline fallback page.
 *
 * Rendered by the service worker when a navigation request fails AND nothing
 * matching the route is in the precache. Static RSC: no async data, no client
 * JS beyond the Retry button reload + the 5.1.4 PendingCount island.
 *
 * Copy contract (from Planning/.tmp/task-5.1-ui-ux-specialist.md §H):
 *   - Headline: "You're offline." (period — no exclamation, Ledger voice)
 *   - Body explains pending changes will sync.
 *   - Pending count: "1 change pending." / "{N} changes pending." (singular form)
 *   - Retry button reloads the page; aria-label "Retry loading this page"
 *
 * Task 5.1.4: the live pending-count is now a client island that subscribes
 * to outbox notifications directly (no provider, no useOutbox). The static
 * SSR row ships at 0/null so build does not need IDB; the island upgrades it
 * client-side once IDB is available.
 *
 * The page is precached at build time by Serwist via `additionalPrecacheEntries`
 * in `next.config.ts`. It MUST NOT depend on auth, network, or SSR-only state.
 */
import { t } from '@/lib/i18n/en';

import { PendingCount } from './pending-count';
import { OfflineRetryButton } from './retry-button';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main
      role="main"
      className="flex min-h-screen items-center justify-center bg-[var(--color-bg-0)] px-4 py-12 text-[var(--color-ivory)] sm:px-8 md:px-12"
    >
      <div className="w-full max-w-xl">
        {/* Task 5.1.6 AC6 — headline color upgraded from `oxblood`
            (#8A2A1F on bg-0 = 2.28:1 FAIL WCAG 1.4.3 large-text) to
            `ivory` (15.98:1 PASS AAA). Oxblood remains a system accent
            but at the headline weight + size it cannot meet the
            non-text 3:1 / large-text 3:1 floor. */}
        <h1
          className="text-[2rem] leading-tight font-[var(--font-newsreader)] font-light tracking-tight"
          style={{ color: 'var(--color-ivory)' }}
        >
          {t.offline.headline}
        </h1>
        <hr
          aria-hidden
          className="my-4 w-60 border-0 border-t border-[color-mix(in_srgb,var(--color-ivory)_18%,transparent)]"
        />
        <p className="text-base leading-relaxed font-[var(--font-newsreader)]">{t.offline.body}</p>
        <PendingCount />
        <div className="mt-8">
          <OfflineRetryButton />
        </div>
      </div>
    </main>
  );
}
