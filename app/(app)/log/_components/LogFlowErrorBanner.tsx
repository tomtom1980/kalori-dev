'use client';

/**
 * <LogFlowErrorBanner /> — Hoisted from ManualEntryFallback so it renders
 * ABOVE the active tab panel (style spec §9, ux-specialist critical #12).
 *
 * Mounts when `failureMode !== null`. Carries the 2px ember top rule +
 * bg-2 fill + italic Newsreader headline + link-styled TRY AGAIN.
 * Uses `role="alert"` + `aria-live="assertive"` so the banner announces
 * immediately on mount (compliance §12).
 */
import { useId } from 'react';

import { t } from '@/lib/i18n/en';
import { selectActiveTab, selectFailureMode, useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const HEADING_BY_TAB: Record<'type' | 'snap' | 'library', string> = {
  type: t.log.fallbackHeadingType,
  snap: t.log.fallbackHeadingSnap,
  library: t.log.fallbackHeadingLibrary,
};

export interface LogFlowErrorBannerProps {
  onRetry: () => void;
}

export function LogFlowErrorBanner({ onRetry }: LogFlowErrorBannerProps) {
  const activeTab = useLogFlowStore(selectActiveTab);
  const failureMode = useLogFlowStore(selectFailureMode);
  const headingId = useId();

  if (!failureMode) return null;

  const heading = HEADING_BY_TAB[activeTab];

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-labelledby={headingId}
      data-testid="log-flow-error-banner"
      className="kalori-log-error-banner"
    >
      <p
        id={headingId}
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: '14px',
          color: 'var(--color-ivory)',
          margin: 0,
        }}
      >
        {heading}
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="log-flow-error-retry"
        className="kalori-log-retry"
      >
        {t.log.fallbackRetryCTA}
      </button>
    </div>
  );
}

export default LogFlowErrorBanner;
