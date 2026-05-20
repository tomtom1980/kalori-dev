/**
 * <MacroDistributionStackedArea /> — Task 4.3a stacked macro chart (RSC).
 *
 * Server-rendered SVG stacked bars. Color-blind affordance: solid protein
 * (ivory), diagonal pattern carbs (ochre), dot pattern fat (ember), and
 * vertical fiber (slate). Each series has a redundant text label in the
 * tooltip / data-table.
 */
import { t } from '@/lib/i18n/en';

import { ChartCard } from './ChartCard';
import { DataTableDrawer } from './DataTableDrawer';

import type { MacroDistributionData } from '@/lib/aggregations/progress';

export interface MacroDistributionProps {
  data: MacroDistributionData;
}

const CHART_HEIGHT = 220;
const BAR_GAP = 4;

export function MacroDistributionStackedArea({ data }: MacroDistributionProps) {
  const { points, srSummary } = data;
  const barCount = points.length;
  const barWidth =
    barCount > 0 ? `calc((100% - ${(barCount - 1) * BAR_GAP}px) / ${barCount})` : '0';
  // Max for stacking: macro grams stack on top of each other for the bar
  // height; cholesterol is mg (not g) and shouldn't dominate the y-axis. We
  // scale the cholesterol segment as a fraction of its OWN target so the
  // visual hint reads as "limit usage" (Phase 2D — matches MacroBars's muted
  // treatment). The stack-max ignores cholesterol so the four grams-macros
  // continue to drive the chart's vertical scale.
  const totalTarget =
    (points[0]?.proteinTargetG ?? 0) +
    (points[0]?.carbsTargetG ?? 0) +
    (points[0]?.fatTargetG ?? 0) +
    (points[0]?.fiberTargetG ?? 0);
  const maxStack = Math.max(
    totalTarget * 1.1,
    ...points.map((p) => (p.proteinG + p.carbsG + p.fatG + p.fiberG) * 1.05),
    1,
  );
  // Cholesterol segment height proxy: scale (consumed / target) up to a
  // visual ceiling roughly equal to fiber's typical band so the 5th series
  // is legible without distorting the rest of the stack. Cap at 1.0
  // (over-target clips to the visual max).
  const CHOLESTEROL_VISUAL_BAND = points[0]?.fiberTargetG ?? 30;

  return (
    <ChartCard
      id="progress-macro-distribution-heading"
      testid="chart-macro-distribution"
      kicker={t.progress.sections.adherence.kicker}
      title={t.progress.macroDistribution.title}
      subtitle={t.progress.sections.adherence.subtitle}
      body={
        <>
          <span className="sr-only">{srSummary}</span>
          <figure role="img" aria-label={srSummary} style={{ margin: 0 }}>
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
              {points.map((p) => {
                const pH = (p.proteinG / maxStack) * CHART_HEIGHT;
                const cH = (p.carbsG / maxStack) * CHART_HEIGHT;
                const fH = (p.fatG / maxStack) * CHART_HEIGHT;
                const fiberH = (p.fiberG / maxStack) * CHART_HEIGHT;
                // Cholesterol (mg) — render as a thin top cap whose height
                // is a fraction of the fiber-band's visual height. Pure UI
                // proxy; the data table exposes the raw mg value.
                const cholRatio = Math.min(1, p.cholesterolMg / Math.max(1, p.cholesterolTargetMg));
                const cholH = ((cholRatio * CHOLESTEROL_VISUAL_BAND) / maxStack) * CHART_HEIGHT;
                return (
                  <div
                    key={p.bucket}
                    data-testid={`mds-stack-${p.bucket}`}
                    title={`${p.bucket}: P ${Math.round(p.proteinG)}g / C ${Math.round(p.carbsG)}g / F ${Math.round(p.fatG)}g / Fiber ${Math.round(p.fiberG)}g / Chol ${Math.round(p.cholesterolMg)}mg`}
                    style={{
                      width: barWidth,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <div
                      data-series="cholesterol"
                      style={{
                        height: cholH,
                        background: 'var(--color-rule-strong)',
                      }}
                    />
                    <div
                      data-series="fiber"
                      style={{
                        height: fiberH,
                        background: 'var(--color-slate)',
                        backgroundImage:
                          'repeating-linear-gradient(90deg, transparent 0 4px, var(--color-bg-0) 4px 5px)',
                      }}
                    />
                    <div
                      data-series="fat"
                      style={{
                        height: fH,
                        background: 'var(--color-ember)',
                        backgroundImage:
                          'radial-gradient(circle, var(--color-ivory) 1px, transparent 1.5px)',
                        backgroundSize: '6px 6px',
                      }}
                    />
                    <div
                      data-series="carbs"
                      style={{
                        height: cH,
                        background: 'var(--color-ochre)',
                        backgroundImage:
                          'repeating-linear-gradient(45deg, transparent 0 4px, var(--color-oxblood) 4px 6px)',
                      }}
                    />
                    <div
                      data-series="protein"
                      style={{
                        height: pH,
                        background: 'var(--color-ivory)',
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <Legend />
          </figure>
          <DataTableDrawer
            summaryLabel="View as data table"
            caption={srSummary}
            columns={['Bucket', 'Protein g', 'Carbs g', 'Fat g', 'Fiber g', 'Cholesterol mg']}
            rows={points.map((p) => ({
              cells: [p.bucket, p.proteinG, p.carbsG, p.fatG, p.fiberG, p.cholesterolMg],
            }))}
          />
        </>
      }
    />
  );
}

function Legend() {
  return (
    <div
      role="list"
      aria-label={t.progress.macroDistribution.legend.ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 12,
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--color-dust)',
      }}
    >
      <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{ width: 12, height: 12, background: 'var(--color-ivory)' }}
        />
        {t.progress.macroDistribution.legend.protein}
      </span>
      <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            background: 'var(--color-ochre)',
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent 0 2px, var(--color-oxblood) 2px 3px)',
          }}
        />
        {t.progress.macroDistribution.legend.carbs}
      </span>
      <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            background: 'var(--color-ember)',
            backgroundImage: 'radial-gradient(circle, var(--color-ivory) 1px, transparent 1.5px)',
            backgroundSize: '4px 4px',
          }}
        />
        {t.progress.macroDistribution.legend.fat}
      </span>
      <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            background: 'var(--color-slate)',
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 2px, var(--color-bg-0) 2px 3px)',
          }}
        />
        {t.progress.macroDistribution.legend.fiber}
      </span>
      {/* Phase 2D — 5th macro (mg, NOT g). Muted slate-tan fill matches the
          dashboard MacroBars treatment for cholesterol: visually quieter
          than the four energy macros to read as a limit rather than a
          target. */}
      <span role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            background: 'var(--color-rule-strong)',
          }}
        />
        {t.progress.macroDistribution.legend.cholesterol}
      </span>
    </div>
  );
}
