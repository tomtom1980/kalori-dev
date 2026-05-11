/**
 * <CalorieAdherenceBar /> — Task 4.3a calorie adherence bar chart (RSC).
 *
 * Bespoke SVG (no Recharts — saves ~40KB bundle). Per bar:
 *   - oxblood when adherenceClass = 'over'
 *   - moss when 'on-target'
 *   - ember when 'under' but >=50% (approaching)
 *   - dust when 'empty'
 * Target line rendered as dashed ivory 1px at 40% opacity.
 *
 * Accessibility: role="img" + aria-label with headline stat; sr-only
 * summary; `<details>` data-table drawer; sparse banner uses
 * `var(--color-error-text)` (Task 4.2 R1 consolidation).
 */
import { t } from '@/lib/i18n/en';

import { ChartCard } from './ChartCard';
import { DataTableDrawer } from './DataTableDrawer';

import type { CalorieAdherenceData } from '@/lib/aggregations/progress';

export interface CalorieAdherenceBarProps {
  data: CalorieAdherenceData;
}

const CHART_HEIGHT = 220;
const BAR_GAP = 4;

export function CalorieAdherenceBar({ data }: CalorieAdherenceBarProps) {
  const { points, sparse, range, srSummary } = data;
  const target = points[0]?.kcalTarget ?? 2000;
  const barCount = points.length;
  // Scale so bars at 1.2 × target reach chart top (i.e., maxY = target × 1.2).
  const maxY = target * 1.2;
  const barWidth =
    barCount > 0 ? `calc((100% - ${(barCount - 1) * BAR_GAP}px) / ${barCount})` : '0';
  const targetY = CHART_HEIGHT - (target / maxY) * CHART_HEIGHT;

  return (
    <ChartCard
      id="progress-calorie-adherence-heading"
      testid="chart-calorie-adherence"
      kicker={t.progress.sections.adherence.kicker}
      title={
        <span>
          {t.progress.calorieAdherence.title}{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--color-sand)' }}>— {rangeWord(range)}</em>
        </span>
      }
      subtitle={t.progress.sections.adherence.subtitle}
      body={
        <>
          <span className="sr-only" data-testid="chart-calorie-adherence-sr">
            {srSummary}
          </span>
          {sparse.isSparse && sparse.daysLogged === 0 ? (
            <EmptyState />
          ) : sparse.isSparse ? (
            <SparseBanner />
          ) : null}
          <figure
            role="img"
            aria-label={srSummary}
            style={{
              margin: 0,
              width: '100%',
            }}
          >
            <div
              style={{
                position: 'relative',
                height: CHART_HEIGHT,
                display: 'flex',
                alignItems: 'flex-end',
                gap: BAR_GAP,
                borderBottom: '1px solid var(--color-rule)',
              }}
            >
              {/* Target line */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: targetY,
                  borderTop: '1px dashed var(--color-ivory)',
                  opacity: 0.4,
                  pointerEvents: 'none',
                }}
              />
              {points.map((p) => {
                const height = Math.max(0, Math.min(1, p.kcalConsumed / maxY)) * CHART_HEIGHT;
                const color = colorForAdherence(p.adherenceClass);
                return (
                  <div
                    key={p.bucket}
                    data-testid={`cab-bar-${p.bucket}`}
                    data-adherence={p.adherenceClass}
                    aria-hidden="true"
                    title={`${p.bucket}: ${Math.round(p.kcalConsumed)} kcal`}
                    style={{
                      width: barWidth,
                      height,
                      background: color,
                      transition: 'background 120ms ease',
                    }}
                  />
                );
              })}
            </div>
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                gap: BAR_GAP,
                marginTop: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--color-dust)',
              }}
            >
              {points.map((p, i) => (
                <span
                  key={p.bucket}
                  style={{
                    width: barWidth,
                    textAlign: 'center',
                  }}
                >
                  {shortLabel(p.bucket, range, i === points.length - 1)}
                </span>
              ))}
            </div>
          </figure>
          <DataTableDrawer
            summaryLabel="View as data table"
            caption={srSummary}
            columns={['Bucket', 'Kcal consumed', 'Target', 'Status']}
            rows={points.map((p) => ({
              cells: [p.bucket, p.kcalConsumed, p.kcalTarget, p.adherenceClass],
            }))}
          />
        </>
      }
    />
  );
}

function colorForAdherence(cls: CalorieAdherenceData['points'][number]['adherenceClass']): string {
  if (cls === 'over') return 'var(--color-oxblood)';
  if (cls === 'on-target') return 'var(--color-moss)';
  if (cls === 'under') return 'var(--color-ember)';
  return 'var(--color-bg-2)';
}

function rangeWord(range: CalorieAdherenceData['range']): string {
  if (range === 'D') return 'today';
  if (range === 'W') return 'this week';
  return 'in thirty';
}

function shortLabel(
  bucket: string,
  range: CalorieAdherenceData['range'],
  isToday: boolean,
): string {
  if (range === 'D') {
    const hour = bucket.split('T')[1]?.slice(0, 2) ?? '';
    // Only render every 3rd hour to avoid label crowding.
    const n = parseInt(hour, 10);
    if (!Number.isFinite(n) || n % 3 !== 0) return '';
    return `${hour}h`;
  }
  const dd = bucket.slice(-2);
  return isToday ? `★${dd}` : dd;
}

function SparseBanner() {
  return (
    <p
      role="note"
      style={{
        fontFamily: 'var(--font-serif)',
        fontStyle: 'italic',
        fontSize: 14,
        color: 'var(--color-error-text)',
        margin: 0,
        marginBottom: 12,
      }}
      data-testid="chart-calorie-adherence-sparse-banner"
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontStyle: 'normal',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-oxblood-soft)',
          marginRight: 8,
        }}
      >
        {t.progress.calorieAdherence.sparseKicker} ·
      </span>
      {t.progress.calorieAdherence.sparseBody}
    </p>
  );
}

function EmptyState() {
  return (
    <div
      role="note"
      style={{
        textAlign: 'center',
        padding: '32px 16px',
        fontFamily: 'var(--font-serif)',
        fontStyle: 'italic',
        fontSize: 15,
        color: 'var(--color-error-text)',
      }}
      data-testid="chart-calorie-adherence-empty"
    >
      <p style={{ margin: 0, marginBottom: 8 }}>{t.progress.calorieAdherence.zeroBody}</p>
      <a
        href="/log"
        style={{
          display: 'inline-block',
          marginTop: 8,
          fontFamily: 'var(--font-sans)',
          fontStyle: 'normal',
          fontSize: 10.5,
          letterSpacing: '0.22em',
          color: 'var(--color-oxblood)',
          textDecoration: 'none',
          padding: '8px 0',
          minHeight: 44,
        }}
      >
        {t.progress.calorieAdherence.zeroCta}
      </a>
    </div>
  );
}
