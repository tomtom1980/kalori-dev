/**
 * <MicronutrientHeatmap /> — Task 4.3a signature piece (RSC wrapper).
 *
 * Server component renders the chart chrome (title, scan meta, footer,
 * data-table drawer) and delegates the interactive table to
 * <HeatmapInteractive /> (client) so keyboard users get 2D arrow nav
 * per WAI-ARIA APG Grid Pattern (Task 4.3a R1 — 2026-04-24).
 *
 * Row fade staggers via `.heatmap-row` + `--row-index` CSS variable
 * (keyframes in globals.css). Cell hover brightness + focus-visible
 * inset ring live in `.heatmap-cell-button` rules.
 *
 * Mobile M-range transpose handled via CSS media query in globals.css
 * keyed on `data-range-mode="M"` on the scroll container.
 *
 * Footer: deterministic linear-regression commentary from the aggregator,
 * italic serif right-aligned. Drop cap NEVER appears here (T6 rule).
 */
'use client';

import { useMemo, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { CANONICAL_CODE_TO_DISPLAY_NAME, CANONICAL_CODE_TO_UNIT } from '@/lib/nutrition/micros-rda';

import { ChartCard } from './ChartCard';
import { DataTableDrawer } from './DataTableDrawer';
import { HeatmapInteractive } from './HeatmapInteractive';

import type { MicronutrientHeatmapData } from '@/lib/aggregations/progress';

// Expanded mode is capped to a 10-row viewport: 10 * 28px cell rows plus
// header breathing room, with additional nutrients available via vertical scroll.
const EXPANDED_HEATMAP_TEN_ROW_VIEWPORT_HEIGHT = 320;

export interface MicronutrientHeatmapProps {
  data: MicronutrientHeatmapData;
}

export function MicronutrientHeatmap({ data }: MicronutrientHeatmapProps) {
  const { range, cells, footerCommentary, scanMeta, sparse, srSummary, window: win } = data;
  const [expanded, setExpanded] = useState(false);

  const buckets = win.buckets;
  const chartNutrients = expanded ? data.allNutrients : data.nutrients;
  const chartData = useMemo(
    () => ({
      ...data,
      nutrients: chartNutrients,
    }),
    [data, chartNutrients],
  );
  const tableRows = useMemo(
    () =>
      data.allNutrients.map((nutrient) => {
        const nutrientCells = cells.filter((cell) => cell.nutrient === nutrient);
        const target = data.targets[nutrient] ?? 0;
        const unit = CANONICAL_CODE_TO_UNIT[nutrient] ?? '';
        const totalActual = nutrientCells.reduce((sum, cell) => sum + cell.actual, 0);
        const averagePct =
          nutrientCells.length > 0
            ? Math.round(
                nutrientCells.reduce((sum, cell) => sum + cell.pctDv, 0) / nutrientCells.length,
              )
            : 0;
        return {
          cells: [
            humanize(nutrient),
            `${round1(totalActual)} ${unit}`,
            `${target} ${unit}`,
            `${averagePct}%`,
          ],
        };
      }),
    [cells, data.allNutrients, data.targets],
  );

  const rangeWord = heatmapRangeWord(range);
  const rangeMode = range === 'D' ? 'D' : range === 'W' || range === 'last_7' ? 'W' : 'M';
  const fitHeatmapToContainer = !expanded || buckets.length <= 14;

  // Server-rendered table head (static); body is rendered by client overlay.
  const headerDayRow = (
    <tr>
      <th
        scope="col"
        aria-hidden="true"
        style={{
          width: 96,
          padding: '6px 8px',
          background: 'transparent',
        }}
      />
      {buckets.map((b) => {
        const isToday = range === 'D' ? b.startsWith(win.userTzEndDay) : b === win.userTzEndDay;
        const label = shortLabel(b, rangeMode, isToday);
        // axe / SR contract: every <th> needs accessible text. For the D
        // range we only render visible labels every 3 hours — fill the
        // empty ones with an sr-only bucket string so axe's
        // empty-table-header rule passes AND screen readers get context.
        return (
          <th
            key={b}
            scope="col"
            style={{
              padding: '4px 2px',
              color: isToday ? 'var(--color-ivory)' : 'var(--color-dust)',
              fontWeight: isToday ? 600 : 400,
              textAlign: 'center',
              verticalAlign: 'bottom',
            }}
          >
            {label ? label : <span className="sr-only">{b}</span>}
          </th>
        );
      })}
    </tr>
  );

  return (
    <ChartCard
      id="progress-heatmap-heading"
      testid="chart-micronutrient-heatmap"
      fullWidth
      padding="wide"
      kicker={t.progress.sections.minorElements.kicker}
      title={
        <>
          {t.progress.heatmap.title}{' '}
          <em
            style={{
              fontStyle: 'italic',
              color: 'var(--color-sand)',
              fontWeight: 300,
            }}
          >
            {t.progress.heatmap.titleEm}
          </em>
          , {rangeWord}
        </>
      }
      subtitle={t.progress.sections.minorElements.subtitle}
      meta={
        <>
          <div>
            {t.progress.heatmap.scanMeta.lastScan} · {formatDate(scanMeta.lastScan)}
          </div>
          <div>
            {t.progress.heatmap.scanMeta.nextRecalc} · {formatDate(scanMeta.nextRecalc)}
          </div>
          <div>
            {t.progress.heatmap.scanMeta.dataPoints} · {scanMeta.dataPoints}
          </div>
        </>
      }
      body={
        <>
          <span className="sr-only">{srSummary}</span>
          {sparse.isSparse && sparse.daysLogged === 0 ? (
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
              data-testid="chart-heatmap-empty-caption"
            >
              {t.progress.heatmap.sparseCaption}
            </p>
          ) : null}
          <div
            role="region"
            aria-label={t.progress.heatmap.scrollAriaLabel}
            className="heatmap-scroll"
            data-range-mode={rangeMode}
            data-expanded={expanded ? 'true' : 'false'}
            data-testid="heatmap-expanded-scroll"
            // Phase 7 regression fix (REG-1): explicit `maxWidth: 100%` +
            // `minWidth: 0` ensures `overflowX: auto` actually engages when
            // the heatmap table's natural width exceeds the chart-card
            // column. Without these, the wrapper would still expand to the
            // table's intrinsic width and push the page horizontally.
            style={{
              overflowX: fitHeatmapToContainer ? 'hidden' : 'auto',
              overflowY: expanded ? 'auto' : 'visible',
              maxHeight: expanded ? EXPANDED_HEATMAP_TEN_ROW_VIEWPORT_HEIGHT : undefined,
              maxWidth: '100%',
              minWidth: 0,
            }}
          >
            <HeatmapInteractive
              data={chartData}
              headerMonthBand={null}
              headerDayRow={headerDayRow}
              fitToContainer={fitHeatmapToContainer}
            />
          </div>
          {data.allNutrients.length > data.nutrients.length ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              style={{
                marginTop: 12,
                minHeight: 44,
                cursor: 'pointer',
                border: '1px solid var(--color-rule)',
                background: 'transparent',
                color: 'var(--color-dust)',
                padding: '10px 14px',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
              }}
            >
              {expanded
                ? t.progress.heatmap.hideAllMicronutrients
                : t.progress.heatmap.showAllMicronutrients}
            </button>
          ) : null}
          <DataTableDrawer
            summaryLabel={t.progress.heatmap.viewAsTable}
            caption={srSummary}
            columns={['Nutrient', 'Actual', 'Target', 'Average % DV']}
            rows={tableRows}
          />
        </>
      }
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <LegendRamp />
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--color-sand)',
              margin: 0,
              textAlign: 'right',
              flex: '0 1 60%',
            }}
          >
            {footerCommentary}
          </p>
        </div>
      }
    />
  );
}

const RAMP_COLORS: Record<string, string> = {
  c0: 'var(--color-heat-c0)',
  c1: 'var(--color-heat-c1)',
  c2: 'var(--color-heat-c2)',
  c3: 'var(--color-heat-c3)',
  c4: 'var(--color-heat-c4)',
  c5: 'var(--color-heat-c5)',
  c6: 'var(--color-heat-c6)',
  c7: 'var(--color-heat-c7)',
  c8: 'var(--color-heat-c8)',
  c9: 'var(--color-heat-c9)',
};

function LegendRamp() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-sans)',
        fontSize: 10.5,
        color: 'var(--color-dust)',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
      }}
    >
      <span>{t.progress.heatmap.legendUnder}</span>
      <span
        style={{
          display: 'inline-flex',
          width: 144,
          height: 10,
          border: '1px solid var(--color-rule)',
        }}
      >
        {['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].map((c) => (
          <span
            key={c}
            style={{
              flex: 1,
              background: RAMP_COLORS[c],
            }}
          />
        ))}
      </span>
      <span>{t.progress.heatmap.legendOver}</span>
    </div>
  );
}

function humanize(n: string): string {
  return CANONICAL_CODE_TO_DISPLAY_NAME[n] ?? n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function shortLabel(bucket: string, range: 'D' | 'W' | 'M', isToday: boolean): string {
  if (range === 'D') {
    const hour = bucket.split('T')[1]?.slice(0, 2) ?? '';
    const n = parseInt(hour, 10);
    if (!Number.isFinite(n) || n % 3 !== 0) return '';
    return `${hour}h`;
  }
  const dd = bucket.slice(-2);
  return isToday ? `★${dd}` : dd;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toISOString().slice(0, 10)}`;
  } catch {
    return iso;
  }
}

function heatmapRangeWord(range: MicronutrientHeatmapData['range']): string {
  if (range === 'D') return t.progress.heatmap.rangeWord.D;
  if (range === 'W' || range === 'last_7') return t.progress.heatmap.rangeWord.W;
  if (typeof range === 'object') return 'in custom range';
  return t.progress.heatmap.rangeWord.M;
}
