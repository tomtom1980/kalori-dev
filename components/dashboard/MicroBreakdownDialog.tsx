'use client';

/**
 * <MicroBreakdownDialog /> — Phase 2B parity with MacroBars breakdown dialog.
 *
 * Renders a modal showing the full per-source breakdown of one micronutrient
 * row. Mirrors the structure + styling of `MacroBreakdownDialog` inside
 * `MacroBars.tsx` (inline styles, Radix Dialog + Tooltip primitives, Ledger
 * tokens, 44×44 min touch targets). Key differences vs macros:
 *
 *   - Unit-aware: amounts append `row.unit` (mg / mcg / IU / g) rather than
 *     hard-coding grams.
 *   - Status-tinted: amount column tinted by `MICRO_TEXT_COLORS[row.status]`
 *     so over-target rows read as oxblood, "good" rows as moss, etc.
 *   - Target line copes with `rda === null` (no canonical RDA known) by
 *     swapping to a "no reference" copy.
 *
 * Z-index layering follows MacroBars: Tooltip 52, Dialog 51, Overlay 50.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { t } from '@/lib/i18n/en';
import { m, motion, useReducedMotion } from '@/lib/motion/defaults';
import {
  MEAL_CATEGORIES,
  type MealCategory,
  type MicroContribution,
  type MicroRow,
  type MicroStatus,
} from '@/lib/dashboard/types';

const MICRO_TEXT_COLORS: Record<MicroStatus, string> = {
  low: 'var(--color-ember)',
  mid: 'var(--color-sand)',
  good: 'var(--color-moss)',
  over: 'var(--color-oxblood-soft)',
  // Codex R2 I2 (bugfix-tomi 2026-05-17-micros-display-consistency) —
  // neutral typographic tone for RDA-unknown rows so the breakdown
  // dialog amounts (sugar / caffeine / orphan rows) do NOT inherit the
  // red ember color reserved for measurable-low rows. Matches the
  // `unknown` entry in `MicrosOverflowToggle.PCT_COLOR`.
  unknown: 'var(--color-dust)',
};

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function withUnit(amount: number, unit: string | undefined): string {
  return `${formatAmount(amount)}${unit ?? ''}`;
}

function byMeal(rows: MicroContribution[]): Record<MealCategory, MicroContribution[]> {
  return MEAL_CATEGORIES.reduce(
    (acc, meal) => {
      acc[meal] = rows.filter((row) => row.mealCategory === meal);
      return acc;
    },
    {} as Record<MealCategory, MicroContribution[]>,
  );
}

function mealTotal(rows: MicroContribution[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export interface MicroBreakdownDialogProps {
  row: MicroRow | null;
  onClose: () => void;
}

export function MicroBreakdownDialog({ row, onClose }: MicroBreakdownDialogProps) {
  const reducedMotion = useReducedMotion();
  if (!row) return null;

  const contributions = row.contributions ?? [];
  const grouped = byMeal(contributions);
  const unit = row.unit ?? '';
  const title = t.dashboard.micro.breakdownTitle.replace('{name}', row.name);
  const targetLine =
    row.rda !== null
      ? t.dashboard.micro.breakdownTargetLineWithRda
          .replace('{consumed}', formatAmount(row.consumed))
          .replace('{target}', formatAmount(row.rda))
          // Two `{unit}` tokens — replace both with the same suffix.
          .replaceAll('{unit}', unit)
      : t.dashboard.micro.breakdownTargetLineNoRda
          .replace('{consumed}', formatAmount(row.consumed))
          .replace('{unit}', unit);
  const hasContributions = contributions.length > 0;
  const amountColor = MICRO_TEXT_COLORS[row.status];

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="micro-breakdown-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(12, 10, 8, 0.72)',
          }}
        />
        <Dialog.Content
          data-testid="micro-breakdown-dialog"
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
                  {t.dashboard.micro.breakdownKicker}
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
                    {targetLine}
                  </p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t.dashboard.micro.breakdownClose}
                  data-testid="micro-breakdown-close"
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
                  data-testid="micro-breakdown-empty"
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-serif)',
                    fontStyle: 'italic',
                    fontSize: 16,
                    color: 'var(--color-sand)',
                  }}
                >
                  {t.dashboard.micro.breakdownEmpty.replace('{name}', row.name)}
                </p>
              ) : (
                MEAL_CATEGORIES.map((meal) => {
                  const rows = grouped[meal];
                  if (rows.length === 0) return null;
                  const total = mealTotal(rows);
                  return (
                    <section key={meal} data-testid={`micro-breakdown-meal-${meal}`}>
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
                          {withUnit(total, unit)}
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
                            data-testid={`micro-breakdown-item-${item.entryId}`}
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
                                  color: amountColor,
                                }}
                              >
                                {withUnit(item.amount, item.unit)}
                              </span>
                              <span
                                className="num"
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 11,
                                  color: 'var(--color-dust)',
                                }}
                              >
                                {t.dashboard.micro.breakdownPctOfTotal.replace(
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

export default MicroBreakdownDialog;
