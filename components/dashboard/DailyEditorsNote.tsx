'use client';

import { useEffect, useMemo, useState } from 'react';

import { EditorsNote } from '@/components/charts/EditorsNote';
import { buildDailyEditorsNote } from '@/lib/dashboard/daily-editors-note';
import type { DashboardSnapshot } from '@/lib/dashboard/types';
import { t } from '@/lib/i18n/en';
import { useReducedMotion } from '@/lib/motion/defaults';

export interface DailyEditorsNoteProps {
  snapshot: DashboardSnapshot;
  viewedDay: string;
  aiSummaryOptIn?: boolean;
}

interface SummaryPayload {
  body_markdown: string;
  bullets?: string[];
  caveats?: string[];
  source?: 'ai' | 'cache' | 'fallback';
}

interface SummaryState {
  summary: SummaryPayload | null;
  key: string | null;
  errorKey: string | null;
}

function DailyEditorsNoteSkeleton() {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label={`${t.dashboard.dailyEditorsNote.kicker}. ${t.dashboard.dailyEditorsNote.updating}`}
      data-testid="daily-editors-note"
      style={{
        paddingTop: 'var(--spacing-6)',
        marginTop: 'var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-3)',
      }}
    >
      <div
        data-testid="daily-editors-note-skeleton"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-3)',
        }}
      >
        <div
          className="skeleton-pulse"
          style={{ height: 12, width: 168, background: 'var(--color-bg-2)' }}
        />
        <div
          className="skeleton-pulse"
          style={{
            height: 22,
            width: 'min(100%, 520px)',
            background: 'var(--color-bg-2)',
            animationDelay: '80ms',
          }}
        />
        <div
          className="skeleton-pulse"
          style={{
            height: 16,
            width: 'min(88%, 440px)',
            background: 'var(--color-bg-2)',
            animationDelay: '160ms',
          }}
        />
      </div>
    </section>
  );
}

function clientId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && 'randomUUID' in cryptoRef) return cryptoRef.randomUUID();
  return `nutrition-summary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function AiSummaryFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      role="alert"
      data-testid="daily-editors-note-ai-failed"
      style={{
        paddingTop: 'var(--spacing-6)',
        marginTop: 'var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-3)',
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
        }}
      >
        {t.dashboard.dailyEditorsNote.aiFailedTitle}
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
        {t.dashboard.dailyEditorsNote.aiFailedBody}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          alignSelf: 'flex-start',
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
        {t.dashboard.dailyEditorsNote.retryAiSummary}
      </button>
    </section>
  );
}

export function DailyEditorsNote({
  snapshot,
  viewedDay,
  aiSummaryOptIn = false,
}: DailyEditorsNoteProps) {
  const fallback = useMemo(() => buildDailyEditorsNote(snapshot, viewedDay), [snapshot, viewedDay]);
  const fallbackSummary = useMemo<SummaryPayload>(
    () => ({
      body_markdown: fallback.body,
      bullets: fallback.bullets,
      caveats: [],
      source: 'fallback',
    }),
    [fallback],
  );
  const dataKey = useMemo(() => JSON.stringify({ viewedDay, snapshot }), [snapshot, viewedDay]);
  const [state, setState] = useState<SummaryState>({
    summary: null,
    key: null,
    errorKey: null,
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const reducedMotion = useReducedMotion();
  const summary = state.summary;
  const hasError = state.errorKey === dataKey;
  const isLoading = state.key !== dataKey && !hasError;
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
        scope: 'dashboard-day',
        day: viewedDay,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`nutrition-summary ${res.status}`);
        return (await res.json()) as SummaryPayload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setState({ summary: payload, key: dataKey, errorKey: null });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((prev) => ({ summary: prev.summary, key: dataKey, errorKey: dataKey }));
        }
      });
    return () => controller.abort();
  }, [viewedDay, dataKey, aiSummaryOptIn, retryNonce]);

  if (!aiSummaryOptIn) {
    return (
      <EditorsNote
        kicker={t.dashboard.dailyEditorsNote.kicker}
        body={fallbackSummary.body_markdown}
        bullets={fallbackSummary.bullets ?? []}
        testid="daily-editors-note"
      />
    );
  }

  if (!summary && hasError) return <AiSummaryFailed onRetry={retry} />;
  if (!summary) return <DailyEditorsNoteSkeleton />;

  const bullets = [...(summary.bullets ?? []), ...(summary.caveats ?? [])];

  return (
    <div
      data-testid="daily-editors-note-ai"
      aria-busy={isLoading ? 'true' : 'false'}
      style={{
        opacity: isLoading ? 0.78 : 1,
        transition: reducedMotion ? 'none' : 'opacity 160ms ease',
      }}
    >
      <EditorsNote
        kicker={t.dashboard.dailyEditorsNote.kicker}
        body={summary.body_markdown}
        bullets={bullets}
        testid="daily-editors-note"
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
          {t.dashboard.dailyEditorsNote.updating}
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
            {t.dashboard.dailyEditorsNote.aiFailedTitle}
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
            {t.dashboard.dailyEditorsNote.retryAiSummary}
          </button>
        </div>
      ) : null}
    </div>
  );
}
