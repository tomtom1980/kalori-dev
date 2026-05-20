/**
 * `<RecentEntriesEmpty />` — Task C.2 (US-STAB-C2 AC1).
 *
 * Section-scoped empty state for the Recent Entries surface. Centered italic
 * serif headline + Inter sub-copy. Pure RSC, no client interactivity.
 */
import { t } from '@/lib/i18n/en';

export function RecentEntriesEmpty() {
  return (
    <div data-testid="recent-entries-empty" className="kalori-re-empty">
      <p className="kalori-re-empty-headline">{t.library.recentEntries.emptyHeadline}</p>
      <p className="kalori-re-empty-body">{t.library.recentEntries.emptyBody}</p>
    </div>
  );
}

export default RecentEntriesEmpty;
