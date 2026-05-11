/**
 * <WeeklyReviewSkeleton /> — Task 4.3a Suspense fallback for the progress
 * page weekly review island. Sized to the final content (~560px desktop /
 * 620px mobile) to avoid CLS. Shimmer via `skeleton-pulse` class; disabled
 * under reduced-motion (Task 4.3a R1 fix C9).
 */
export function WeeklyReviewSkeleton() {
  return (
    <section
      aria-hidden="true"
      role="status"
      aria-busy="true"
      data-testid="weekly-review-skeleton-island"
      style={{
        gridColumn: '1 / -1',
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: 'var(--spacing-12) var(--spacing-8)',
        minHeight: 560,
        borderRadius: 0,
      }}
    >
      <div
        className="skeleton-pulse"
        style={{ height: 12, width: 180, background: 'var(--color-bg-2)', marginBottom: 12 }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: 24,
          width: 320,
          background: 'var(--color-bg-2)',
          marginBottom: 24,
          animationDelay: '80ms',
        }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: 16,
          background: 'var(--color-bg-2)',
          marginBottom: 10,
          animationDelay: '160ms',
        }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: 16,
          width: '95%',
          background: 'var(--color-bg-2)',
          marginBottom: 10,
          animationDelay: '240ms',
        }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: 16,
          width: '82%',
          background: 'var(--color-bg-2)',
          marginBottom: 24,
          animationDelay: '320ms',
        }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          marginTop: 24,
        }}
      >
        <div
          className="skeleton-pulse"
          style={{
            height: 140,
            background: 'var(--color-bg-2)',
            animationDelay: '400ms',
          }}
        />
        <div
          className="skeleton-pulse"
          style={{
            height: 140,
            background: 'var(--color-bg-2)',
            animationDelay: '480ms',
          }}
        />
      </div>
    </section>
  );
}
