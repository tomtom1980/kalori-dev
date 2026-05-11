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
      <p className="kalori-library-masthead-kicker">{t.library.kicker}</p>
      <h1 className="kalori-library-masthead-title">{t.library.title}</h1>
    </header>
  );
}

export default LibraryMasthead;
