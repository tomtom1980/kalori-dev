/**
 * <Masthead /> — Task 3.5 dashboard RSC.
 *
 * Editorial broadsheet masthead. Full-bleed within page padding; double
 * hairline bottom (1px rule-strong + 1px rule with 3px gap). Wordmark is
 * h1 (ux-auditor §1.1). Edition line renders a formatted
 * `No. {n} · {weekday}, {day} {month} {year}` string via
 * `t.masthead.editionFormat`.
 *
 * Variants driven by a `firstVisit` boolean (from
 * `profiles.last_dashboard_visit_at IS NULL`). No boolean proliferation —
 * other variants (recalc-nudge, offline) are out of scope for 3.5 per
 * briefing §11.
 */
import { t } from '@/lib/i18n/en';
import type { Edition } from '@/lib/dashboard/types';

export interface MastheadProps {
  edition: Edition;
  firstVisit: boolean;
}

function formatEdition(edition: Edition): string {
  return t.masthead.editionFormat
    .replace('{n}', String(edition.n))
    .replace('{weekday}', edition.weekday)
    .replace('{day}', String(edition.day))
    .replace('{month}', edition.month)
    .replace('{year}', String(edition.year));
}

export function Masthead({ edition, firstVisit }: MastheadProps) {
  return (
    <header
      data-testid="dashboard-masthead"
      style={{
        borderBottom: '1px solid var(--color-rule-strong)',
        paddingBlockEnd: 'var(--spacing-6)',
        paddingBlockStart: 'var(--spacing-6)',
        // Emulate double hairline via a layered gradient on the bottom border.
        boxShadow: 'inset 0 -4px 0 0 var(--color-bg-0), inset 0 -5px 0 0 var(--color-rule)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.masthead.sectionKicker.dashboard}
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--type-wordmark-lg)',
          fontWeight: 300,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: 'var(--color-ivory)',
          margin: 0,
        }}
      >
        {t.brand.wordmark}
      </h1>
      <p
        data-testid="masthead-tagline"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--type-body-sm)',
          fontStyle: 'italic',
          color: 'var(--color-sand)',
          margin: 0,
          marginTop: 'var(--spacing-3)',
        }}
      >
        {t.masthead.tagline}
      </p>
      <p
        data-testid="masthead-edition"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginTop: 'var(--spacing-3)',
        }}
      >
        {formatEdition(edition)}
      </p>
      {firstVisit ? (
        <p
          data-testid="masthead-welcome"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--color-sand)',
            margin: 0,
            marginTop: 'var(--spacing-2)',
          }}
        >
          {t.masthead.welcomeFirstVisit}
        </p>
      ) : null}
    </header>
  );
}

export default Masthead;
