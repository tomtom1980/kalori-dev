/**
 * <HeatmapInteractive /> — Client overlay for <MicronutrientHeatmap />.
 *
 * Task 4.3a R1 (2026-04-24) — WAI-ARIA Grid Pattern implementation.
 * Wraps the server-rendered <table role="grid"> and enables:
 *
 *   - 2D arrow-key nav: Up/Down/Left/Right moves focus cell-to-cell
 *   - Home = first cell of row; End = last cell of row
 *   - PgUp/PgDn = first/last cell of column (top/bottom of the grid)
 *   - Ctrl+Home/End = grid first/last cell
 *   - Tab enters grid at active cell (roving tabindex); Tab again exits
 *   - Space/Enter reveals tooltip; Escape dismisses
 *   - Pointer hover: crossfade brightness +6% (inline filter)
 *
 * CORNER BEHAVIOR: all edge arrow keys CLAMP at the grid boundary (they
 * are no-ops at the extreme). This follows WAI-ARIA APG Grid Pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/grid/) — wrapping is NOT the
 * default for grids. Codex R1 I-2 fix (2026-04-24): removed ambiguous
 * "wrap" language from the contract; confirmed clamp is consistently
 * implemented for all 4 corners × 4 directions.
 *
 * The ROVING TABINDEX pattern is used (WAI-ARIA APG Grid alternative to
 * aria-activedescendant). The active cell has tabindex=0; all others
 * tabindex=-1. The <button> inside each <td> provides native focusability
 * without breaking table semantics.
 *
 * Important: the table is rendered by the parent server component as
 * part of the RSC tree; this client overlay swaps the static <td> cells
 * at hydration with focusable <button> content. We don't duplicate DOM —
 * we render the FULL interactive table here and the parent RSC renders
 * a non-interactive fallback that this component supersedes client-side.
 *
 * For the parent RSC: we ship the interactive client component by
 * default. The SR-level ARIA contract (role=grid + role=gridcell +
 * per-cell aria-label) is preserved; keyboard nav is added client-side.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { ChartTooltip } from './ChartTooltip';

import type { MicronutrientHeatmapData } from '@/lib/aggregations/progress';
import { t } from '@/lib/i18n/en';
import { CANONICAL_CODE_TO_DISPLAY_NAME, CANONICAL_CODE_TO_UNIT } from '@/lib/nutrition/micros-rda';

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

export interface HeatmapInteractiveProps {
  data: MicronutrientHeatmapData;
  headerMonthBand: React.ReactNode;
  headerDayRow: React.ReactNode;
  fitToContainer?: boolean;
  /** Optional test hook to suppress Tooltip (Vitest axe runs). */
  disableTooltip?: boolean;
}

/**
 * Humanize nutrient keys for display. Mirrors the server's humanize()
 * so SR labels remain identical.
 */
function humanize(n: string): string {
  return CANONICAL_CODE_TO_DISPLAY_NAME[n] ?? n;
}

function cellAriaLabel(
  nutrient: string,
  bucket: string,
  actual: number,
  pct: number,
  isToday: boolean,
  target: number,
): string {
  const unit = CANONICAL_CODE_TO_UNIT[nutrient] ?? '';
  const label = `${humanize(nutrient)}, ${bucket}: ${actual.toFixed(1)} ${unit} of ${target} ${unit}, ${pct}% of target`;
  return isToday ? `${label}, today, in progress` : label;
}

export function HeatmapInteractive({
  data,
  headerMonthBand,
  headerDayRow,
  fitToContainer = false,
  disableTooltip,
}: HeatmapInteractiveProps) {
  const { nutrients, cells, targets, window: win } = data;
  const buckets = win.buckets;
  const rowData = useMemo(
    () =>
      nutrients.map((n) => ({
        nutrient: n,
        target: targets[n] ?? 0,
        cells: buckets.map(
          (b) =>
            cells.find((c) => c.nutrient === n && c.bucket === b) ?? {
              nutrient: n,
              bucket: b,
              actual: 0,
              pctDv: 0,
              rampClass: 'c0' as const,
              isToday: b === win.userTzEndDay || b.startsWith(win.userTzEndDay),
            },
        ),
      })),
    [nutrients, cells, buckets, targets, win.userTzEndDay],
  );

  // Active cell [row, col] — roving tabindex.
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const [hoverCell, setHoverCell] = useState<{
    nutrient: string;
    bucket: string;
    actual: number;
    pct: number;
    isToday: boolean;
    target: number;
  } | null>(null);
  const [detailAnchor, setDetailAnchor] = useState<DOMRect | null>(null);
  const [detailCell, setDetailCell] = useState<{
    nutrient: string;
    bucket: string;
    actual: number;
    pct: number;
    isToday: boolean;
    target: number;
  } | null>(null);
  const canHoverForInfo = useHoverInfoCapability();

  const buttonRefs = useRef<(HTMLButtonElement | null)[][]>([]);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Ensure buttonRefs matrix dimensions.
  useEffect(() => {
    buttonRefs.current = Array.from({ length: nutrients.length }, () =>
      new Array(buckets.length).fill(null),
    );
  }, [nutrients.length, buckets.length]);

  const focusCell = useCallback(
    (r: number, c: number) => {
      const rMax = rowData.length - 1;
      const cMax = buckets.length - 1;
      const rClamped = Math.max(0, Math.min(r, rMax));
      const cClamped = Math.max(0, Math.min(c, cMax));
      setActive([rClamped, cClamped]);
      // Defer focus to next tick to ensure tabindex updated.
      requestAnimationFrame(() => {
        buttonRefs.current[rClamped]?.[cClamped]?.focus();
      });
    },
    [rowData.length, buckets.length],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
      const rMax = rowData.length - 1;
      const cMax = buckets.length - 1;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          focusCell(r, Math.min(c + 1, cMax));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          focusCell(r, Math.max(c - 1, 0));
          break;
        case 'ArrowDown':
          e.preventDefault();
          focusCell(Math.min(r + 1, rMax), c);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusCell(Math.max(r - 1, 0), c);
          break;
        case 'PageDown':
          // WAI-ARIA APG Grid Pattern: PgDn jumps to last row of current
          // column. At the bottom row it clamps (no-op) — Codex R1 I-2.
          e.preventDefault();
          focusCell(rMax, c);
          break;
        case 'PageUp':
          // WAI-ARIA APG Grid Pattern: PgUp jumps to first row of current
          // column. At the top row it clamps (no-op) — Codex R1 I-2.
          e.preventDefault();
          focusCell(0, c);
          break;
        case 'Home':
          e.preventDefault();
          if (e.ctrlKey) focusCell(0, 0);
          else focusCell(r, 0);
          break;
        case 'End':
          e.preventDefault();
          if (e.ctrlKey) focusCell(rMax, cMax);
          else focusCell(r, cMax);
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const cell = rowData[r]?.cells[c];
          if (!cell) return;
          const target = e.currentTarget.getBoundingClientRect();
          detailTriggerRef.current = e.currentTarget;
          setDetailAnchor(target);
          setDetailCell({
            nutrient: cell.nutrient,
            bucket: cell.bucket,
            actual: cell.actual,
            pct: cell.pctDv,
            isToday: cell.isToday,
            target: rowData[r]!.target,
          });
          break;
        }
        case 'Escape':
          e.preventDefault();
          setHoverAnchor(null);
          setHoverCell(null);
          setDetailAnchor(null);
          setDetailCell(null);
          break;
        default:
          return;
      }
    },
    [rowData, buckets.length, focusCell],
  );

  const dismissHover = useCallback(() => {
    setHoverAnchor(null);
    setHoverCell(null);
  }, []);

  const dismissDetail = useCallback(() => {
    setDetailAnchor(null);
    setDetailCell(null);
    detailTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!detailCell) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissDetail();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && detailRef.current?.contains(target)) return;
      dismissDetail();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [detailCell, dismissDetail]);

  return (
    <>
      <table
        role="grid"
        aria-label={data.srSummary}
        data-testid="chart-heatmap-grid"
        className="heatmap-table"
        style={{
          borderCollapse: 'collapse',
          tableLayout: fitToContainer ? 'fixed' : 'auto',
          width: '100%',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
        }}
      >
        <thead>
          {headerMonthBand}
          {headerDayRow}
        </thead>
        <tbody>
          {rowData.map((row, rIdx) => (
            <tr
              key={row.nutrient}
              className="heatmap-row"
              style={
                {
                  ['--row-index' as string]: rIdx,
                } as React.CSSProperties
              }
            >
              <th
                scope="row"
                role="rowheader"
                style={{
                  padding: '4px 12px 4px 0',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontSize: rIdx < 3 ? 15 : 13,
                  fontWeight: 400,
                  color: 'var(--color-ivory)',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                {humanize(row.nutrient)}
              </th>
              {row.cells.map((c, cIdx) => {
                const [activeR, activeC] = active;
                const isActiveCell = activeR === rIdx && activeC === cIdx;
                const isEmpty = c.pctDv === 0 && c.actual === 0;
                return (
                  <td
                    key={c.bucket}
                    role="gridcell"
                    aria-label={cellAriaLabel(
                      c.nutrient,
                      c.bucket,
                      c.actual,
                      c.pctDv,
                      c.isToday,
                      row.target,
                    )}
                    data-testid={`heatmap-cell-${c.nutrient}-${c.bucket}`}
                    data-ramp={c.rampClass}
                    data-today={c.isToday ? 'true' : 'false'}
                    data-empty={isEmpty ? 'true' : 'false'}
                    style={{
                      padding: 0,
                      height: 28,
                      minWidth: fitToContainer ? 0 : 28,
                      background: isEmpty ? 'var(--color-heat-empty)' : RAMP_COLORS[c.rampClass],
                      borderRight: '1px solid var(--color-bg-0)',
                      boxShadow: c.isToday ? 'inset 0 0 0 1px var(--color-ivory)' : 'none',
                    }}
                  >
                    <button
                      ref={(el) => {
                        if (buttonRefs.current[rIdx]) {
                          buttonRefs.current[rIdx]![cIdx] = el;
                        }
                      }}
                      type="button"
                      className="heatmap-cell-button"
                      tabIndex={isActiveCell ? 0 : -1}
                      aria-label={cellAriaLabel(
                        c.nutrient,
                        c.bucket,
                        c.actual,
                        c.pctDv,
                        c.isToday,
                        row.target,
                      )}
                      data-testid={`heatmap-cell-button-${c.nutrient}-${c.bucket}`}
                      onKeyDown={(e) => onKeyDown(e, rIdx, cIdx)}
                      onFocus={() => setActive([rIdx, cIdx])}
                      onPointerEnter={(e) => {
                        if (!canHoverForInfo) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHoverAnchor(rect);
                        setHoverCell({
                          nutrient: c.nutrient,
                          bucket: c.bucket,
                          actual: c.actual,
                          pct: c.pctDv,
                          isToday: c.isToday,
                          target: row.target,
                        });
                      }}
                      onPointerLeave={dismissHover}
                      onClick={(e) => {
                        if (canHoverForInfo) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        dismissHover();
                        detailTriggerRef.current = e.currentTarget;
                        setDetailAnchor(rect);
                        setDetailCell({
                          nutrient: c.nutrient,
                          bucket: c.bucket,
                          actual: c.actual,
                          pct: c.pctDv,
                          isToday: c.isToday,
                          target: row.target,
                        });
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!disableTooltip && hoverCell && hoverAnchor ? (
        <ChartTooltip
          anchorRect={hoverAnchor}
          onDismiss={dismissHover}
          label={cellAriaLabel(
            hoverCell.nutrient,
            hoverCell.bucket,
            hoverCell.actual,
            hoverCell.pct,
            hoverCell.isToday,
            hoverCell.target,
          )}
          testid="heatmap-tooltip"
        >
          <HeatmapCellDetail cell={hoverCell} />
        </ChartTooltip>
      ) : null}
      {detailCell && detailAnchor ? (
        <div
          ref={detailRef}
          role="dialog"
          aria-label={cellAriaLabel(
            detailCell.nutrient,
            detailCell.bucket,
            detailCell.actual,
            detailCell.pct,
            detailCell.isToday,
            detailCell.target,
          )}
          className="chart-tooltip chart-tooltip-persistent"
          style={{
            position: 'fixed',
            top: Math.round(detailAnchor.bottom + 8),
            left: Math.round(detailAnchor.left),
            pointerEvents: 'auto',
          }}
        >
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={t.progress.heatmap.closeDetail}
            onClick={dismissDetail}
            className="kalori-log-close"
            style={{ position: 'absolute', top: 2, right: 2, width: 32, height: 32 }}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.7} />
          </button>
          <HeatmapCellDetail cell={detailCell} />
        </div>
      ) : null}
      <span
        role="status"
        aria-live="polite"
        className="chart-live-region"
        data-testid="heatmap-live"
      >
        {detailCell
          ? cellAriaLabel(
              detailCell.nutrient,
              detailCell.bucket,
              detailCell.actual,
              detailCell.pct,
              detailCell.isToday,
              detailCell.target,
            )
          : ''}
      </span>
    </>
  );
}

function useHoverInfoCapability(): boolean {
  const getCanHover = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  };
  const [canHover, setCanHover] = useState(getCanHover);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setCanHover(query.matches);
    onChange();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    }
  }, []);

  return canHover;
}

function HeatmapCellDetail({
  cell,
}: {
  cell: {
    nutrient: string;
    bucket: string;
    actual: number;
    pct: number;
    target: number;
  };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 28 }}>
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--color-sand)',
        }}
      >
        {humanize(cell.nutrient)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--color-dust)',
        }}
      >
        {cell.bucket}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15,
          color: 'var(--color-ivory)',
        }}
      >
        {cell.actual.toFixed(1)} {CANONICAL_CODE_TO_UNIT[cell.nutrient] ?? ''} / {cell.target}{' '}
        {CANONICAL_CODE_TO_UNIT[cell.nutrient] ?? ''} (<span className="num">{cell.pct}%</span>)
      </span>
    </div>
  );
}
