/**
 * `<LibraryMasthead />` — Task 4.1 sub-step 3.
 *
 * Pure presentation RSC. Kicker + serif title + double hairline rule per
 * reconciled spec §7.1. Positioned at the top of `/library` above the tools
 * rail.
 */
import { t } from '@/lib/i18n/en';

export function LibraryMasthead() {
  return (
    <header className="kalori-library-masthead" data-testid="library-masthead">
      <h1 className="kalori-library-masthead-title">{t.library.title}</h1>
      <p className="kalori-library-masthead-summary">{t.library.summary}</p>
    </header>
  );
}

export default LibraryMasthead;
