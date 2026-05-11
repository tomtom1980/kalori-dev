/**
 * <MealsBulletin /> — Task 3.5 dashboard RSC shell.
 *
 * Hosts 5 MealColumn RSCs. Responsive grid is driven by the
 * `.kalori-meals-bulletin-grid` utility in `app/globals.css` (alongside the
 * `nav-shell-*` block — same canonical 768/1280 breakpoints):
 *   - <  768px (mobile):  single-column stack (1fr).
 *   - 768–1279 (tablet):  2-col grid (repeat(2, minmax(0, 1fr))).
 *   - >= 1280  (desktop): 5-col grid (repeat(5, minmax(0, 1fr))).
 *
 * Adopted via bugfix-tomi 2026-05-08-mobile-ui-overhaul Bug #1: the previous
 * inline `gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'` blew out at
 * 375px (~68px/column). The 5 MealColumn children render unconditionally at
 * every viewport — no DOM swapping — so accessibility and ARIA structure are
 * preserved across breakpoints.
 */
import { MealColumn } from './MealColumn';

import { MEAL_CATEGORIES, type MealsByCategory } from '@/lib/dashboard/types';
import { t } from '@/lib/i18n/en';

export interface MealsBulletinProps {
  meals: MealsByCategory;
  timezone?: string;
  viewedDay?: string | undefined;
}

export function MealsBulletin({ meals, timezone = 'UTC', viewedDay }: MealsBulletinProps) {
  const totalEntries = MEAL_CATEGORIES.reduce((n, cat) => n + meals[cat].entries.length, 0);
  return (
    <section
      data-testid="meals-bulletin"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-4)',
      }}
    >
      <header>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--type-section-md)',
            fontWeight: 300,
            lineHeight: 1.15,
            color: 'var(--color-ivory)',
            margin: 0,
          }}
        >
          {/* "The day's entries" — word 'entries' italic sand. Split via
              shared substring match on the italic-word key. */}
          {(() => {
            const full = t.dashboard.meals.bulletinHeading;
            const italic = t.dashboard.meals.bulletinHeadingItalicWord;
            const idx = full.toLowerCase().indexOf(italic.toLowerCase());
            if (idx === -1) return full;
            return (
              <>
                {full.slice(0, idx)}
                <em
                  style={{
                    fontStyle: 'italic',
                    color: 'var(--color-sand)',
                  }}
                >
                  {full.slice(idx, idx + italic.length)}
                </em>
                {full.slice(idx + italic.length)}
              </>
            );
          })()}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--color-sand)',
            margin: 0,
            marginTop: 'var(--spacing-1)',
          }}
        >
          {t.dashboard.meals.bulletinSubheading}
        </p>
      </header>

      {totalEntries === 0 ? (
        <div
          data-testid="meals-empty-banner"
          style={{
            borderTop: '2px solid var(--color-oxblood)',
            padding: 'var(--spacing-3) 0',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 300,
              color: 'var(--color-ivory)',
              margin: 0,
            }}
          >
            {t.dashboard.meals.firstTimeBannerHeading}
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--color-sand)',
              margin: 0,
              marginTop: 'var(--spacing-1)',
            }}
          >
            {t.dashboard.meals.firstTimeBannerCTADesktop}
          </p>
        </div>
      ) : null}

      <div className="kalori-meals-bulletin-grid">
        {MEAL_CATEGORIES.map((cat) => (
          <MealColumn key={cat} data={meals[cat]} timezone={timezone} viewedDay={viewedDay} />
        ))}
      </div>
    </section>
  );
}

export default MealsBulletin;
