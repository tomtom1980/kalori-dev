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

function formatDashboardDate(edition: Edition): string {
  return `${edition.weekday}, ${edition.day} ${edition.month} ${edition.year}`;
}

export function Masthead({ edition, firstVisit }: MastheadProps) {
  void firstVisit;
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
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(48px, 9vw, 92px)',
          fontWeight: 300,
          lineHeight: 0.95,
          letterSpacing: 0,
          color: 'var(--color-ivory)',
          margin: 0,
        }}
      >
        {t.dashboard.heading}
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
          color: 'var(--color-dust)',
          margin: 0,
          marginTop: 'var(--spacing-3)',
        }}
      >
        {t.masthead.todayDateLabel}
        <br />
        {formatDashboardDate(edition)}
      </p>
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
        {t.masthead.dailyInspiration}
      </p>
    </header>
  );
}

export default Masthead;
