'use client';

/**
 * <LibraryLoadingSkeleton /> — match-to-shape placeholder for the library
 * list during initial hydration. Renders 8 rows that mirror the final
 * row anatomy (thumb + name bar + macros + kcal). Variable per-row width
 * is derived from index so the visual pattern is stable across renders.
 *
 * Uses the project-standard `.skeleton-pulse` class for the opacity-only
 * shimmer animation. That class is already gated by both
 * `prefers-reduced-motion: reduce` and `html[data-reduce-motion='1']`
 * (Settings toggle) in `app/globals.css`.
 */
import { t } from '@/lib/i18n/en';

const ROW_WIDTHS = [82, 67, 91, 74, 88, 62, 95, 70] as const;

export interface LibraryLoadingSkeletonProps {
  rowCount?: number;
}

export function LibraryLoadingSkeleton({ rowCount = 8 }: LibraryLoadingSkeletonProps) {
  return (
    <ul
      data-testid="library-skeleton"
      aria-busy="true"
      aria-label={t.log.loadingLibraryA11y}
      className="kalori-library-skeleton"
    >
      {Array.from({ length: rowCount }, (_, i) => (
        <li
          key={i}
          data-testid={`library-skeleton-row-${i}`}
          className="kalori-library-skeleton-row"
        >
          <div className="kalori-library-skeleton-thumb skeleton-pulse" aria-hidden="true" />
          <div className="kalori-library-skeleton-content">
            <div
              data-testid={`library-skeleton-name-${i}`}
              className="kalori-library-skeleton-name skeleton-pulse"
              style={{ width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%` }}
              aria-hidden="true"
            />
            <div className="kalori-library-skeleton-macros" aria-hidden="true">
              <span className="kalori-library-skeleton-macro skeleton-pulse" />
              <span className="kalori-library-skeleton-macro skeleton-pulse" />
              <span className="kalori-library-skeleton-macro skeleton-pulse" />
            </div>
          </div>
          <div className="kalori-library-skeleton-kcal skeleton-pulse" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export default LibraryLoadingSkeleton;
