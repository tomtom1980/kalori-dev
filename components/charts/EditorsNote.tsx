/**
 * <EditorsNote /> — Shared Ledger editorial primitive for sparse-data
 * fallbacks across progress charts + weekly review island.
 *
 * Task 4.3a R1 (2026-04-24) — extracted from per-chart rolled-own empty
 * states per ux-specialist review §8.4. Reuses the "THE EDITOR'S NOTE"
 * kicker + bulleted day-list pattern from WeeklyReviewCore sparse.
 *
 * Visual signature:
 *   - Hairline rule above (1px ivory @ 12%)
 *   - Left-indented `§` kicker in Inter UPPERCASE tracking 0.22em oxblood-soft
 *   - Body line: Newsreader italic 18 sand with middot separator
 *   - Optional bullet list: Newsreader 16 ivory with oxblood em-dash ::before
 *
 * Consumed by: CalorieAdherenceBar (sparse banner), MicronutrientHeatmap
 * (empty caption when 0 days), TrendSummary (sparse), LoggingConsistencyCalendar
 * (empty), WeeklyReviewCore (sparse branch — reuses this primitive).
 */
import type { ReactNode } from 'react';

export interface EditorsNoteProps {
  /** Kicker text — e.g. "§ THE EDITOR'S NOTE" or "§ SPARSE DATA". */
  kicker: string;
  /** Primary body sentence, rendered italic serif. */
  body: string;
  /** Optional bulleted day list — one bullet per logged day. */
  bullets?: readonly string[];
  /** Optional test id for targeted assertions. */
  testid?: string;
  /** Override outer container aria role — defaults to "note". */
  role?: string;
  /** Optional "before bullets" slot — rare, for inline CTA. */
  afterBullets?: ReactNode;
}

export function EditorsNote({
  kicker,
  body,
  bullets,
  testid,
  role = 'note',
  afterBullets,
}: EditorsNoteProps) {
  const ariaLabel = `${kicker}. ${body}`;
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      data-testid={testid ?? 'editors-note'}
      style={{
        borderTop: '1px solid color-mix(in srgb, var(--color-ivory) 12%, transparent)',
        paddingTop: 'var(--spacing-6)',
        marginTop: 'var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-3)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-ivory)',
          margin: 0,
        }}
      >
        {kicker}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 18,
          lineHeight: 1.55,
          color: 'var(--color-sand)',
          margin: 0,
          maxWidth: '60ch',
        }}
      >
        {body}
      </p>
      {bullets && bullets.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-1)',
          }}
          data-testid={`${testid ?? 'editors-note'}-bullets`}
        >
          {bullets.map((bullet, idx) => (
            <li
              key={idx}
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--color-ivory)',
                paddingLeft: '1.5em',
                position: 'relative',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  color: 'var(--color-oxblood)',
                }}
              >
                —
              </span>
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
      {afterBullets}
    </div>
  );
}
