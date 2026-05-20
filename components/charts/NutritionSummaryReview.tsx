'use client';

import { useEffect, useMemo, useState } from 'react';

import { WeeklyReviewCore } from '@/components/charts/WeeklyReviewCore';
import { WeeklyReviewSkeleton } from '@/components/charts/WeeklyReviewSkeleton';
import { t } from '@/lib/i18n/en';
import { useReducedMotion } from '@/lib/motion/defaults';

export interface NutritionSummaryReviewProps {
  range: {
    preset: 'last_7' | 'last_30' | 'custom';
    start_on: string;
    end_on: string;
  };
  aiSummaryOptIn?: boolean;
}

interface SummaryPayload {
  body_markdown: string;
  bullets?: string[];
  caveats?: string[];
  generated_at?: string;
  data_fingerprint?: string;
  source?: 'ai' | 'cache' | 'fallback';
}

interface SummaryState {
  summary: SummaryPayload | null;
  key: string | null;
  errorKey: string | null;
}

function clientId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && 'randomUUID' in cryptoRef) return cryptoRef.randomUUID();
  return `nutrition-summary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function AiSummaryFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <article
      role="alert"
      data-testid="nutrition-summary-review-failed"
      style={{
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: 'var(--spacing-12) var(--spacing-8)',
        borderRadius: 'var(--radius-card)',
        gridColumn: '1 / -1',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-error-text)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        {t.progress.weeklyReview.aiFailedTitle}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 18,
          lineHeight: 1.55,
          color: 'var(--color-sand)',
          margin: 0,
          maxWidth: '60ch',
        }}
      >
        {t.progress.weeklyReview.aiFailedBody}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 16,
          border: '1px solid var(--color-rule-strong)',
          background: 'var(--color-bg-1)',
          color: 'var(--color-ivory)',
          borderRadius: 'var(--radius-control)',
          padding: 'var(--spacing-2) var(--spacing-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        {t.progress.weeklyReview.retryAiSummary}
      </button>
    </article>
  );
}

export function NutritionSummaryReview({
  range,
  aiSummaryOptIn = false,
}: NutritionSummaryReviewProps) {
  const requestKey = useMemo(() => JSON.stringify(range), [range]);
  const [state, setState] = useState<SummaryState>({
    summary: null,
    key: null,
    errorKey: null,
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const summary = state.summary;
  const reducedMotion = useReducedMotion();
  const hasError = state.errorKey === requestKey;
  const isLoading = aiSummaryOptIn && state.key !== requestKey && !hasError;
  const retry = () => {
    setState((prev) => ({ ...prev, key: null, errorKey: null }));
    setRetryNonce((value) => value + 1);
  };

  useEffect(() => {
    if (!aiSummaryOptIn) return;
    const controller = new AbortController();
    fetch('/api/ai/nutrition-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        scope: 'progress-range',
        range,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`nutrition-summary ${res.status}`);
        return (await res.json()) as SummaryPayload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setState({ summary: payload, key: requestKey, errorKey: null });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((prev) => ({ summary: prev.summary, key: requestKey, errorKey: requestKey }));
        }
      });
    return () => controller.abort();
  }, [requestKey, range, aiSummaryOptIn, retryNonce]);

  const renderedSummary: SummaryPayload | null =
    aiSummaryOptIn || summary
      ? summary
      : {
          body_markdown: t.progress.weeklyReview.summaryFallback.body,
          bullets: [t.progress.weeklyReview.summaryFallback.nextAction],
          caveats: [],
          source: 'fallback' as const,
        };

  if (!renderedSummary && hasError) return <AiSummaryFailed onRetry={retry} />;
  if (!renderedSummary) return <WeeklyReviewSkeleton />;

  return (
    <div
      aria-busy={isLoading ? 'true' : 'false'}
      data-testid="nutrition-summary-review"
      style={{
        gridColumn: '1 / -1',
        opacity: isLoading ? 0.78 : 1,
        transition: reducedMotion ? 'none' : 'opacity 160ms ease',
      }}
    >
      <WeeklyReviewCore
        variant="full"
        status="fresh"
        insights={{
          body_markdown: renderedSummary.body_markdown,
          bullets: [...(renderedSummary.bullets ?? []), ...(renderedSummary.caveats ?? [])],
          sparse_data: false,
        }}
        generatedAt={renderedSummary.generated_at ?? null}
        periodRange={
          range.preset === 'last_7' ? undefined : range.preset === 'custom' ? 'custom' : 'M'
        }
      />
      {isLoading ? (
        <p
          style={{
            margin: 'var(--spacing-2) 0 0',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--color-dust)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {t.progress.weeklyReview.updating}
        </p>
      ) : null}
      {!isLoading && hasError ? (
        <div
          role="alert"
          style={{
            marginTop: 'var(--spacing-2)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--color-error-text)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {t.progress.weeklyReview.aiFailedTitle}
          </span>
          <button
            type="button"
            onClick={retry}
            style={{
              border: '1px solid var(--color-rule-strong)',
              background: 'var(--color-bg-1)',
              color: 'var(--color-ivory)',
              borderRadius: 'var(--radius-control)',
              padding: 'var(--spacing-1) var(--spacing-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            {t.progress.weeklyReview.retryAiSummary}
          </button>
        </div>
      ) : null}
    </div>
  );
}
