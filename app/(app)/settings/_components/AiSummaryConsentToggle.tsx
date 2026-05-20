'use client';

import { useCallback, useState, useTransition } from 'react';
import type { CSSProperties } from 'react';

import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import { mintClientId } from '@/lib/water/client-id';

interface AiSummaryConsentToggleProps {
  enabled: boolean;
}

export function AiSummaryConsentToggle({
  enabled,
}: AiSummaryConsentToggleProps): React.ReactElement {
  const [checked, setChecked] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const descriptionId = 'kalori-ai-summary-consent-description';

  const onToggle = useCallback(() => {
    const next = !checked;
    setChecked(next);
    setError(false);
    startTransition(() => {
      void (async () => {
        try {
          await authPost('/api/profile/save', {
            client_id: mintClientId(),
            patch: { ai_summary_opt_in: next },
          });
        } catch (err) {
          if (err instanceof SessionExpiredError) return;
          setChecked(!next);
          setError(true);
        }
      })();
    });
  }, [checked]);

  return (
    <div
      data-testid="ai-summary-consent-toggle"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 0',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={isPending ? 'true' : undefined}
        aria-describedby={descriptionId}
        onClick={onToggle}
        disabled={isPending}
        style={{
          width: '44px',
          minWidth: '44px',
          height: '24px',
          borderRadius: 'var(--radius-pill)',
          background: checked ? 'var(--color-oxblood)' : 'transparent',
          border: '1px solid var(--color-rule-strong)',
          cursor: isPending ? 'wait' : 'pointer',
          padding: 0,
          position: 'relative',
          flexShrink: 0,
          marginTop: '2px',
          opacity: isPending ? 0.74 : 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            position: 'absolute',
            top: '3px',
            left: checked ? '23px' : '3px',
            width: '16px',
            height: '16px',
            background: checked ? 'var(--color-ivory)' : 'var(--color-dust)',
          }}
        />
        <span style={visuallyHidden}>{t.settings.aiSummary.label}</span>
      </button>
      <div style={{ flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 'var(--type-body-sm)',
            color: 'var(--color-ivory)',
            marginBottom: '4px',
          }}
        >
          {t.settings.aiSummary.label}
        </span>
        <p
          id={descriptionId}
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-mono)',
            color: 'var(--color-sand)',
            lineHeight: 1.5,
          }}
        >
          {t.settings.aiSummary.description}
        </p>
        {error ? (
          <p role="alert" style={{ margin: '6px 0 0', color: 'var(--color-error-text)' }}>
            {t.settings.aiSummary.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default AiSummaryConsentToggle;
