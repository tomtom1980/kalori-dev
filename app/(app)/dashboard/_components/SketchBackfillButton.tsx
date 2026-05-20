'use client';

/**
 * `<SketchBackfillButton />` — Bug 5 (library overhaul 2026-05-16).
 *
 * Minimal dashboard widget that POSTs to /api/library/sketch/backfill.
 * Renders only when `pendingCount > 0` (server-supplied via the page
 * RSC fetch). Click → loading → result counts. No autoplay, no polling
 * — single-shot per click, user-initiated.
 *
 * Cost ceiling: enforced server-side at 200 items per invocation. If
 * remaining > 0 after the response, the button rearms so the user can
 * drain the queue in batches.
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';

interface BackfillResponse {
  generated: number;
  failed: number;
  skipped: number;
  remaining: number;
  processedBatchSize: number;
}

export interface SketchBackfillButtonProps {
  /** Number of library items without a sketch yet. Hidden when 0. */
  initialPendingCount: number;
}

export function SketchBackfillButton({
  initialPendingCount,
}: SketchBackfillButtonProps): React.ReactElement | null {
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState<BackfillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pendingCount === 0 && !lastReport && !running) {
    return null;
  }

  const handleClick = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/library/sketch/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        setError('failed');
        return;
      }
      const body = (await res.json()) as BackfillResponse;
      setLastReport(body);
      setPendingCount(body.remaining);
    } catch {
      setError('failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section
      className="kalori-sketch-backfill"
      data-testid="sketch-backfill"
      aria-labelledby="sketch-backfill-heading"
    >
      <h2 id="sketch-backfill-heading" className="kalori-sketch-backfill-heading">
        {t.library.sketchBackfillTitle}
      </h2>
      <p className="kalori-sketch-backfill-status" data-testid="sketch-backfill-status">
        {pendingCount === 0
          ? t.library.sketchBackfillDone
          : t.library.sketchBackfillPending.replace('{N}', String(pendingCount))}
      </p>
      {lastReport ? (
        <p className="kalori-sketch-backfill-report" data-testid="sketch-backfill-report">
          {t.library.sketchBackfillReport
            .replace('{generated}', String(lastReport.generated))
            .replace('{failed}', String(lastReport.failed))
            .replace('{remaining}', String(lastReport.remaining))}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="kalori-sketch-backfill-error">
          {error}
        </p>
      ) : null}
      {pendingCount > 0 ? (
        <button
          type="button"
          className="kalori-library-pill"
          onClick={handleClick}
          disabled={running}
          aria-busy={running || undefined}
          data-testid="sketch-backfill-button"
        >
          {running ? t.library.sketchBackfillRunning : t.library.sketchBackfillButton}
        </button>
      ) : null}
    </section>
  );
}

export default SketchBackfillButton;
