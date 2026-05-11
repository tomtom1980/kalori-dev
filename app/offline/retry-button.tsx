'use client';

/**
 * Task 5.1.2 — Retry button island for the offline fallback page.
 *
 * Pure client component — the only piece of JS the offline page ships beyond
 * the static RSC tree. Clicking reloads the page; the SW will then attempt
 * the navigation again and either serve the live page or re-display this
 * offline shell.
 *
 * Aria contract (per ux-specialist §H.4):
 *   - aria-label="Retry loading this page" (factual; the visible label "Retry"
 *     is short for layout reasons, but screen readers get the full sentence).
 *   - 44×44 minimum tap target.
 */
import { useCallback } from 'react';

import { t } from '@/lib/i18n/en';

export function OfflineRetryButton() {
  const onClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.offline.retryAria}
      // F-PWA-3: `touch-manipulation` (CSS `touch-action: manipulation`)
      // suppresses the legacy 300ms tap delay on iOS Safari and Chrome
      // mobile, keeping the retry tap snappy. TODO(future sweep): apply
      // the same property to the rest of the primary CTAs (install
      // banner, save buttons, modal confirms) once those land — tracked
      // as a broader UX polish task, not part of this surgical fix.
      className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center border border-[color-mix(in_srgb,var(--color-ivory)_18%,transparent)] px-6 py-3 text-[10.5px] font-[var(--font-inter)] font-medium tracking-[0.22em] text-[var(--color-ivory)] uppercase hover:border-[var(--color-ivory)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ivory)]"
    >
      {t.offline.retryLabel}
    </button>
  );
}
