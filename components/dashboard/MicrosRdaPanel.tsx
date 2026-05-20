/**
 * <MicrosRdaPanel /> — Task C.1 (US-STAB-C1) sibling of the existing
 * `MicronutrientPanel` (Task 3.5 / Task 3.7 last-7-days-union variant).
 *
 * Renders the 30-row today's-RDA chip grid below the Macros panel on the
 * dashboard. Pure RSC — no `'use client'`, no client state, no Radix
 * tooltip, no motion library. The panel is a data-only renderer; the
 * resolver (`lib/dashboard/micros-rda-resolver.ts`) owns the business
 * logic and runs inside `aggregateDay`.
 *
 * Layout (per Phase 1 style spec):
 *   - Top hairline (var(--color-rule-strong)) separates panel from
 *     MacroBars hero row above.
 *   - Eyebrow header "MICROS" + "30 ELEMENTS" (Inter 500 0.22em uppercase,
 *     var(--color-dust)).
 *   - Chip grid: 1 column < 600px, 2 columns ≥ 600px. Per-cell hairlines
 *     via grid borders (border-top + border-left on grid, border-right +
 *     border-bottom per cell — produces uniform 1px frame with no
 *     double-thick joins).
 *   - Chip body: name (Inter UPPERCASE 0.22em dust) on the left,
 *     percent (JetBrains Mono tabular-nums) on the right, foreground
 *     swaps to oxblood when pct ≥ 90 via [data-over-threshold].
 *
 * Empty-state branch (AC5): when EVERY row has `value === 0`, render the
 * italic-serif heading + sans caption from existing i18n keys
 * (`t.dashboard.micro.emptyHeading` / `emptyCaption`) — NOT 30 zero-pct
 * chips. The empty-state DOM matches `MicronutrientPanel`'s.
 *
 * No new design tokens, no new i18n keys, no new dependencies.
 */
import { t } from '@/lib/i18n/en';
import type { MicroRdaRow } from '@/lib/dashboard/micros-rda-resolver';

export interface MicrosRdaPanelProps {
  rows: MicroRdaRow[];
}

const headerCellStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--type-label)',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-dust)',
};

export function MicrosRdaPanel({ rows }: MicrosRdaPanelProps) {
  const allZero = rows.every((r) => r.value === 0);

  return (
    <section
      data-testid="micros-rda-panel"
      aria-labelledby="micros-rda-header"
      style={{
        borderTop: '1px solid var(--color-rule-strong)',
        paddingTop: 'var(--spacing-4)',
        marginTop: 'var(--spacing-5)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <span id="micros-rda-header" style={headerCellStyle}>
          {t.dashboard.microsRda.headerLeft}
        </span>
        <span style={headerCellStyle}>{t.dashboard.microsRda.headerRight}</span>
      </header>

      {allZero ? (
        <div data-testid="micros-rda-empty">
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
        <div
          role="list"
          data-testid="micros-rda-grid"
          className="kalori-micros-rda-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 0,
            borderTop: '1px solid var(--color-rule)',
            borderLeft: '1px solid var(--color-rule)',
          }}
        >
          {rows.map((row) => (
            <div
              key={row.code}
              role="listitem"
              data-testid={`micros-rda-chip-${row.code}`}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 'var(--spacing-3)',
                minHeight: 44,
                padding: 'var(--spacing-2) var(--spacing-3)',
                borderRight: '1px solid var(--color-rule)',
                borderBottom: '1px solid var(--color-rule)',
              }}
              aria-label={t.dashboard.microsRda.rowAriaLabel
                .replace('{name}', row.name)
                .replace('{pct}', String(row.pct))}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--type-label)',
                  fontWeight: 500,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--color-dust)',
                  lineHeight: 1.4,
                  overflowWrap: 'anywhere',
                }}
              >
                {row.name}
              </span>
              <span
                data-over-threshold={row.meetsThreshold ? 'true' : undefined}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'var(--type-label)',
                  color: row.meetsThreshold ? 'var(--color-oxblood)' : 'var(--color-sand)',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${row.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default MicrosRdaPanel;
