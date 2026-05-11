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
import { X } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import { m, motion, useReducedMotion } from '@/lib/motion/defaults';
import {
  MEAL_CATEGORIES,
  type MacroContribution,
  type MacroRow,
  type MacrosByKey,
  type MealCategory,
} from '@/lib/dashboard/types';

const MACRO_COLORS: Record<MacroRow['key'], string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
  fiber: 'var(--color-slate)',
};

const MACRO_TEXT_COLORS: Record<MacroRow['key'], string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
  fiber: 'color-mix(in srgb, var(--color-slate) 55%, var(--color-ivory))',
};

const MACRO_LABELS: Record<MacroRow['key'], string> = {
  protein: t.dashboard.macros.protein,
  carbs: t.dashboard.macros.carbs,
  fat: t.dashboard.macros.fat,
  fiber: t.dashboard.macros.fiber,
};

const MACRO_LABEL_TITLE: Record<MacroRow['key'], string> = {
  protein: t.dashboard.macros.proteinTitle,
  carbs: t.dashboard.macros.carbsTitle,
  fat: t.dashboard.macros.fatTitle,
  fiber: t.dashboard.macros.fiberTitle,
};

function buildAriaValueText(row: MacroRow): string {
  if (row.status === 'empty') {
    return t.dashboard.macros.ariaLabelEmpty.replace('{macro}', MACRO_LABELS[row.key]);
  }
  if (row.status === 'over') {
    return (
      'Over target - ' +
      t.dashboard.macros.ariaLabelOver
        .replace('{macro}', MACRO_LABELS[row.key])
        .replace('{consumed}', String(row.consumedG))
        .replace('{target}', String(row.targetG))
        .replace('{over}', String(Math.max(0, row.consumedG - row.targetG)))
    );
  }
  if (row.status === 'on-target') {
    return (
      'On target - ' +
      t.dashboard.macros.ariaLabel
        .replace('{macro}', MACRO_LABELS[row.key])
        .replace('{consumed}', String(row.consumedG))
        .replace('{target}', String(row.targetG))
        .replace('{pct}', String(row.pct))
    );
  }
  return t.dashboard.macros.ariaLabel
    .replace('{macro}', MACRO_LABELS[row.key])
    .replace('{consumed}', String(row.consumedG))
    .replace('{target}', String(row.targetG))
    .replace('{pct}', String(row.pct));
}

function formatGrams(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildHoverText(row: MacroRow): string {
  if (row.contributions.length === 0) {
    return t.dashboard.macros.breakdownHoverEmpty.replace('{macro}', MACRO_LABEL_TITLE[row.key]);
  }
  return t.dashboard.macros.breakdownHoverTop.replace(
    '{items}',
    row.contributions
      .slice(0, 3)
      .map((item) => `${item.itemName} ${formatGrams(item.grams)}${t.dashboard.ring.gramsUnit}`)
      .join(', '),
  );
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
  return rows.reduce((sum, row) => sum + row.grams, 0);
}

function MacroRowView({ row, onOpen }: { row: MacroRow; onOpen: (row: MacroRow) => void }) {
  const fillPct = Math.min(100, row.pct);
  const fillColor = row.status === 'over' ? 'var(--color-oxblood)' : MACRO_COLORS[row.key];
  const pctColor = row.status === 'over' ? 'var(--color-ember)' : 'var(--color-sand)';
  const valueText = buildAriaValueText(row);
  const isEmpty = row.status === 'empty';
  const hoverText = buildHoverText(row);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          data-testid={`macro-row-${row.key}`}
          title={hoverText}
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
              style={{
                fontSize: 'var(--type-label)',
                fontWeight: 500,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-dust)',
              }}
            >
              {MACRO_LABELS[row.key]}
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
                <span className="num">
                  {t.dashboard.macros.valueFormat.replace('{consumed}', String(row.consumedG))}
                </span>
                <span
                  style={{
                    fontStyle: 'italic',
                    fontSize: 16,
                    color: 'var(--color-sand)',
                    marginLeft: 'var(--spacing-2)',
                  }}
                  className="num"
                >
                  {t.dashboard.macros.targetSuffix.replace('{target}', String(row.targetG))}
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
          collisionPadding={16}
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

  return (
    <Dialog.Root open={true} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          className="radix-overlay"
          data-testid="macro-breakdown-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(12, 10, 8, 0.72)',
          }}
        />
        <Dialog.Content
          className="radix-content"
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
                    {t.dashboard.macros.breakdownTargetLine
                      .replace('{consumed}', String(row.consumedG))
                      .replace('{target}', String(row.targetG))}
                  </p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t.dashboard.macros.breakdownClose}
                  data-testid="macro-breakdown-close"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 44,
                    minHeight: 44,
                    color: 'var(--color-ivory)',
                    background: 'transparent',
                    border: '1px solid var(--color-rule)',
                    cursor: 'pointer',
                  }}
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
                          {t.dashboard.ring.gramsUnit}
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
                                {formatGrams(item.grams)}
                                {t.dashboard.ring.gramsUnit}
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

  return (
    <Tooltip.Provider delayDuration={250}>
      <div data-testid="macro-bars">
        <MacroRowView row={macros.protein} onOpen={setActiveRow} />
        <MacroRowView row={macros.carbs} onOpen={setActiveRow} />
        <MacroRowView row={macros.fat} onOpen={setActiveRow} />
        <MacroRowView row={macros.fiber} onOpen={setActiveRow} />
      </div>
      <MacroBreakdownDialog row={activeRow} onOpenChange={(open) => !open && setActiveRow(null)} />
    </Tooltip.Provider>
  );
}

export default MacroBars;
