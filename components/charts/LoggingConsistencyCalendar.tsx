/**
 * <LoggingConsistencyCalendar /> — Task 4.3a logging consistency grid (RSC).
 *
 * Warm ivory→oxblood ramp (4 buckets). Per spec
 * `task-4.3a-ui-logging-consistency-spec.md`:
 *   - D range: 24 hourly cells in 1 row.
 *   - W range: 7 daily cells in 1 row.
 *   - M range: 5×6 packed grid (30 cells); bottom-right = today.
 * When zero logs in the entire range, the chart defers to a page-level
 * Editor's Note fallback (rendered by the page when `totalMealsInRange === 0`);
 * the chart itself renders a dimmed empty-grid state.
 */
import { t } from '@/lib/i18n/en';

import { ChartCard } from './ChartCard';
import { DataTableDrawer } from './DataTableDrawer';

import type { LoggingConsistencyData } from '@/lib/aggregations/progress';

export interface LoggingConsistencyCalendarProps {
  data: LoggingConsistencyData;
}

function bucketForCount(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

// Task 4.3a R1 (2026-04-24): hex literals retired in favour of tokens
// declared under @theme in `app/globals.css` (`--lcc-step-{0..3}`).
// Adjacent contrast retuned to ≥ 1.30:1 WCAG per ux-specialist §7.2.
const BUCKET_COLOR: Record<0 | 1 | 2 | 3, string> = {
  0: 'var(--lcc-step-0)',
  1: 'var(--lcc-step-1)',
  2: 'var(--lcc-step-2)',
  3: 'var(--lcc-step-3)',
};

export function LoggingConsistencyCalendar({ data }: LoggingConsistencyCalendarProps) {
  const { days, range, srSummary, totalMealsInRange } = data;
  const cols = range === 'D' ? 24 : range === 'W' ? 7 : 5;
  const cellSize = range === 'M' ? 40 : range === 'D' ? 28 : 56;

  return (
    <ChartCard
      id="progress-logging-consistency-heading"
      testid="chart-logging-consistency"
      kicker={t.progress.sections.trends.kicker}
      title={
        <>
          {t.progress.loggingConsistency.title}{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-sand)' }}>
            {t.progress.loggingConsistency.titleEm}
          </em>
        </>
      }
      subtitle={t.progress.sections.trends.subtitle}
      body={
        <>
          <span className="sr-only">{srSummary}</span>
          {totalMealsInRange === 0 ? (
            <p
              role="note"
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--color-error-text)',
                textAlign: 'center',
                margin: '24px 0',
              }}
              data-testid="chart-logging-consistency-empty"
            >
              {t.progress.loggingConsistency.emptyCopy}
            </p>
          ) : null}
          {/*
            Phase 7 regression fix (REG-1): the calendar uses a fixed-pixel
            grid (cellSize px × cols cols), which at W-range with cellSize 56
            demands ~404px — wider than a 343px mobile content track. Wrap in
            an `overflow-x: auto` + `max-width: 100%` container so the grid
            scrolls horizontally inside its constrained chart-card column
            instead of pushing the page wider.
          */}
          <div
            style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0 }}
            data-testid="lcc-grid-scroll"
          >
            <figure
              role="grid"
              aria-label={srSummary}
              data-testid="lcc-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
                gridAutoRows: `${cellSize}px`,
                gap: 2,
                margin: 0,
                justifyContent: 'start',
              }}
            >
              {chunkIntoRows(days, cols).map((row, rowIdx) => (
                <span key={rowIdx} role="row" style={{ display: 'contents' }}>
                  {row.map((d) => {
                    const bucket = bucketForCount(d.entryCount);
                    return (
                      <span
                        key={d.date}
                        role="gridcell"
                        aria-label={cellLabel(d)}
                        data-testid={`lcc-cell-${d.date}`}
                        data-bucket={bucket}
                        title={`${d.date}: ${d.entryCount} meal${d.entryCount === 1 ? '' : 's'}`}
                        style={{
                          background: BUCKET_COLOR[bucket],
                          border:
                            '1px solid color-mix(in srgb, var(--color-ivory) 12%, transparent)',
                        }}
                      />
                    );
                  })}
                </span>
              ))}
            </figure>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--color-dust)',
              marginTop: 14,
              marginBottom: 0,
            }}
          >
            {srSummary}
          </p>
          <DataTableDrawer
            summaryLabel="View as data table"
            caption={srSummary}
            columns={['Date', 'Logged', 'Entries']}
            rows={days.map((d) => ({
              cells: [d.date, d.logged ? 'yes' : '—', d.entryCount],
            }))}
          />
        </>
      }
    />
  );
}

function cellLabel(d: LoggingConsistencyData['days'][number]): string {
  if (d.entryCount === 0) return `${d.date}: not logged.`;
  return `${d.date}: ${d.entryCount} meal${d.entryCount === 1 ? '' : 's'} logged.`;
}

function chunkIntoRows<T>(items: readonly T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    rows.push(items.slice(i, i + cols) as T[]);
  }
  return rows;
}
