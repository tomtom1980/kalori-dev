/**
 * <MicronutrientPanel /> — Task 3.5 dashboard RSC + Task 3.7 F-UI-3.7-A fix.
 *
 * Renders the last-7-days micronutrient panel shell: header + empty state +
 * (when rows exist) a `<MicrosOverflowToggle>` client leaf. Row rendering +
 * expand/collapse logic LIVE INSIDE the client leaf per the React 19 RSC
 * contract — passing a render-prop function from this server component
 * would cross the server→client boundary, and functions are not
 * serializable for RSC payloads.
 *
 * Server component responsibility: pass plain data (rows + visibleCount).
 * Client component responsibility: own the toggle state and decide what to
 * render.
 */
import { MicrosOverflowToggle } from './MicrosOverflowToggle';

import { t } from '@/lib/i18n/en';
import type { MicroRow } from '@/lib/dashboard/types';

export interface MicronutrientPanelProps {
  rows: MicroRow[];
  visibleCount: number;
}

export function MicronutrientPanel({ rows, visibleCount }: MicronutrientPanelProps) {
  const overflowId = 'micro-panel-overflow';

  return (
    <section
      data-testid="micronutrient-panel"
      aria-labelledby="micros-panel-heading"
      style={{
        borderTop: '1px solid var(--color-rule)',
        paddingTop: 'var(--spacing-4)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <h2
          id="micros-panel-heading"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            margin: 0,
          }}
        >
          {t.dashboard.micro.headerLeft}
        </h2>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
          }}
        >
          {t.dashboard.micro.headerRight}
        </span>
      </header>

      {rows.length === 0 ? (
        <div data-testid="micros-empty">
          <h3
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'var(--color-sand)',
              margin: 0,
            }}
          >
            {t.dashboard.micro.emptyHeading}
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--color-dust)',
              margin: 0,
              marginTop: 'var(--spacing-2)',
            }}
          >
            {t.dashboard.micro.emptyCaption}
          </p>
        </div>
      ) : (
        <MicrosOverflowToggle rows={rows} visibleCount={visibleCount} overflowId={overflowId} />
      )}
    </section>
  );
}

export default MicronutrientPanel;
