/**
 * `<LibraryEmptyState />` — Task 4.1 sub-step 3 §7.2.
 *
 * First-time copy + filtered-to-zero copy + inverse-pill CTA. Pure RSC.
 */
import Link from 'next/link';

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
      <p className="kalori-library-empty-body">{t.library.emptyFirstTimeBody}</p>
      <Link href="/log?tab=type" className="kalori-library-pill" data-testid="library-empty-cta">
        {t.library.emptyCta}
      </Link>
    </section>
  );
}

export default LibraryEmptyState;
