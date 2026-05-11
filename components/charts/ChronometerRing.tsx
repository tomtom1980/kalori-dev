/**
 * <ChronometerRing /> — Task 3.5 dashboard RSC shell.
 *
 * Inline SVG compass + dual-arc chronometer. The 600ms consumed-arc draw
 * lives inside the `<ChronometerArcDraw>` client leaf; the rest (outer
 * compass, Roman numerals, fiber arc, now-indicator, center serif
 * calorie number, delta line, footer annotations) is RSC-only.
 *
 * A11y: wrapper carries `role="img"` with an `aria-label` covering
 * consumed, target, pct, status in plain words. SVG subtree is
 * `aria-hidden="true"`. `<details><summary>View as data table</summary>`
 * below the ring renders the same numbers as an SR-navigable table for
 * users who prefer non-visual data access.
 *
 * Center calorie number uses `clamp()` so it scales with 200% zoom
 * without breaking layout (ux-auditor §5.3).
 */
import { ChronometerArcDraw } from './ChronometerArcDraw';
import { AnimatedNumber } from '@/components/primitives/AnimatedNumber';

import { t } from '@/lib/i18n/en';
import { formatTimeInTimeZone } from '@/lib/time/format';
import type { ChronometerData, ChronometerStatus } from '@/lib/dashboard/types';

const VIEWBOX_SIZE = 360;
const CENTER = 180;
const CONSUMED_R = 132;
const FIBER_R = 112;
const OUTER_R = 164;
const CONSUMED_STROKE = 10;
const FIBER_STROKE = 'var(--color-slate)';

const STATUS_COLOR: Record<ChronometerStatus, string> = {
  default: 'var(--color-oxblood)',
  approaching: 'var(--color-ember)',
  'on-target': 'var(--color-moss)',
  'over-target': 'var(--color-oxblood)',
  'way-over': 'var(--color-oxblood)',
};

/**
 * Format a number for display. Renders an em-dash ("—") for null/undefined
 * so the ring never surfaces a literal "null" string if a user lands on
 * /dashboard before onboarding completes (the onboarding guard in
 * `app/(app)/dashboard/page.tsx` should prevent that, but this is
 * defense-in-depth per F-UI-3.7-B — `profiles.calorie_target` is nullable
 * per migration 0002).
 */
function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function formatPercent(consumed: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.round((consumed / target) * 100);
}

function buildDeltaCopy(data: Extract<ChronometerData, { consumed: number }>): string {
  const remain = Math.max(0, data.target - data.consumed);
  const over = Math.max(0, data.consumed - data.target);
  const pct = formatPercent(data.consumed, data.target);
  if (data.status === 'way-over') {
    return t.dashboard.ring.remainWayOver.replace('{over}', String(over));
  }
  if (data.status === 'over-target') {
    return t.dashboard.ring.remainOver.replace('{over}', String(over));
  }
  if (data.status === 'on-target') {
    return t.dashboard.ring.remainOnTarget;
  }
  if (data.status === 'approaching' || pct >= 80) {
    return t.dashboard.ring.remainApproaching.replace('{remain}', String(remain));
  }
  return t.dashboard.ring.remainUnder.replace('{remain}', String(remain));
}

function statusText(status: ChronometerStatus): string {
  switch (status) {
    case 'approaching':
      return t.dashboard.ring.statusApproaching;
    case 'on-target':
      return t.dashboard.ring.statusOnTarget;
    case 'over-target':
      return t.dashboard.ring.statusOverTarget;
    case 'way-over':
      return t.dashboard.ring.statusWayOver;
    default:
      return t.dashboard.ring.statusDefault;
  }
}

function formatLastLogged(iso: string | null, timezone: string): string {
  if (!iso) return t.dashboard.ring.footerLastLoggedNever;
  return formatTimeInTimeZone(iso, timezone);
}

export interface ChronometerRingProps {
  data: ChronometerData;
  timezone?: string;
}

export function ChronometerRing({ data, timezone = 'UTC' }: ChronometerRingProps) {
  // Normalize to a uniform render shape.
  const consumed =
    data.status === 'loading' || data.status === 'error'
      ? 0
      : data.status === 'empty'
        ? 0
        : data.consumed;
  // Target may be null at runtime — the DB column `profiles.calorie_target`
  // is nullable, so a user between `handle_new_user()` auto-insert and
  // onboarding completion has no target set. F-UI-3.7-B defense-in-depth:
  // normalize null/undefined/NaN to 0 for math and render "—" via
  // `formatNumber` below.
  const rawTarget = 'target' in data ? data.target : 0;
  const targetForMath =
    rawTarget === null || rawTarget === undefined || Number.isNaN(rawTarget) ? 0 : rawTarget;
  const target = targetForMath;
  const pct = formatPercent(consumed, target);
  const status =
    data.status === 'loading' || data.status === 'error' || data.status === 'empty'
      ? 'default'
      : data.status;
  const fiberConsumed = 'fiber' in data ? data.fiber.consumed : 0;
  const fiberTarget = 'fiber' in data ? data.fiber.target : 25;
  const entryCount = 'entryCount' in data ? data.entryCount : 0;
  const lastLoggedAt = 'lastLoggedAt' in data ? data.lastLoggedAt : null;

  const circumference = 2 * Math.PI * CONSUMED_R;
  const pctClamped = Math.max(0, Math.min(1, consumed / Math.max(target, 1)));
  const offset = circumference * (1 - pctClamped);
  const stroke = STATUS_COLOR[status];

  const isEmpty = data.status === 'empty';
  // Use `formatNumber(rawTarget)` so a null target becomes "—" in the aria
  // label rather than the literal word "null" — F-UI-3.7-B defense-in-depth.
  const ariaLabel = t.dashboard.ring.ariaLabel
    .replace('{consumed}', String(consumed))
    .replace('{target}', formatNumber(rawTarget))
    .replace('{pct}', String(pct))
    .replace('{status}', statusText(status));

  const deltaCopy =
    data.status === 'loading' || data.status === 'error' || data.status === 'empty'
      ? ''
      : buildDeltaCopy(data);

  const fiberCirc = 2 * Math.PI * FIBER_R;
  const fiberOffset =
    fiberCirc * (1 - Math.max(0, Math.min(1, fiberConsumed / Math.max(fiberTarget, 1))));

  return (
    <div
      data-testid="chronometer-ring"
      role="img"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // Phase 7 regression fix (REG-2): allow the ring to shrink when its
        // grid-column track is narrower than 280px (e.g. 768px viewport with
        // sidebar + 32px padding leaves ~218px per dashboard hero column).
        // The wrapper still enforces aspect ratio via SVG viewBox; the inner
        // 280×280 div now scales via aspect-ratio + max-width instead of a
        // hard 280px width.
        width: '100%',
        minWidth: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 280,
          aspectRatio: '1 / 1',
        }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: 'block' }}
        >
          {/* Outer compass circle */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_R}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={1}
          />
          {/* Consumed arc background track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={CONSUMED_R}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={CONSUMED_STROKE}
          />
          {/* Consumed arc (client-drawn) */}
          <ChronometerArcDraw
            cx={CENTER}
            cy={CENTER}
            r={CONSUMED_R}
            circumference={circumference}
            offset={offset}
            stroke={stroke}
            strokeWidth={CONSUMED_STROKE}
          />
          {/* Fiber arc track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={FIBER_R}
            fill="none"
            stroke="var(--color-rule)"
            strokeWidth={2}
          />
          {/* Fiber arc fill */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={FIBER_R}
            fill="none"
            stroke={FIBER_STROKE}
            strokeWidth={2}
            strokeDasharray={fiberCirc}
            strokeDashoffset={fiberOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
          {/* Hour numerals (I / IV / VII / X) */}
          {[
            { x: CENTER, y: 30, text: 'I' },
            { x: VIEWBOX_SIZE - 22, y: CENTER + 4, text: 'IV' },
            { x: CENTER, y: VIEWBOX_SIZE - 18, text: 'VII' },
            { x: 24, y: CENTER + 4, text: 'X' },
          ].map((p) => (
            <text
              key={p.text}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              fontFamily="var(--font-serif)"
              fontSize={11}
              fontStyle="italic"
              fill="var(--color-dust)"
            >
              {p.text}
            </text>
          ))}
        </svg>
        {/* Center stack overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <AnimatedNumber
            value={consumed}
            formatValue={formatNumber}
            data-testid="chrono-consumed"
            className="num"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(48px, 14vw, 82px)',
              fontWeight: 300,
              lineHeight: 1,
              color: 'var(--color-ivory)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--color-sand)',
              marginTop: 4,
            }}
          >
            {t.dashboard.ring.fractionOfTarget.replace('{target}', formatNumber(rawTarget))}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
              marginTop: 6,
            }}
          >
            {isEmpty ? t.dashboard.ring.emptyCaption : t.dashboard.ring.subLabel}
          </span>
        </div>
      </div>

      {/* Delta line */}
      {!isEmpty && deltaCopy ? (
        <p
          data-testid="chrono-delta"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 15,
            color: 'var(--color-sand)',
            marginTop: 'var(--spacing-3)',
          }}
        >
          {deltaCopy}
        </p>
      ) : null}

      {/* Footer annotations */}
      {!isEmpty ? (
        <p
          className="num"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-dust)',
            marginTop: 'var(--spacing-2)',
          }}
        >
          {t.dashboard.ring.footerAnnotations
            .replace('{entries}', String(entryCount))
            .replace('{pct}', String(pct))
            .replace('{time}', formatLastLogged(lastLoggedAt, timezone))}
        </p>
      ) : null}

      {/* Data-table fallback for screen readers */}
      <details data-testid="chrono-data-table" style={{ marginTop: 'var(--spacing-3)' }}>
        <summary
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            cursor: 'pointer',
            minHeight: 44,
            padding: 'var(--spacing-3) 0',
          }}
        >
          {t.dashboard.ring.dataTableSummary}
        </summary>
        <table
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--color-ivory)',
          }}
        >
          <thead>
            <tr>
              <th>{t.dashboard.ring.dataTableHeadMetric}</th>
              <th>{t.dashboard.ring.dataTableHeadValue}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t.dashboard.ring.dataTableRowConsumed}</td>
              <td>{`${formatNumber(consumed)} ${t.dashboard.ring.kcalUnit}`}</td>
            </tr>
            <tr>
              <td>{t.dashboard.ring.dataTableRowTarget}</td>
              <td>{`${formatNumber(rawTarget)} ${t.dashboard.ring.kcalUnit}`}</td>
            </tr>
            <tr>
              <td>{t.dashboard.ring.dataTableRowPercent}</td>
              <td>{`${pct}%`}</td>
            </tr>
            <tr>
              <td>{t.dashboard.ring.dataTableRowFiber}</td>
              <td>{`${fiberConsumed} / ${fiberTarget} ${t.dashboard.ring.gramsUnit}`}</td>
            </tr>
            <tr>
              <td>{t.dashboard.ring.dataTableRowEntries}</td>
              <td>{entryCount}</td>
            </tr>
            <tr>
              <td>{t.dashboard.ring.dataTableRowLastLogged}</td>
              <td>{formatLastLogged(lastLoggedAt, timezone)}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default ChronometerRing;
