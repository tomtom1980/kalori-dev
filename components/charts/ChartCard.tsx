/**
 * <ChartCard /> — shared Ledger chart-card container.
 *
 * Hairline 1px rule-strong border on bg-1, zero radius, 24/32 padding.
 * Header row: kicker + title + italic subtitle + meta, separated from body by
 * a 1px rule. Body fills remaining height. Footer optional, separated by 1px
 * rule.
 *
 * Used by all 5 progress charts + the weekly-review island. Keeps the
 * "editorial-column" composition consistent without repeating the same
 * inline-style soup in every file.
 */
import type { ReactNode } from 'react';

export interface ChartCardProps {
  kicker?: string;
  title: ReactNode;
  subtitle?: string;
  meta?: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  fullWidth?: boolean;
  padding?: 'regular' | 'wide';
  testid?: string;
  /** Stable DOM id for aria-labelledby linking. */
  id?: string;
  /** Role override — default `region`. */
  role?: string;
  ariaLabelledBy?: string;
}

export function ChartCard(props: ChartCardProps) {
  const pad = props.padding === 'wide' ? 'var(--spacing-8)' : 'var(--spacing-6)';
  return (
    <section
      data-testid={props.testid}
      role={props.role ?? 'region'}
      aria-labelledby={props.ariaLabelledBy ?? props.id}
      style={{
        gridColumn: props.fullWidth ? '1 / -1' : 'auto',
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: pad,
        borderRadius: 0,
        boxShadow: 'none',
        // Phase 7 regression fix (REG-1/REG-3): chart-card must allow
        // horizontal shrink when its grid track is narrower than its
        // intrinsic min-content (heatmap table, lcc fixed grid). Inner
        // overflow-x: auto wrappers (heatmap-scroll, lcc-grid-scroll)
        // engage only when this card is constrained by `min-width: 0`.
        minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--spacing-6)',
          paddingBottom: 14,
          borderBottom: '1px solid var(--color-rule)',
          marginBottom: 18,
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {props.kicker ? (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: 10.5,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-oxblood-soft)',
                margin: 0,
                marginBottom: 8,
              }}
            >
              {props.kicker}
            </p>
          ) : null}
          <h2
            id={props.id}
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontSize: 24,
              letterSpacing: '-0.01em',
              color: 'var(--color-ivory)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {props.title}
          </h2>
          {props.subtitle ? (
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--color-sand)',
                margin: 0,
                marginTop: 4,
              }}
            >
              {props.subtitle}
            </p>
          ) : null}
        </div>
        {props.meta ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--color-dust)',
              textAlign: 'right',
              flex: '0 0 auto',
            }}
          >
            {props.meta}
          </div>
        ) : null}
      </header>
      <div>{props.body}</div>
      {props.footer ? (
        <footer
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: '1px solid var(--color-rule)',
          }}
        >
          {props.footer}
        </footer>
      ) : null}
    </section>
  );
}
