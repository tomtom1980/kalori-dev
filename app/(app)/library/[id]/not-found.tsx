/**
 * `/library/[id]` 404 — Task 4.2.
 *
 * Surfaced when the id doesn't exist OR is tombstoned (per the detail
 * SELECT's `.is('deleted_at', null)` filter). Editorial italic copy,
 * back-link to the index.
 */
import Link from 'next/link';

import { t } from '@/lib/i18n/en';

export default function FoodDetailNotFound() {
  return (
    <section data-testid="page-library-detail-not-found" className="kalori-fd-notfound">
      <p className="kalori-fd-notfound-heading">{t.library.detail.notFoundHeading}</p>
      <p className="kalori-fd-notfound-body">{t.library.detail.notFoundBody}</p>
      <Link href="/library" className="kalori-fd-notfound-link">
        {t.library.detail.notFoundLink}
      </Link>
    </section>
  );
}
