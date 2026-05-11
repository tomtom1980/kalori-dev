/**
 * <WeeklyInsightSkeleton /> — Task 3.5 shell placeholder for Task 4.3a.
 *
 * Static RSC. Renders a shimmer-ready frame with the kicker + italic
 * caption "the weekly compass · generates each Sunday night". Task 4.3a
 * replaces this with a real island that reads from `weekly_reviews`.
 *
 * No shimmer animation for 3.5 — the `--motion-shimmer` keyframe would
 * require a new `@keyframes` declaration in globals.css (out of scope for
 * 3.5 surgical changes). A static skeleton is functionally equivalent for
 * the PPR fallback.
 */
import { t } from '@/lib/i18n/en';

export function WeeklyInsightSkeleton() {
  return (
    <section
      data-testid="weekly-insight-skeleton"
      aria-labelledby="weekly-insight-heading"
      className="skeleton-shimmer"
      style={{
        border: '1px solid var(--color-rule-strong)',
        padding: 'var(--spacing-6)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <p
        aria-hidden="true"
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
        {t.dashboard.insight.weeklyKicker}
      </p>
      <h2
        id="weekly-insight-heading"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          fontWeight: 300,
          color: 'var(--color-ivory)',
          margin: 0,
          marginTop: 'var(--spacing-2)',
        }}
      >
        {t.dashboard.insight.weeklyTitle}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--color-sand)',
          margin: 0,
          marginTop: 'var(--spacing-2)',
        }}
      >
        {t.dashboard.insight.weeklySkeletonLine1}
      </p>
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
        {t.dashboard.insight.weeklySkeletonLine2}
      </p>
    </section>
  );
}

export default WeeklyInsightSkeleton;
