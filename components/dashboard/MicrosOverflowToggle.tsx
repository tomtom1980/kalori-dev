'use client';

/**
 * <MicrosOverflowToggle /> — Task 3.5 client leaf + Task 3.7 F-UI-3.7-A fix
 * + Phase 2B hover/click breakdown.
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
 * Phase 2B (2026-05-16): each contributing row is now wrapped in a Radix
 * Tooltip + clickable button. Hover reveals the top-3 contributors;
 * click opens `<MicroBreakdownDialog />` for that row. Rows with
 * `consumed === 0` are non-interactive (no trigger button, no tooltip)
 * since their `contributions` array is empty. Mirrors the MacroBars
 * pattern verbatim — same z-index layering (Tooltip 52, Dialog 51,
 * Overlay 50), same focus + reduced-motion handling.
 *
 * Task 5.1.6 AC3: bar fill uses `transform: scaleX()` instead of a
 * `transition: width` (which is Tier-C and causes layout). Reduced-motion
 * is honored by the global `prefers-reduced-motion: reduce` blanket in
 * `app/globals.css`, which collapses `transition-duration` to 1ms.
 */
import * as Tooltip from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import { useState } from 'react';

import { MicroBreakdownDialog } from './MicroBreakdownDialog';

import { buildMicroHoverText } from '@/lib/dashboard/build-micro-hover-text';
import { t } from '@/lib/i18n/en';
import type { MicroRow, MicroStatus } from '@/lib/dashboard/types';

/**
 * Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
 * the `'unknown'` status was added so RDA-null rows (sugar, caffeine,
 * orphan keys) reach this renderer with a distinct discriminator. The
 * neutral palette below avoids the oxblood-red "low" signal that
 * misled users into reading these rows as below-reference deficits.
 */
const FILL_COLOR: Record<MicroStatus, string> = {
  low: 'var(--color-oxblood)',
  mid: 'var(--color-ochre)',
  good: 'var(--color-moss)',
  over: 'var(--color-oxblood-soft)',
  // No visible bar fill for RDA-unknown rows — same tone as the rail so
  // the row reads as "no daily reference" rather than "0% bar".
  unknown: 'var(--color-rule)',
};

const PCT_COLOR: Record<MicroStatus, string> = {
  low: 'var(--color-ember)', // AA-safe on bg-1 (4.98:1)
  mid: 'var(--color-sand)',
  good: 'var(--color-moss)',
  over: 'var(--color-ember)',
  // Neutral typographic tone for the em-dash placeholder.
  unknown: 'var(--color-dust)',
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
    case 'unknown':
      return t.dashboard.micro.statusUnknown;
  }
}

function MeterContent({ row }: { row: MicroRow }) {
  const fill = FILL_COLOR[row.status];
  const pctColor = PCT_COLOR[row.status];
  const barPct = Math.min(100, row.pct);
  const overPrefix = row.status === 'over';
  // Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
  // RDA-unknown rows render with NO bar fill (scaleX(0)) and the em-dash
  // placeholder in the percent slot, with neutral typographic tone. This
  // mirrors the library `MicroRowDisplay` branch for `dvPct === null`
  // (FoodDetailMacros.tsx) which already omitted the meter visual for
  // RDA-null rows.
  const isUnknownRda = row.status === 'unknown';
  const barFillScale = isUnknownRda ? 0 : barPct / 100;
  const pctLabel = isUnknownRda
    ? t.dashboard.micro.pctUnknownLabel
    : row.status === 'over'
      ? t.dashboard.micro.pctOverFormat.replace('{pct}', String(row.pct))
      : t.dashboard.micro.pctFormat.replace('{pct}', String(row.pct));
  return (
    <>
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
            transform: `scaleX(${barFillScale})`,
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
        {pctLabel}
      </span>
    </>
  );
}

const METER_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 110px) minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 'var(--spacing-3)',
  marginBottom: 'var(--spacing-2)',
};

function formatAmountForAria(value: number): string {
  // Mirror `MicroBreakdownDialog.formatAmount` — integer when whole, single
  // decimal otherwise. Keeps the announced amount terse for screen readers.
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Row({
  row,
  onOpen,
  collisionBoundary,
}: {
  row: MicroRow;
  onOpen: (row: MicroRow) => void;
  collisionBoundary: Element | null;
}) {
  // Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) — pick
  // the aria template that matches the row's semantic status. RDA-unknown
  // rows announce "{name}, {amount}{unit}, no daily reference" so assistive
  // tech does NOT read out a misleading "0 percent of daily reference,
  // below reference" phrase for sugar/caffeine/orphan rows.
  const valueText =
    row.status === 'unknown'
      ? t.dashboard.micro.rowAriaLabelUnknown
          .replace('{name}', row.name)
          .replace('{amount}', formatAmountForAria(row.consumed))
          .replace('{unit}', row.unit ?? '')
      : row.status === 'over'
        ? t.dashboard.micro.rowAriaLabelOver
            .replace('{name}', row.name)
            .replace('{pct}', String(row.pct))
        : t.dashboard.micro.rowAriaLabel
            .replace('{name}', row.name)
            .replace('{pct}', String(row.pct))
            .replace('{status}', statusWord(row.status));

  const hasContributions = (row.contributions ?? []).length > 0;
  const isInteractive = row.consumed > 0 && hasContributions;

  // Phase 2B: rows the user has not yet consumed (or with no contributions
  // available) stay as non-interactive meters. The aggregator filters
  // consumed===0 out before this component sees them, so this branch is
  // mainly defensive — but it also covers any future cases where a row
  // surfaces without a contributions array (e.g. legacy fixtures).
  if (!isInteractive) {
    return (
      <div
        data-testid={`micro-row-${row.name.replace(/\s+/g, '-')}`}
        role="meter"
        aria-valuenow={Math.min(100, row.pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
        aria-label={valueText}
        style={METER_GRID_STYLE}
      >
        <MeterContent row={row} />
      </div>
    );
  }

  const hoverText = buildMicroHoverText(row);
  const triggerLabel = t.dashboard.micro.breakdownTriggerA11y
    .replace('{name}', row.name)
    .replace('{summary}', valueText);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="kalori-nutrition-trigger kalori-nutrition-trigger--micro"
          data-testid={`micro-row-${row.name.replace(/\s+/g, '-')}-trigger`}
          aria-label={triggerLabel}
          onClick={() => onOpen(row)}
          style={{
            // Reset native button chrome — we paint the same grid as before.
            appearance: 'none',
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
            minHeight: 44,
            cursor: 'pointer',
            display: 'block',
            width: '100%',
          }}
        >
          {/* Inner `role="meter"` element keeps assistive tech happy AND
              preserves the existing `data-testid` contract that the panel
              tests assert against. */}
          <div
            data-testid={`micro-row-${row.name.replace(/\s+/g, '-')}`}
            role="meter"
            aria-valuenow={Math.min(100, row.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={valueText}
            // The button already carries the accessible name via aria-label,
            // so the inner meter does NOT redeclare aria-label (would
            // produce duplicate SR output via the button wrap).
            style={{
              ...METER_GRID_STYLE,
              gridTemplateColumns: 'minmax(0, 104px) minmax(0, 1fr) auto auto',
            }}
          >
            <MeterContent row={row} />
            <span className="kalori-nutrition-info-cue" aria-hidden="true">
              <Info size={13} strokeWidth={1.8} />
              <span>{t.dashboard.micro.detailsCue}</span>
            </span>
          </div>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={8}
          avoidCollisions
          collisionPadding={16}
          // Constrain the tooltip to the MicronutrientPanel's column so it
          // cannot overflow into the WaterTracker column sitting beside it
          // at the 768–900px side-by-side breakpoint. The prop is only
          // spread when the ref is set (post-mount) to satisfy
          // `exactOptionalPropertyTypes`; on first render Radix falls back
          // to viewport boundary.
          {...(collisionBoundary ? { collisionBoundary: [collisionBoundary] } : {})}
          style={{
            zIndex: 52,
            maxWidth: 280,
            background: 'var(--color-bg-2)',
            border: '1px solid var(--color-rule-strong)',
            color: 'var(--color-ivory)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            lineHeight: 1.45,
            padding: 'var(--spacing-2) var(--spacing-3)',
          }}
        >
          {hoverText}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
  const [activeRow, setActiveRow] = useState<MicroRow | null>(null);
  // Panel-column boundary element: serves as the Radix Tooltip
  // `collisionBoundary` so hover tooltips cannot overflow into the
  // WaterTracker column sitting beside the MicronutrientPanel at
  // 768–900px viewport widths. We use `useState` + a callback ref instead
  // of `useRef` because we need the element to flow back into JSX as a
  // prop value — React 19 + the `react-hooks` lint rule forbid reading
  // `.current` during render. State updates only when the node
  // identity changes, so this does not produce render loops.
  const [boundaryEl, setBoundaryEl] = useState<HTMLDivElement | null>(null);

  const visible = rows.slice(0, visibleCount);
  const hidden = rows.slice(visibleCount);
  const hiddenCount = hidden.length;

  return (
    <Tooltip.Provider delayDuration={250}>
      <div ref={setBoundaryEl} id={overflowId} data-collision-boundary="micros-panel">
        {visible.map((row) => (
          <Row key={row.name} row={row} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
        ))}
        {expanded
          ? hidden.map((row) => (
              <Row key={row.name} row={row} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
            ))
          : null}
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
      <MicroBreakdownDialog row={activeRow} onClose={() => setActiveRow(null)} />
    </Tooltip.Provider>
  );
}

export default MicrosOverflowToggle;
