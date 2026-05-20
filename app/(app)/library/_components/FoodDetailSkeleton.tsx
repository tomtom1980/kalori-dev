/**
 * `<FoodDetailSkeleton />` — Bug 2 (library overhaul 2026-05-16).
 *
 * Route-level loading shell for `/library/[id]`. Mirrors the surface
 * contract of `<FoodDetail />`:
 *   - top-bar (56px),
 *   - hero thumbnail (4:3 mobile / 320x240 desktop),
 *   - name + portion bars,
 *   - macro rows (Inter UPPERCASE label + Mono value + bar),
 *   - history rows,
 *   - actions strip placeholder.
 *
 * Implementation contract (ChartSkeleton precedent):
 *   - `role="status"` + `aria-busy="true"` so AT announces "Loading".
 *   - NO `aria-hidden` (would suppress the SR announcement — see Bug 2
 *     Open Question 1).
 *   - `.skeleton-pulse` placeholders use the existing keyframe + reduced-
 *     motion suppression (`app/globals.css` line 420 + 612-619).
 *
 * Used by `app/(app)/library/[id]/loading.tsx` (route open leg) and
 * `app/(app)/library/loading.tsx` (route close leg, paged grid skeleton).
 */
import type { CSSProperties } from 'react';

import { t } from '@/lib/i18n/en';

const placeholderBg: CSSProperties = { background: 'var(--color-bg-2)' };

export function FoodDetailSkeleton() {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label={t.library.loadingDetail}
      data-testid="food-detail-skeleton"
      className="kalori-fd-sheet-wrap"
      data-mode="route"
    >
      <div className="kalori-fd-sheet" data-skeleton="true">
        {/* Top bar */}
        <div className="skeleton-pulse" style={{ ...placeholderBg, height: 56, width: '100%' }} />
        {/* Body */}
        <div className="kalori-fd-body">
          {/* Hero thumbnail (240px desktop / 4:3 mobile) */}
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 240, animationDelay: '100ms' }}
          />
          {/* Name (32px h1 row) */}
          <div
            className="skeleton-pulse"
            style={{
              ...placeholderBg,
              height: 32,
              width: '60%',
              animationDelay: '200ms',
            }}
          />
          {/* Portion (16px) */}
          <div
            className="skeleton-pulse"
            style={{
              ...placeholderBg,
              height: 16,
              width: '30%',
              animationDelay: '250ms',
            }}
          />
          {/* Kcal frame placeholder */}
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 120, animationDelay: '300ms' }}
          />
          {/* 4 macro rows */}
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 24, animationDelay: '350ms' }}
          />
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 24, animationDelay: '400ms' }}
          />
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 24, animationDelay: '450ms' }}
          />
          <div
            className="skeleton-pulse"
            style={{ ...placeholderBg, height: 24, animationDelay: '500ms' }}
          />
          {/* History strip */}
          <div
            className="skeleton-pulse"
            style={{
              ...placeholderBg,
              height: 60,
              marginTop: 'var(--spacing-6)',
              animationDelay: '550ms',
            }}
          />
        </div>
        {/* Actions strip */}
        <div
          className="skeleton-pulse"
          style={{ ...placeholderBg, height: 64, animationDelay: '600ms' }}
        />
      </div>
    </section>
  );
}

/**
 * `<LibraryGridSkeleton />` — Bug 2 close-leg skeleton for `/library`.
 * Renders the 10-card paged grid shape so the return-from-detail
 * navigation has a stable silhouette while the RSC re-fetches.
 */
export function LibraryGridSkeleton() {
  const cells = Array.from({ length: 6 }, (_, i) => i);
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label={t.library.loadingGrid}
      data-testid="library-grid-skeleton"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 'var(--spacing-3)',
        padding: 'var(--spacing-6)',
      }}
    >
      {cells.map((i) => (
        <div
          key={i}
          className="skeleton-pulse"
          style={{
            ...placeholderBg,
            minHeight: 240,
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </section>
  );
}
