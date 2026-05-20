/**
 * `<LibraryEmptyState />` — Task 4.1 sub-step 3 §7.2.
 *
 * Two flavours:
 *   - `first-time` (zero library items): a single-line heading. The page
 *     itself always renders the toolbar + "Add Item" button at the top, so
 *     this surface intentionally has no CTA — the page-level button IS the
 *     entry point.
 *   - `filtered-zero`: heading + body + Clear-filters affordance.
 *
 * Pure RSC.
 */
import { t } from '@/lib/i18n/en';

export interface LibraryEmptyStateProps {
  kind?: 'first-time' | 'filtered-zero';
  onReset?: () => void;
}

export function LibraryEmptyState({ kind = 'first-time', onReset }: LibraryEmptyStateProps) {
  if (kind === 'filtered-zero') {
    return (
      <section
        className="kalori-library-empty"
        data-testid="library-empty-filtered"
        aria-labelledby="library-empty-heading"
      >
        <h2 id="library-empty-heading" className="kalori-library-empty-heading">
          {t.library.emptyFilteredHeading}
        </h2>
        <p className="kalori-library-empty-body">{t.library.emptyFilteredBody}</p>
        {onReset ? (
          <button type="button" onClick={onReset} className="kalori-library-pill">
            {t.library.emptyFilteredReset}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="kalori-library-empty"
      data-testid="library-empty-first-time"
      aria-labelledby="library-empty-heading"
    >
      <h2 id="library-empty-heading" className="kalori-library-empty-heading">
        {t.library.emptyFirstTimeHeading}
      </h2>
    </section>
  );
}

export default LibraryEmptyState;
