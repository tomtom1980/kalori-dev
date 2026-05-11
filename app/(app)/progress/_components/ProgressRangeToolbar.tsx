/**
 * <ProgressRangeToolbar /> — Task 4.3a D/W/M URL-synced tablist (client).
 *
 * Three chips `day. week. month.` (lowercase italic serif). Active chip
 * renders inverted (ivory bg + bg-0 fg). URL is the single source of truth
 * (`?range=D|W|M`) — chip click uses `router.replace` with `scroll={false}`
 * so the Next 16 App Router re-segments the page without reloading the
 * static shell or losing scroll position.
 *
 * WAI-ARIA tablist with arrow-key nav (activate-on-focus). Roving tabindex:
 * only the active chip has tabindex=0; others are -1 and reachable via
 * ArrowLeft/Right with wrap. Focus ring = 2px oxblood outline + 1px ivory
 * inset (Task 4.2 R1 pattern). Touch target ≥ 44px via min-height.
 *
 * NOT Zustand (tiebreaker #17 per briefing §5); NOT React Context; URL
 * param is the authoritative state.
 */
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';

import { t } from '@/lib/i18n/en';

export type RangeSlug = 'D' | 'W' | 'M';

const ORDER: readonly RangeSlug[] = ['D', 'W', 'M'] as const;

export interface ProgressRangeToolbarProps {
  active: RangeSlug;
  windowLabel?: string;
}

export function ProgressRangeToolbar({ active, windowLabel }: ProgressRangeToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const refs = useRef<Record<RangeSlug, HTMLAnchorElement | null>>({
    D: null,
    W: null,
    M: null,
  });

  const hrefFor = useMemo(
    () =>
      (slug: RangeSlug): string => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('range', slug);
        return `${pathname}?${params.toString()}`;
      },
    [pathname, searchParams],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>, current: RangeSlug) => {
      const idx = ORDER.indexOf(current);
      let nextIdx = idx;
      if (event.key === 'ArrowRight') {
        nextIdx = (idx + 1) % ORDER.length;
      } else if (event.key === 'ArrowLeft') {
        nextIdx = (idx - 1 + ORDER.length) % ORDER.length;
      } else if (event.key === 'Home') {
        nextIdx = 0;
      } else if (event.key === 'End') {
        nextIdx = ORDER.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const target = ORDER[nextIdx]!;
      refs.current[target]?.focus();
      // Activate-on-focus — commit URL immediately. `scroll={false}` prevents
      // jump-to-top; `replace` avoids history pollution (back should exit
      // /progress, not cycle ranges).
      router.replace(hrefFor(target), { scroll: false });
    },
    [router, hrefFor],
  );

  return (
    <nav
      role="tablist"
      aria-label={t.progress.toolbar.ariaLabel}
      data-testid="progress-range-toolbar"
      className="progress-range-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-6)',
        padding: 'var(--spacing-4) var(--spacing-4)',
        // Phase 7 regression fix (REG-1): kicker + 3 chips + window-label
        // demands ~412px min-content — wider than a 343px mobile content
        // track. Allow horizontal wrap so the row breaks gracefully on
        // narrow viewports instead of pushing the page wider.
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-oxblood-soft)',
        }}
      >
        {t.progress.toolbar.kicker}
      </span>
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-1)',
          flex: '1 1 auto',
        }}
      >
        {ORDER.map((slug) => {
          const isActive = slug === active;
          return (
            <a
              key={slug}
              ref={(el) => {
                refs.current[slug] = el;
              }}
              role="tab"
              aria-selected={isActive}
              aria-label={
                slug === 'D'
                  ? t.progress.toolbar.ariaDescD
                  : slug === 'W'
                    ? t.progress.toolbar.ariaDescW
                    : t.progress.toolbar.ariaDescM
              }
              tabIndex={isActive ? 0 : -1}
              // @nav-audit href: /progress
              href={hrefFor(slug)}
              onKeyDown={(e) => onKeyDown(e, slug)}
              onClick={(e) => {
                // SPA transition — use router.replace so scroll/history
                // stay clean. Click the underlying anchor only as keyboard
                // fallback if JS fails.
                e.preventDefault();
                router.replace(hrefFor(slug), { scroll: false });
              }}
              data-testid={`progress-range-chip-${slug}`}
              className="chip"
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 15,
                lineHeight: 1.2,
                padding: '10px 22px',
                minHeight: 44,
                minWidth: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                border: `1px solid ${isActive ? 'var(--color-ivory)' : 'var(--color-rule)'}`,
                background: isActive ? 'var(--color-ivory)' : 'transparent',
                color: isActive ? 'var(--color-bg-0)' : 'var(--color-sand)',
                borderRadius: 0,
                transition:
                  'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
              }}
            >
              {slug === 'D'
                ? t.progress.toolbar.labels.D
                : slug === 'W'
                  ? t.progress.toolbar.labels.W
                  : t.progress.toolbar.labels.M}
            </a>
          );
        })}
      </div>
      {windowLabel ? (
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--color-dust)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
          data-testid="progress-range-window-label"
        >
          {windowLabel}
        </span>
      ) : null}
    </nav>
  );
}
