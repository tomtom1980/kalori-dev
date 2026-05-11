'use client';

/**
 * <MicrosOverflowToggle /> — Task 3.5 client leaf + Task 3.7 F-UI-3.7-A fix.
 *
 * Owns the expand/collapse state AND the row rendering for the micronutrient
 * panel. Accepting the full `rows` array + `visibleCount` as serializable
 * props avoids the React 19 RSC violation where passing a render-prop
 * function from the server component MicronutrientPanel would cross the
 * server→client boundary. Functions are not serializable for RSC payload.
 *
 * The rendering logic (Row + MicroStatus→color mappings + aria-label copy)
 * lives here so the server shell only passes plain data. State is a pure
 * `useState<boolean>`; no imperative effects.
 *
 * Task 5.1.6 AC3: bar fill uses `transform: scaleX()` instead of a
 * `transition: width` (which is Tier-C and causes layout). Reduced-motion
 * is honored by the global `prefers-reduced-motion: reduce` blanket in
 * `app/globals.css`, which collapses `transition-duration` to 1ms.
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import type { MicroRow, MicroStatus } from '@/lib/dashboard/types';

const FILL_COLOR: Record<MicroStatus, string> = {
  low: 'var(--color-oxblood)',
  mid: 'var(--color-ochre)',
  good: 'var(--color-moss)',
  over: 'var(--color-oxblood-soft)',
};

const PCT_COLOR: Record<MicroStatus, string> = {
  low: 'var(--color-ember)', // AA-safe on bg-1 (4.98:1)
  mid: 'var(--color-sand)',
  good: 'var(--color-moss)',
  over: 'var(--color-ember)',
};

function statusWord(status: MicroStatus): string {
  switch (status) {
    case 'low':
      return t.dashboard.micro.statusLow;
    case 'mid':
      return t.dashboard.micro.statusMid;
    case 'good':
      return t.dashboard.micro.statusGood;
    case 'over':
      return t.dashboard.micro.statusOver;
  }
}

function Row({ row }: { row: MicroRow }) {
  const fill = FILL_COLOR[row.status];
  const pctColor = PCT_COLOR[row.status];
  const barPct = Math.min(100, row.pct);
  const valueText =
    row.status === 'over'
      ? t.dashboard.micro.rowAriaLabelOver
          .replace('{name}', row.name)
          .replace('{pct}', String(row.pct))
      : t.dashboard.micro.rowAriaLabel
          .replace('{name}', row.name)
          .replace('{pct}', String(row.pct))
          .replace('{status}', statusWord(row.status));
  const overPrefix = row.status === 'over';

  return (
    <div
      data-testid={`micro-row-${row.name.replace(/\s+/g, '-')}`}
      role="meter"
      aria-valuenow={Math.min(100, row.pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      aria-label={valueText}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 110px) minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 'var(--spacing-3)',
        marginBottom: 'var(--spacing-2)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--color-ivory)',
        }}
      >
        {overPrefix ? (
          <span aria-hidden="true" style={{ color: 'var(--color-oxblood-soft)', marginRight: 4 }}>
            !
          </span>
        ) : null}
        {row.name}
      </span>
      <div
        // Codex Round 1 (I-2): non-comment guard literal — honored by
        // globals.css `prefers-reduced-motion: reduce` blanket. See
        // identical comment + attribute in MacroBars.tsx for full
        // rationale.
        data-prefers-reduced-motion="reduce-via-globals"
        style={{
          position: 'relative',
          height: 4,
          background: 'var(--color-rule)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: fill,
            transformOrigin: 'left center',
            transform: `scaleX(${barPct / 100})`,
            transition: 'transform var(--motion-expressive) var(--ease-editorial)',
          }}
        />
      </div>
      <span
        className="num"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textAlign: 'right',
          color: pctColor,
        }}
      >
        {row.status === 'over'
          ? t.dashboard.micro.pctOverFormat.replace('{pct}', String(row.pct))
          : t.dashboard.micro.pctFormat.replace('{pct}', String(row.pct))}
      </span>
    </div>
  );
}

export interface MicrosOverflowToggleProps {
  rows: MicroRow[];
  visibleCount: number;
  overflowId: string;
}

export function MicrosOverflowToggle({
  rows,
  visibleCount,
  overflowId,
}: MicrosOverflowToggleProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = rows.slice(0, visibleCount);
  const hidden = rows.slice(visibleCount);
  const hiddenCount = hidden.length;

  return (
    <>
      <div id={overflowId}>
        {visible.map((row) => (
          <Row key={row.name} row={row} />
        ))}
        {expanded ? hidden.map((row) => <Row key={row.name} row={row} />) : null}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          data-testid="micros-overflow-toggle"
          aria-controls={overflowId}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-oxblood-soft)',
            background: 'transparent',
            border: 'none',
            padding: 'var(--spacing-3) 0',
            minHeight: 44,
            cursor: 'pointer',
          }}
        >
          {expanded
            ? t.dashboard.micro.overflowLess
            : t.dashboard.micro.overflowMoreFormat.replace('{n}', String(hiddenCount))}
        </button>
      ) : null}
    </>
  );
}

export default MicrosOverflowToggle;
