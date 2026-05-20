/**
 * <TrendSummary /> — Task 4.3a deterministic trend commentary (RSC).
 *
 * Italic serif right-aligned single line of copy produced server-side by
 * `lib/aggregations/progress.ts` via linear-regression math. NOT Gemini.
 * No chart; the text IS the chart.
 */
import { t } from '@/lib/i18n/en';

import { ChartCard } from './ChartCard';
import { DataTableDrawer } from './DataTableDrawer';

import type { TrendSummaryData } from '@/lib/aggregations/progress';

export interface TrendSummaryProps {
  data: TrendSummaryData;
}

export function TrendSummary({ data }: TrendSummaryProps) {
  const { commentary, srSummary, microTrends, sparse } = data;
  return (
    <ChartCard
      id="progress-trend-summary-heading"
      testid="chart-trend-summary"
      kicker={t.progress.sections.trends.kicker}
      title={t.progress.trendSummary.title}
      subtitle={t.progress.sections.trends.subtitle}
      body={
        <>
          <span className="sr-only">{srSummary}</span>
          <figure role="img" aria-label={srSummary} style={{ margin: 0 }}>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 16,
                lineHeight: 1.5,
                color: sparse.isSparse ? 'var(--color-error-text)' : 'var(--color-ivory)',
                textAlign: 'right',
                margin: 0,
                marginTop: 16,
              }}
              data-testid="trend-summary-commentary"
            >
              {commentary}
            </p>
            {!sparse.isSparse && microTrends.length > 0 ? (
              <ul
                style={{
                  marginTop: 24,
                  padding: 0,
                  listStyle: 'none',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 12,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--color-sand)',
                }}
              >
                {microTrends.map((mt) => (
                  <li key={mt.nutrient} data-testid={`trend-micro-${mt.nutrient}`}>
                    <span
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontStyle: 'italic',
                        color: 'var(--color-ivory)',
                      }}
                    >
                      {mt.nutrient}
                    </span>{' '}
                    · {mt.direction} · {mt.delta >= 0 ? '+' : ''}
                    {mt.delta.toFixed(1)}
                  </li>
                ))}
              </ul>
            ) : null}
          </figure>
          <DataTableDrawer
            summaryLabel="View as data table"
            caption={srSummary}
            columns={['Metric', 'Value']}
            rows={[
              { cells: ['Calories avg', data.caloriesAvg] },
              { cells: ['Protein avg (g)', data.proteinAvgG] },
              { cells: ['Carbs avg (g)', data.carbsAvgG] },
              { cells: ['Fat avg (g)', data.fatAvgG] },
              { cells: ['Fiber avg (g)', data.fiberAvgG] },
              // Phase 2D — 5th macro: cholesterol (mg, NOT g). Mirrors
              // MacroDistributionStackedArea's data-table treatment so the
              // accessible fallback exposes the same fifth series.
              { cells: ['Cholesterol avg (mg)', data.cholesterolAvgMg] },
              ...microTrends.map((mt) => ({
                cells: [
                  `${mt.nutrient} trend`,
                  `${mt.direction} ${mt.delta >= 0 ? '+' : ''}${mt.delta.toFixed(1)}`,
                ],
              })),
            ]}
          />
        </>
      }
    />
  );
}
