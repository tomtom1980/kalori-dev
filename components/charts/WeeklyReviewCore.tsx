/**
 * <WeeklyReviewCore /> — Task 4.3a shared weekly-review primitive (RSC).
 *
 * Rendered in two variants:
 *   - `variant="full"` → progress-page island. Drop cap in ember (82px on
 *     desktop, 64px on mobile) appears HERE and nowhere else in the app
 *     (T6 invariant per briefing §5).
 *   - `variant="compact"` → dashboard WeeklyInsightCard. No 82px drop cap;
 *     a smaller 48px pull-quote cap per ui-design §7.1.7 can appear on the
 *     compact variant if design decides to — for 4.3a we ship compact
 *     without ANY drop cap to stay minimal and clearly distinct from the
 *     full variant.
 *
 * Sparse-data UI uses verbatim task-card copy (briefing §0 Resolution #5):
 *   `§ THE EDITOR'S NOTE · Too little logged this week for a full review.`
 * followed by a bulleted one-liner per logged day in past 7.
 */
import { t } from '@/lib/i18n/en';

export type WeeklyReviewStatus = 'fresh' | 'stale' | 'sparse-data' | 'generating' | 'error';
export type WeeklyReviewVariant = 'full' | 'compact';
export type PeriodReviewRange = 'D' | 'M' | 'custom';

export interface WeeklyReviewInsights {
  body_markdown?: string | null;
  bullets?: ReadonlyArray<string>;
  sparse_data?: boolean;
  logged_days?: ReadonlyArray<{ date: string; summary: string }>;
}

export interface WeeklyReviewCoreProps {
  variant: WeeklyReviewVariant;
  status: WeeklyReviewStatus;
  insights: WeeklyReviewInsights;
  generatedAt?: string | null | undefined;
  expiresAt?: string | null | undefined;
  weekStartOn?: string | undefined;
  weekEndsOn?: string | undefined;
  periodRange?: PeriodReviewRange | undefined;
}

export function WeeklyReviewCore(props: WeeklyReviewCoreProps) {
  const { variant, status, insights } = props;

  if (status === 'error') {
    return <ErrorState variant={variant} />;
  }

  if (status === 'sparse-data' || insights.sparse_data === true) {
    return (
      <SparseState
        variant={variant}
        loggedDays={insights.logged_days ?? []}
        periodRange={props.periodRange}
      />
    );
  }

  // Fresh / stale: render body_markdown first paragraph with drop cap (full
  // variant only), then bullets.
  return (
    <FullReview
      variant={variant}
      insights={insights}
      weekStartOn={props.weekStartOn}
      weekEndsOn={props.weekEndsOn}
      generatedAt={props.generatedAt}
      expiresAt={props.expiresAt}
      periodRange={props.periodRange}
    />
  );
}

function FullReview(props: {
  variant: WeeklyReviewVariant;
  insights: WeeklyReviewInsights;
  weekStartOn?: string | undefined;
  weekEndsOn?: string | undefined;
  generatedAt?: string | null | undefined;
  expiresAt?: string | null | undefined;
  periodRange?: PeriodReviewRange | undefined;
}) {
  const body = (props.insights.body_markdown ?? '').trim();
  const firstChar = body.length > 0 ? body[0] : '';
  // NOTE: Task 4.3a R1 fix M2 removed the sr-only duplicate of firstChar
  // and inlined {body} fully, so `rest` (body.slice(1)) is no longer
  // needed. Visual drop cap (aria-hidden) overlays the first letter via
  // float:left; screen readers receive the complete paragraph through
  // the article's aria-labelledby.
  const isFull = props.variant === 'full';
  const periodRange = props.periodRange;
  const isPeriodNote = periodRange === 'D' || periodRange === 'M' || periodRange === 'custom';
  const masthead = isPeriodNote
    ? t.progress.weeklyReview.period.masthead[periodRange]
    : `${t.progress.weeklyReview.masthead} ${props.weekStartOn ?? ''}`;

  return (
    <article
      role="article"
      aria-labelledby="weekly-review-masthead"
      // Task 4.3a R1 fix H6/M1: aria-live announces review content to SR
      // users when the Suspense boundary resolves (skeleton → article).
      aria-live="polite"
      data-testid={`weekly-review-${props.variant}`}
      style={{
        border: isFull ? '1px solid var(--color-rule-strong)' : 'none',
        background: isFull ? 'var(--color-bg-1)' : 'var(--color-bg-quote)',
        padding: isFull ? 'var(--spacing-12) var(--spacing-8)' : 'var(--spacing-6)',
        borderLeft: isFull
          ? '1px solid var(--color-rule-strong)'
          : '2px solid var(--color-oxblood)',
        borderRadius: 'var(--radius-card)',
        gridColumn: isFull ? '1 / -1' : undefined,
      }}
    >
      <p
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-oxblood-soft)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        {isPeriodNote ? t.progress.weeklyReview.period.kicker : t.progress.weeklyReview.kicker}
      </p>
      <h2
        id="weekly-review-masthead"
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: isFull ? 28 : 20,
          letterSpacing: '-0.01em',
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 16,
        }}
      >
        {masthead}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: isFull ? 'normal' : 'italic',
          fontWeight: 400,
          fontSize: isFull ? 24 : 18,
          lineHeight: 1.5,
          color: 'var(--color-ivory)',
          maxWidth: isFull ? '68ch' : '72ch',
          margin: 0,
        }}
      >
        {isFull && !isPeriodNote && firstChar ? (
          <>
            {/*
             * Decorative 82px ember drop cap. `aria-hidden="true"` keeps
             * it out of the AOM — screen readers read the full sentence
             * from `body` via the aria-labelledby on the outer article.
             * The `weekly-review-drop-cap` class applies the 120ms delay
             * fade-in keyframes so the letter "lands last" after the
             * body paragraph resolves (Task 4.3a R1 fix H5).
             *
             * IMPORTANT: We render {body} in full (not {rest}) so there's
             * no sr-only duplicate of firstChar causing SR double-read.
             * The visible span is aria-hidden=true and positioned to
             * overlay the first letter of the body text (float:left).
             * Screen readers receive body as the complete paragraph.
             */}
            <span
              aria-hidden="true"
              data-testid="weekly-review-drop-cap"
              className="weekly-review-drop-cap"
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                fontSize: 82,
                lineHeight: 0.85,
                color: 'var(--color-ember)',
                float: 'left',
                marginRight: 8,
                marginTop: 4,
              }}
            >
              {firstChar}
            </span>
            {body}
          </>
        ) : (
          body
        )}
      </p>
      {props.insights.bullets && props.insights.bullets.length > 0 ? (
        <ul
          style={{
            marginTop: 32,
            padding: 0,
            listStyle: 'none',
          }}
          data-testid="weekly-review-bullets"
        >
          {props.insights.bullets.map((b, i) => (
            <li
              key={i}
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--color-ivory)',
                paddingLeft: 24,
                position: 'relative',
                marginBottom: 8,
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
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      {isFull && (props.generatedAt || props.expiresAt) ? (
        <p
          style={{
            marginTop: 24,
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--color-dust)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {props.generatedAt
            ? `${t.progress.weeklyReview.footerPrefix} ${props.generatedAt.slice(0, 16).replace('T', ' ')} · ${t.progress.weeklyReview.footerMid}`
            : t.progress.weeklyReview.footerMid}
          {props.expiresAt
            ? ` · ${t.progress.weeklyReview.footerSuffix} ${props.expiresAt.slice(0, 10)}`
            : ''}
        </p>
      ) : null}
    </article>
  );
}

function SparseState(props: {
  variant: WeeklyReviewVariant;
  loggedDays: ReadonlyArray<{ date: string; summary: string }>;
  periodRange?: PeriodReviewRange | undefined;
}) {
  const isFull = props.variant === 'full';
  const periodSparse =
    props.periodRange === 'D' || props.periodRange === 'M' || props.periodRange === 'custom'
      ? t.progress.weeklyReview.period.sparse[props.periodRange]
      : null;
  return (
    <article
      role="article"
      aria-labelledby="weekly-review-sparse-kicker"
      data-testid={`weekly-review-sparse-${props.variant}`}
      style={{
        border: isFull ? '1px solid var(--color-rule-strong)' : 'none',
        background: isFull ? 'var(--color-bg-1)' : 'var(--color-bg-quote)',
        padding: isFull ? 'var(--spacing-12) var(--spacing-8)' : 'var(--spacing-6)',
        borderLeft: isFull
          ? '1px solid var(--color-rule-strong)'
          : '2px solid var(--color-oxblood)',
        borderRadius: 'var(--radius-card)',
        gridColumn: isFull ? '1 / -1' : undefined,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 12,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-ivory)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        <span id="weekly-review-sparse-kicker">
          {periodSparse?.kickerLabel ?? t.progress.weeklyReview.sparse.kickerLabel}
        </span>
        {' · '}
        <span
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 18,
            textTransform: 'none',
            letterSpacing: '0',
            color: 'var(--color-sand)',
          }}
        >
          {periodSparse?.body ?? t.progress.weeklyReview.sparse.body}
        </span>
      </p>
      {props.loggedDays.length > 0 ? (
        <ul
          style={{
            padding: 0,
            listStyle: 'none',
            marginTop: 24,
          }}
          data-testid="weekly-review-sparse-bullets"
        >
          {props.loggedDays.map((d) => (
            <li
              key={d.date}
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--color-ivory)',
                paddingLeft: 24,
                position: 'relative',
                marginBottom: 6,
              }}
            >
              <span
                aria-hidden="true"
                style={{ position: 'absolute', left: 0, color: 'var(--color-oxblood)' }}
              >
                —
              </span>
              {d.date}: {d.summary}
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--color-sand)',
            marginTop: 16,
          }}
        >
          {periodSparse?.emptyDaysBody ?? t.progress.weeklyReview.sparse.emptyDaysBody}
        </p>
      )}
    </article>
  );
}

function ErrorState(props: { variant: WeeklyReviewVariant }) {
  const isFull = props.variant === 'full';
  return (
    <article
      role="alert"
      data-testid={`weekly-review-error-${props.variant}`}
      style={{
        border: isFull ? '1px solid var(--color-rule-strong)' : 'none',
        background: isFull ? 'var(--color-bg-1)' : 'var(--color-bg-quote)',
        padding: isFull ? 'var(--spacing-12) var(--spacing-8)' : 'var(--spacing-6)',
        borderLeft: isFull
          ? '1px solid var(--color-rule-strong)'
          : '2px solid var(--color-oxblood)',
        gridColumn: isFull ? '1 / -1' : undefined,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: isFull ? 18 : 14,
          color: 'var(--color-error-text)',
          margin: 0,
        }}
      >
        {t.progress.weeklyReview.error.body}
      </p>
    </article>
  );
}
