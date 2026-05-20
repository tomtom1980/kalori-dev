'use client';

/**
 * <MacroBars /> - dashboard macro summary.
 *
 * The row visuals still behave like the original three meter bars, but each
 * row is now an interactive trigger. Hover/focus shows a compact contributor
 * preview and click opens the full daily breakdown for that macro.
 */
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Info, X } from 'lucide-react';
import { useState } from 'react';

import { buildMacroHoverText } from '@/lib/dashboard/build-hover-text-utils';
import { t } from '@/lib/i18n/en';
import { m, motion, useReducedMotion } from '@/lib/motion/defaults';
import {
  MEAL_CATEGORIES,
  type MacroContribution,
  type MacroRow,
  type MacrosByKey,
  type MealCategory,
} from '@/lib/dashboard/types';

// Phase 2A (2026-05-16) — cholesterol is the 5th macro row.
//
// 2026-05-16 fix: original swatch was `--color-rule-strong`, the same
// token applied to the bar's track/rail background. The fill rendered
// at the correct width but was invisible against the identical-coloured
// rail — users reported "cholesterol bar has no color and no fill".
//
// Switched to `--color-plum` (#5d3a44), the 5th-series data palette
// token reserved in `globals.css` for exactly this purpose. Still muted
// (signals "limit, not target") but visually distinct from the rail.
// Over-target still falls through to the oxblood warning used for
// fat-over / carbs-over.
const MACRO_COLORS: Record<MacroRow['key'], string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
  fiber: 'var(--color-slate)',
  cholesterol: 'var(--color-plum)',
};

const MACRO_TEXT_COLORS: Record<MacroRow['key'], string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
  fiber: 'color-mix(in srgb, var(--color-slate) 55%, var(--color-ivory))',
  cholesterol: 'var(--color-dust)',
};

const MACRO_LABELS: Record<MacroRow['key'], string> = {
  protein: t.dashboard.macros.protein,
  carbs: t.dashboard.macros.carbs,
  fat: t.dashboard.macros.fat,
  fiber: t.dashboard.macros.fiber,
  cholesterol: t.dashboard.macros.cholesterol,
};

const MACRO_LABEL_TITLE: Record<MacroRow['key'], string> = {
  protein: t.dashboard.macros.proteinTitle,
  carbs: t.dashboard.macros.carbsTitle,
  fat: t.dashboard.macros.fatTitle,
  fiber: t.dashboard.macros.fiberTitle,
  cholesterol: t.dashboard.macros.cholesterolTitle,
};

/**
 * Returns the row's display unit (`'g'` or `'mg'`). Defaults to `'g'`
 * for legacy fixtures where `unit` is omitted — aggregator-produced rows
 * always populate it.
 */
function rowUnit(row: Pick<MacroRow, 'unit'>): 'g' | 'mg' {
  return row.unit ?? 'g';
}

/**
 * Returns the per-contribution numeric value (g or mg, same scale as
 * `row.unit`). Prefer `amount` (unit-aware sibling added 2026-05-16);
 * fall back to legacy `grams` for older fixtures.
 */
function contributionAmount(item: Pick<MacroContribution, 'amount' | 'grams'>): number {
  return item.amount ?? item.grams;
}

function buildAriaValueText(row: MacroRow): string {
  if (row.status === 'empty') {
    return t.dashboard.macros.ariaLabelEmpty.replace('{macro}', MACRO_LABELS[row.key]);
  }
  // Codex R1 F3 fix — branch aria templates on `row.unit`. Cholesterol
  // (unit `mg`) previously announced through the grams template as
  // "250 grams of 300 target" — a 1000x unit error for assistive tech.
  // Pick the milligram-aware variant when the row is mg-denominated.
  const isMg = (row.unit ?? 'g') === 'mg';
  if (row.status === 'over') {
    const template = isMg ? t.dashboard.macros.ariaLabelOverMg : t.dashboard.macros.ariaLabelOver;
    return (
      'Over target - ' +
      template
        .replace('{macro}', MACRO_LABELS[row.key])
        .replace('{consumed}', String(row.consumedG))
        .replace('{target}', String(row.targetG))
        .replace('{over}', String(Math.max(0, row.consumedG - row.targetG)))
    );
  }
  const template = isMg ? t.dashboard.macros.ariaLabelMg : t.dashboard.macros.ariaLabel;
  if (row.status === 'on-target') {
    return (
      'On target - ' +
      template
        .replace('{macro}', MACRO_LABELS[row.key])
        .replace('{consumed}', String(row.consumedG))
        .replace('{target}', String(row.targetG))
        .replace('{pct}', String(row.pct))
    );
  }
  return template
    .replace('{macro}', MACRO_LABELS[row.key])
    .replace('{consumed}', String(row.consumedG))
    .replace('{target}', String(row.targetG))
    .replace('{pct}', String(row.pct));
}

function formatGrams(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function byMeal(rows: MacroContribution[]): Record<MealCategory, MacroContribution[]> {
  return MEAL_CATEGORIES.reduce(
    (acc, meal) => {
      acc[meal] = rows.filter((row) => row.mealCategory === meal);
      return acc;
    },
    {} as Record<MealCategory, MacroContribution[]>,
  );
}

function mealTotal(rows: MacroContribution[]): number {
  return rows.reduce((sum, row) => sum + contributionAmount(row), 0);
}

function MacroRowView({
  row,
  onOpen,
  collisionBoundary,
}: {
  row: MacroRow;
  onOpen: (row: MacroRow) => void;
  collisionBoundary: Element | null;
}) {
  const fillPct = Math.min(100, row.pct);
  const fillColor = row.status === 'over' ? 'var(--color-oxblood)' : MACRO_COLORS[row.key];
  const pctColor = row.status === 'over' ? 'var(--color-ember)' : 'var(--color-sand)';
  const valueText = buildAriaValueText(row);
  const isEmpty = row.status === 'empty';
  const hoverText = buildMacroHoverText(row);
  const unit = rowUnit(row);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="kalori-nutrition-trigger kalori-nutrition-trigger--macro"
          data-testid={`macro-row-${row.key}`}
          aria-label={t.dashboard.macros.breakdownTriggerA11y
            .replace('{macro}', MACRO_LABEL_TITLE[row.key])
            .replace('{summary}', valueText)}
          onClick={() => onOpen(row)}
          style={{
            display: 'block',
            width: '100%',
            marginBottom: 'var(--spacing-4)',
            padding: 'var(--spacing-2)',
            fontFamily: 'var(--font-sans)',
            color: 'inherit',
            background: 'transparent',
            border: '1px solid transparent',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {/* Head row: name + pct */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 'var(--spacing-1)',
            }}
          >
            <span
              className="kalori-nutrition-label-with-cue"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
                fontSize: 'var(--type-label)',
                fontWeight: 500,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-dust)',
              }}
            >
              {MACRO_LABELS[row.key]}
              <span className="kalori-nutrition-info-cue" aria-hidden="true">
                <Info size={13} strokeWidth={1.8} />
                <span>{t.dashboard.macros.detailsCue}</span>
              </span>
            </span>
            <span
              className="num"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--type-label)',
                color: pctColor,
              }}
            >
              {row.status === 'over'
                ? t.dashboard.macros.pctOverFormat.replace('{pct}', String(row.pct))
                : isEmpty
                  ? t.dashboard.macros.emptyPct
                  : t.dashboard.macros.pctFormat.replace('{pct}', String(row.pct))}
              {row.status === 'over' ? ' ' + t.dashboard.macros.overSuffix : ''}
            </span>
          </div>
          {/* Value row: grams + italic `/ targetG` */}
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 28,
              fontWeight: 300,
              color: 'var(--color-ivory)',
              marginBottom: 'var(--spacing-2)',
            }}
          >
            {isEmpty ? (
              <span className="num">{t.dashboard.macros.emptyValue}</span>
            ) : (
              <>
                <span className="num">{`${row.consumedG}${unit}`}</span>
                <span
                  style={{
                    fontStyle: 'italic',
                    fontSize: 16,
                    color: 'var(--color-sand)',
                    marginLeft: 'var(--spacing-2)',
                  }}
                  className="num"
                >
                  {`/ ${row.targetG}${unit}`}
                </span>
              </>
            )}
          </div>
          <div
            data-prefers-reduced-motion="reduce-via-globals"
            aria-hidden="true"
            style={{
              position: 'relative',
              height: 8,
              background: 'var(--color-rule-strong)',
              outline: row.status === 'on-target' ? '2px solid var(--color-moss)' : 'none',
              outlineOffset: '0',
              opacity: isEmpty ? 0.5 : 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: fillColor,
                transformOrigin: 'left center',
                transform: `scaleX(${fillPct / 100})`,
                transition: 'transform var(--motion-expressive) var(--ease-editorial)',
              }}
            />
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
          // Constrain the tooltip to the MacroBars column so it cannot
          // overflow into the ChronometerRing column at the 768px+
          // side-by-side hero breakpoint. The prop is only spread when
          // the ref is set (post-mount) to satisfy
          // `exactOptionalPropertyTypes`; on first render Radix falls
          // back to viewport boundary.
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

function MacroBreakdownDialog({
  row,
  onOpenChange,
}: {
  row: MacroRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const reducedMotion = useReducedMotion();
  if (!row) return null;

  const grouped = byMeal(row.contributions);
  const title = t.dashboard.macros.breakdownTitle.replace('{macro}', MACRO_LABEL_TITLE[row.key]);
  const hasContributions = row.contributions.length > 0;
  const unit = rowUnit(row);

  return (
    <Dialog.Root open={true} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="macro-breakdown-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(12, 10, 8, 0.72)',
          }}
        />
        <Dialog.Content
          data-testid="macro-breakdown-dialog"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            zIndex: 51,
            width: 'min(560px, calc(100vw - 32px))',
            maxHeight: 'min(720px, calc(100vh - 32px))',
            transform: 'translate(-50%, -50%)',
            outline: 'none',
          }}
        >
          <m.div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-4)',
              maxHeight: 'min(720px, calc(100vh - 32px))',
              overflow: 'hidden',
              background: 'var(--color-bg-2)',
              border: '1px solid var(--color-rule-strong)',
              padding: 'var(--spacing-5)',
            }}
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : motion.expressive}
          >
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--spacing-4)',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    marginBottom: 'var(--spacing-1)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--type-label)',
                    fontWeight: 500,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: 'var(--color-dust)',
                  }}
                >
                  {t.dashboard.macros.breakdownKicker}
                </p>
                <Dialog.Title
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-serif)',
                    fontSize: 30,
                    fontWeight: 300,
                    lineHeight: 1.1,
                    color: 'var(--color-ivory)',
                  }}
                >
                  {title}
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p
                    style={{
                      margin: 0,
                      marginTop: 'var(--spacing-2)',
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 15,
                      color: 'var(--color-sand)',
                    }}
                  >
                    {t.dashboard.macros.breakdownTargetLineUnit
                      .replace('{consumed}', String(row.consumedG))
                      .replace('{target}', String(row.targetG))
                      .replace(/\{unit\}/g, unit)}
                  </p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t.dashboard.macros.breakdownClose}
                  data-testid="macro-breakdown-close"
                  className="kalori-log-close"
                >
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-4)',
                overflowY: 'auto',
                paddingRight: 'var(--spacing-1)',
              }}
            >
              {!hasContributions ? (
                <p
                  data-testid="macro-breakdown-empty"
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-serif)',
                    fontStyle: 'italic',
                    fontSize: 16,
                    color: 'var(--color-sand)',
                  }}
                >
                  {t.dashboard.macros.breakdownEmpty.replace(
                    '{macro}',
                    MACRO_LABEL_TITLE[row.key].toLowerCase(),
                  )}
                </p>
              ) : (
                MEAL_CATEGORIES.map((meal) => {
                  const rows = grouped[meal];
                  if (rows.length === 0) return null;
                  const total = mealTotal(rows);
                  return (
                    <section key={meal} data-testid={`macro-breakdown-meal-${meal}`}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 'var(--spacing-3)',
                          borderBottom: '1px solid var(--color-rule)',
                          paddingBottom: 'var(--spacing-2)',
                          marginBottom: 'var(--spacing-2)',
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontFamily: 'var(--font-sans)',
                            fontSize: 'var(--type-label)',
                            fontWeight: 500,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'var(--color-dust)',
                          }}
                        >
                          {t.dashboard.meals.categoryLabel[meal]}
                        </h3>
                        <span
                          className="num"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--color-sand)',
                          }}
                        >
                          {formatGrams(total)}
                          {unit}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--spacing-2)',
                        }}
                      >
                        {rows.map((item) => (
                          <div
                            key={item.id}
                            data-testid={`macro-breakdown-item-${item.entryId}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(0, 1fr) auto',
                              gap: 'var(--spacing-3)',
                              alignItems: 'baseline',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontFamily: 'var(--font-serif)',
                                  fontStyle: 'italic',
                                  fontSize: 18,
                                  color: 'var(--color-ivory)',
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {item.itemName}
                              </p>
                              <p
                                className="num"
                                style={{
                                  margin: 0,
                                  marginTop: 2,
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  color: 'var(--color-dust)',
                                }}
                              >
                                {item.portionLabel}
                              </p>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                              }}
                            >
                              <span
                                className="num"
                                style={{
                                  fontFamily: 'var(--font-serif)',
                                  fontStyle: 'italic',
                                  fontSize: 18,
                                  color: MACRO_TEXT_COLORS[row.key],
                                }}
                              >
                                {formatGrams(contributionAmount(item))}
                                {unit}
                              </span>
                              <span
                                className="num"
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  color: 'var(--color-dust)',
                                }}
                              >
                                {t.dashboard.macros.breakdownPctOfTotal.replace(
                                  '{pct}',
                                  String(item.pctOfTotal),
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface MacroBarsProps {
  macros: MacrosByKey;
}

export function MacroBars({ macros }: MacroBarsProps) {
  const [activeRow, setActiveRow] = useState<MacroRow | null>(null);
  // Column-boundary element: serves as the Radix Tooltip
  // `collisionBoundary` so hover tooltips on macro rows cannot overflow
  // into the ChronometerRing column at the 768px+ side-by-side hero
  // breakpoint. `useState` + callback ref instead of `useRef` because
  // React 19 + the `react-hooks` lint rule forbid reading `.current`
  // during render. State updates only when the node identity changes,
  // so this does not produce render loops.
  const [boundaryEl, setBoundaryEl] = useState<HTMLDivElement | null>(null);

  return (
    <Tooltip.Provider delayDuration={250}>
      <div ref={setBoundaryEl} data-testid="macro-bars" data-collision-boundary="macros-column">
        <MacroRowView row={macros.protein} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
        <MacroRowView row={macros.carbs} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
        <MacroRowView row={macros.fat} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
        <MacroRowView row={macros.fiber} onOpen={setActiveRow} collisionBoundary={boundaryEl} />
        {/* Phase 2A (2026-05-16) — cholesterol 5th row. Optional on the
            MacrosByKey type so legacy fixtures still compile; the
            aggregator always produces it. */}
        {macros.cholesterol ? (
          <MacroRowView
            row={macros.cholesterol}
            onOpen={setActiveRow}
            collisionBoundary={boundaryEl}
          />
        ) : null}
      </div>
      <MacroBreakdownDialog row={activeRow} onOpenChange={(open) => !open && setActiveRow(null)} />
    </Tooltip.Provider>
  );
}

export default MacroBars;
