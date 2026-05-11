/**
 * <ChartSkeleton /> — Task 4.3a shared skeleton fallback for chart Suspense
 * boundaries. Sized to prevent CLS; shimmer disabled under reduced-motion.
 */
import type { CSSProperties } from 'react';

export interface ChartSkeletonProps {
  kind:
    | 'calorie-adherence'
    | 'macro-distribution'
    | 'heatmap'
    | 'trend-summary'
    | 'logging-consistency';
  fullWidth?: boolean;
}

const MIN_HEIGHT: Record<ChartSkeletonProps['kind'], number> = {
  'calorie-adherence': 340,
  'macro-distribution': 340,
  heatmap: 460,
  'trend-summary': 240,
  'logging-consistency': 320,
};

export function ChartSkeleton({ kind, fullWidth }: ChartSkeletonProps) {
  const minHeight = MIN_HEIGHT[kind];
  const shellStyle: CSSProperties = {
    gridColumn: fullWidth ? '1 / -1' : 'auto',
    border: '1px solid var(--color-rule-strong)',
    background: 'var(--color-bg-1)',
    padding: 'var(--spacing-6)',
    minHeight,
    borderRadius: 0,
    boxShadow: 'none',
  };
  return (
    <section
      aria-hidden="true"
      role="status"
      aria-busy="true"
      data-testid={`chart-skeleton-${kind}`}
      style={shellStyle}
    >
      <div
        className="skeleton-pulse"
        style={{
          height: 14,
          width: '40%',
          background: 'var(--color-bg-2)',
          marginBottom: 10,
        }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: 10,
          width: '25%',
          background: 'var(--color-bg-2)',
          marginBottom: 24,
          animationDelay: '100ms',
        }}
      />
      <div
        className="skeleton-pulse"
        style={{
          height: minHeight - 140,
          background: 'var(--color-bg-2)',
          animationDelay: '200ms',
        }}
      />
    </section>
  );
}
