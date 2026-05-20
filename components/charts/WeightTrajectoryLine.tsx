/**
 * `<WeightTrajectoryLine />` — Task 4.3b bespoke inline SVG chart.
 *
 * Zero chart-library bundle (0 KB). Composes raw `<path>` + `<circle>` +
 * `<line>` + `<text>` per the Quick-Pick deviation documented in
 * `Planning/.tmp/task-4.3b-ui-design-lead.md §5.1`.
 *
 * Features per ui-design §7.4.3 + design-lead §5.3 / §5.5:
 *   - Measured line (oxblood 1.5px) between sorted points
 *   - Today dot emphasized (r=4 oxblood fill + 2px ivory outer ring)
 *   - Normal dot (r=2.5 ivory fill + 1.5px oxblood stroke)
 *   - Linear-regression trend line (dust dashed, shown ≥5 points)
 *   - Goal rule (ochre dashed) + right-labeled italic label
 *   - Projection ember → plum beyond goal
 *   - Sparse states (0 / 1 / 2-4 / ≥5 / 14-day gap)
 *   - a11y: role=figure + srSummary + per-dot aria-label + polite live companion
 *
 * Pure presentational — no data fetching, no mutations, no state beyond the
 * hovered/focused dot index. Parent controls range via `onRangeChange`.
 */
'use client';

import { useId, useMemo, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { kgToLb, roundToOneDecimal } from '@/lib/units/conversion';

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export type WeightRange = '7d' | '30d' | '90d' | '1y' | 'custom';

export interface WeightTrajectoryLineProps {
  entries: WeightEntry[];
  goalWeightKg: number | null;
  range: WeightRange;
  onRangeChange?: (range: WeightRange) => void;
  unitPref?: 'metric' | 'imperial';
  quickAddMode?: 'link' | 'inline';
}

const VIEWBOX_W = 840;
const VIEWBOX_H = 360;
const PADDING = { top: 24, right: 16, bottom: 64, left: 40 };
const INNER_W = VIEWBOX_W - PADDING.left - PADDING.right;
const INNER_H = VIEWBOX_H - PADDING.top - PADDING.bottom;
const GAP_DAYS_THRESHOLD = 14;

export function WeightTrajectoryLine(props: WeightTrajectoryLineProps) {
  const { entries, goalWeightKg, range } = props;
  const unitPref = props.unitPref ?? 'metric';
  const unitLabel = unitPref === 'imperial' ? t.weight.unitLb : t.weight.unitKg;
  const unitWord = unitPref === 'imperial' ? 'pounds' : 'kilograms';
  const figId = useId();
  const summaryId = useId();
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const sorted = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)), [entries]);
  const displaySorted = useMemo(
    () =>
      sorted.map((entry) => ({
        date: entry.date,
        weightKg: formatDisplayWeight(entry.weightKg, unitPref),
      })),
    [sorted, unitPref],
  );
  const displayGoalWeight =
    goalWeightKg === null ? null : formatDisplayWeight(goalWeightKg, unitPref);

  const axisRangeLabel = useMemo(() => {
    if (range === '7d') return t.weight.chartAxisRange7d;
    if (range === '30d') return t.weight.chartAxisRange30d;
    if (range === '90d') return t.weight.chartAxisRange90d;
    if (range === 'custom') return 'Selected range';
    return t.weight.chartAxisRange1y;
  }, [range]);

  const stats = useMemo(() => {
    if (displaySorted.length === 0) return null;
    const first = displaySorted[0]!;
    const last = displaySorted[displaySorted.length - 1]!;
    const delta = roundToOneDecimal(last.weightKg - first.weightKg);
    return {
      start: first.weightKg,
      current: last.weightKg,
      delta,
    };
  }, [displaySorted]);

  // React Compiler memoizes this automatically — no manual useMemo.
  const srSummary = !stats
    ? ''
    : (() => {
        const deltaStr =
          stats.delta > 0
            ? `plus ${stats.delta}`
            : stats.delta < 0
              ? `minus ${Math.abs(stats.delta)}`
              : 'no change';
        return t.weight.chartSrSummaryFormat
          .replace('{start}', String(stats.start))
          .replace('{current}', String(stats.current))
          .replace('{delta}', deltaStr)
          .replace('{range}', axisRangeLabel.toLowerCase())
          .replace('{count}', String(sorted.length))
          .replaceAll('kilograms', unitWord);
      })();

  // Y-axis domain
  const { yMin, yMax, yScale, xScale } = useMemo(() => {
    if (displaySorted.length === 0) {
      return {
        yMin: formatDisplayWeight(60, unitPref),
        yMax: formatDisplayWeight(80, unitPref),
        yScale: (): number => PADDING.top + INNER_H / 2,
        xScale: (): number => PADDING.left + INNER_W / 2,
      };
    }
    const weights = displaySorted.map((e) => e.weightKg);
    if (displayGoalWeight !== null) weights.push(displayGoalWeight);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const pad = Math.max(1, (maxW - minW) * 0.2);
    const yMin = Math.floor((minW - pad) * 2) / 2;
    const yMax = Math.ceil((maxW + pad) * 2) / 2;
    const span = yMax - yMin || 1;
    const count = Math.max(1, displaySorted.length - 1);
    const localYMin = yMin;
    return {
      yMin,
      yMax,
      yScale: (v: number): number => PADDING.top + INNER_H - ((v - localYMin) / span) * INNER_H,
      xScale: (i: number): number =>
        PADDING.left + (count === 0 ? INNER_W / 2 : (i / count) * INNER_W),
    };
  }, [displaySorted, displayGoalWeight, unitPref]);

  // Build measured line path with 14-day gap breaks.
  const pathSegments = useMemo(() => {
    if (displaySorted.length < 2) return [] as Array<{ d: string; dashed: boolean }>;
    const segments: Array<{ d: string; dashed: boolean }> = [];
    let buffer = '';
    const dashedSegments: Array<{ d: string }> = [];
    for (let i = 0; i < displaySorted.length; i++) {
      const point = displaySorted[i]!;
      const x = xScale(i);
      const y = yScale(point.weightKg);
      if (i === 0) {
        buffer = `M ${x} ${y}`;
      } else {
        const prev = displaySorted[i - 1]!;
        const daysApart = daysBetween(prev.date, point.date);
        if (daysApart > GAP_DAYS_THRESHOLD) {
          if (buffer) {
            segments.push({ d: buffer, dashed: false });
          }
          dashedSegments.push({
            d: `M ${xScale(i - 1)} ${yScale(prev.weightKg)} L ${x} ${y}`,
          });
          buffer = `M ${x} ${y}`;
        } else {
          buffer += ` L ${x} ${y}`;
        }
      }
    }
    if (buffer) segments.push({ d: buffer, dashed: false });
    for (const d of dashedSegments) segments.push({ d: d.d, dashed: true });
    return segments;
  }, [displaySorted, xScale, yScale]);

  // Simple linear regression for trend line (slope-intercept).
  const trend = useMemo(() => {
    if (displaySorted.length < 5) return null;
    const n = displaySorted.length;
    const xs = displaySorted.map((_, i) => i);
    const ys = displaySorted.map((e) => e.weightKg);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i]! - xMean) * (ys[i]! - yMean);
      den += (xs[i]! - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    return { slope, intercept };
  }, [displaySorted]);

  // Projection — extends trend 30% past the last measurement; splits at goal.
  const projection = useMemo(() => {
    if (!trend || displaySorted.length < 5) return null;
    const lastIdx = displaySorted.length - 1;
    const projectEnd = lastIdx + Math.ceil(displaySorted.length * 0.3);
    const projValueAt = (i: number) => trend.intercept + trend.slope * i;
    const endVal = projValueAt(projectEnd);
    const segments: Array<{ d: string; color: 'ember' | 'plum' }> = [];
    if (displayGoalWeight === null) {
      segments.push({
        d: `M ${xScale(lastIdx)} ${yScale(displaySorted[lastIdx]!.weightKg)} L ${xScale(projectEnd)} ${yScale(endVal)}`,
        color: 'ember',
      });
      return segments;
    }
    // Find crossing of goal between lastIdx and projectEnd (if any).
    const startVal = displaySorted[lastIdx]!.weightKg;
    const crossesGoal =
      (startVal >= displayGoalWeight && endVal <= displayGoalWeight) ||
      (startVal <= displayGoalWeight && endVal >= displayGoalWeight);
    if (!crossesGoal) {
      const pastGoal =
        (trend.slope < 0 && startVal < displayGoalWeight) ||
        (trend.slope > 0 && startVal > displayGoalWeight);
      segments.push({
        d: `M ${xScale(lastIdx)} ${yScale(startVal)} L ${xScale(projectEnd)} ${yScale(endVal)}`,
        color: pastGoal ? 'plum' : 'ember',
      });
    } else {
      const denom = endVal - startVal;
      const tFrac = denom === 0 ? 0 : (displayGoalWeight - startVal) / denom;
      const crossIdx = lastIdx + tFrac * (projectEnd - lastIdx);
      segments.push({
        d: `M ${xScale(lastIdx)} ${yScale(startVal)} L ${xScale(crossIdx)} ${yScale(displayGoalWeight)}`,
        color: 'ember',
      });
      segments.push({
        d: `M ${xScale(crossIdx)} ${yScale(displayGoalWeight)} L ${xScale(projectEnd)} ${yScale(endVal)}`,
        color: 'plum',
      });
    }
    return segments;
  }, [trend, displaySorted, xScale, yScale, displayGoalWeight]);

  const yTicks = useMemo(() => buildYTicks(yMin, yMax), [yMin, yMax]);

  const gapAnnotations = useMemo(() => {
    const annotations: Array<{ x: number; y: number; label: string }> = [];
    for (let i = 1; i < displaySorted.length; i++) {
      const prev = displaySorted[i - 1]!;
      const cur = displaySorted[i]!;
      const days = daysBetween(prev.date, cur.date);
      if (days > GAP_DAYS_THRESHOLD) {
        const midX = (xScale(i - 1) + xScale(i)) / 2;
        const midY = (yScale(prev.weightKg) + yScale(cur.weightKg)) / 2 - 8;
        annotations.push({
          x: midX,
          y: midY,
          label: t.weight.chartGapAnnotation.replace('{n}', String(days)),
        });
      }
    }
    return annotations;
  }, [displaySorted, xScale, yScale]);

  const isEmpty = sorted.length === 0;
  const isSingle = sorted.length === 1;

  return (
    <figure
      data-testid="weight-trajectory-line"
      aria-labelledby={figId}
      aria-describedby={summaryId}
      style={{ margin: 0, width: '100%' }}
    >
      <figcaption
        id={figId}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {t.weight.chartFigCaption}
      </figcaption>
      <p
        id={summaryId}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {srSummary}
      </p>
      <svg
        role="img"
        aria-labelledby={figId}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width="100%"
        height="auto"
        style={{ display: 'block' }}
        focusable="false"
      >
        {/* y-axis grid + ticks */}
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={VIEWBOX_W - PADDING.right}
                y2={y}
                stroke="color-mix(in srgb, var(--color-ivory) 12%, transparent)"
                strokeWidth="0.5"
              />
              <text
                x={PADDING.left - 8}
                y={y + 4}
                textAnchor="end"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                  fill: 'var(--color-dust)',
                }}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Goal rule (ochre dashed) */}
        {displayGoalWeight !== null && displayGoalWeight >= yMin && displayGoalWeight <= yMax ? (
          <g>
            <line
              x1={PADDING.left}
              y1={yScale(displayGoalWeight)}
              x2={VIEWBOX_W - PADDING.right}
              y2={yScale(displayGoalWeight)}
              stroke="var(--color-ochre)"
              strokeWidth="0.75"
              strokeDasharray="4 3"
            />
            <text
              x={VIEWBOX_W - PADDING.right - 4}
              y={yScale(displayGoalWeight) - 4}
              textAnchor="end"
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 11,
                fill: 'var(--color-ochre)',
              }}
            >
              {t.weight.chartGoalLineLabel} {displayGoalWeight} {unitLabel}
            </text>
          </g>
        ) : null}

        {/* Trend line */}
        {trend ? (
          <line
            data-testid="weight-trajectory-trend"
            x1={xScale(0)}
            y1={yScale(trend.intercept + trend.slope * 0)}
            x2={xScale(displaySorted.length - 1)}
            y2={yScale(trend.intercept + trend.slope * (displaySorted.length - 1))}
            stroke="var(--color-dust)"
            strokeWidth="0.75"
            strokeDasharray="2 3"
            strokeOpacity="0.5"
          />
        ) : null}

        {/* Projection segments */}
        {projection?.map((seg, i) => (
          <path
            key={`proj-${i}`}
            d={seg.d}
            stroke={seg.color === 'ember' ? 'var(--color-ember)' : 'var(--color-plum)'}
            strokeWidth="0.75"
            strokeDasharray="3 3"
            fill="none"
            data-testid={`weight-trajectory-projection-${seg.color}`}
          />
        ))}

        {/* Measured line (with possible dashed gap breaks) */}
        {pathSegments.map((seg, i) => (
          <path
            key={`line-${i}`}
            d={seg.d}
            stroke="var(--color-oxblood)"
            strokeWidth="1.5"
            strokeDasharray={seg.dashed ? '2 4' : undefined}
            fill="none"
            data-testid={
              seg.dashed ? 'weight-trajectory-gap-line' : 'weight-trajectory-measured-line'
            }
          />
        ))}

        {/* Gap annotations */}
        {gapAnnotations.map((ann, i) => (
          <text
            key={`gap-${i}`}
            x={ann.x}
            y={ann.y}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 10,
              fill: 'var(--color-dust)',
            }}
          >
            {ann.label}
          </text>
        ))}

        {/* Data points */}
        <g role="list">
          {displaySorted.map((point, i) => {
            const isLast = i === displaySorted.length - 1;
            const x = xScale(i);
            const y = yScale(point.weightKg);
            const prev = i > 0 ? displaySorted[i - 1] : null;
            const delta = prev ? roundToOneDecimal(point.weightKg - prev.weightKg) : 0;
            const deltaStr =
              delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'unchanged';
            const a11y = t.weight.chartPointA11yFormat
              .replace('{date}', point.date)
              .replace('{weight}', String(point.weightKg))
              .replace('{delta}', deltaStr)
              .replace('kilograms', unitWord);
            return (
              <g key={`pt-${i}`} role="listitem">
                <circle
                  cx={x}
                  cy={y}
                  r={isLast ? 4 : 2.5}
                  fill={isLast ? 'var(--color-oxblood)' : 'var(--color-ivory)'}
                  stroke={isLast ? 'var(--color-ivory)' : 'var(--color-oxblood)'}
                  strokeWidth={isLast ? 2 : 1.5}
                  tabIndex={0}
                  aria-label={a11y}
                  data-testid={`weight-trajectory-point-${i}`}
                  onFocus={() => setFocusedIdx(i)}
                  onBlur={() => setFocusedIdx(null)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}
        </g>

        {/* Recorded-date labels */}
        <g aria-hidden="true">
          {sorted.map((point, i) => (
            <text
              key={`date-${i}`}
              x={xScale(i)}
              y={PADDING.top + INNER_H + 18}
              textAnchor="end"
              transform={`rotate(-35 ${xScale(i)} ${PADDING.top + INNER_H + 18})`}
              data-testid={`weight-trajectory-date-label-${i}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                fill: 'var(--color-dust)',
              }}
            >
              {formatPointDate(point.date)}
            </text>
          ))}
        </g>

        {/* x-axis range label (bottom) */}
        <text
          x={PADDING.left + INNER_W / 2}
          y={VIEWBOX_H - 6}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fill: 'var(--color-dust)',
          }}
        >
          {axisRangeLabel}
        </text>
      </svg>

      {/* Sparse-state copy */}
      {isEmpty ? (
        <p
          data-testid="weight-trajectory-empty"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 16,
            color: 'var(--color-dust)',
            textAlign: 'center',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.weight.chartEmptyState}
        </p>
      ) : null}
      {isSingle ? (
        <p
          data-testid="weight-trajectory-single"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--color-dust)',
            textAlign: 'center',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {t.weight.chartSingleMeasurement}
        </p>
      ) : null}
      {sorted.length >= 2 && sorted.length < 5 ? (
        <p
          data-testid="weight-trajectory-low-count"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            color: 'var(--color-dust)',
            textAlign: 'center',
            marginTop: 'var(--spacing-3)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {t.weight.chartTrendAvailableAt}
        </p>
      ) : null}

      {/* Keyboard-focus live companion */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {focusedIdx !== null && displaySorted[focusedIdx]
          ? `${displaySorted[focusedIdx]!.date} · ${displaySorted[focusedIdx]!.weightKg} ${unitLabel}`
          : ''}
      </p>
    </figure>
  );
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + 'T00:00:00Z');
  const b = Date.parse(bIso + 'T00:00:00Z');
  return Math.round(Math.abs(b - a) / (24 * 60 * 60 * 1000));
}

function formatPointDate(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return day;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

function buildYTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const step = niceStep(span / 4);
  const ticks: number[] = [];
  const startTick = Math.ceil(min / step) * step;
  for (let v = startTick; v <= max + step * 0.001; v += step) {
    ticks.push(Math.round(v * 10) / 10);
    if (ticks.length > 10) break;
  }
  return ticks;
}

function formatDisplayWeight(kg: number, unitPref: 'metric' | 'imperial'): number {
  return unitPref === 'imperial' ? roundToOneDecimal(kgToLb(kg)) : roundToOneDecimal(kg);
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  if (n < 1.5) return 1 * pow;
  if (n < 3.5) return 2 * pow;
  if (n < 7.5) return 5 * pow;
  return 10 * pow;
}

export default WeightTrajectoryLine;
