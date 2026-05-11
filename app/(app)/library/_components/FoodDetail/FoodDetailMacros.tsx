'use client';

/**
 * <FoodDetailMacros /> — Task 4.2.
 *
 * § 04 · NUTRITION block. Four-sided hairline frame with ember corner
 * labels. Kcal hero right-aligned inside the frame. Macro bars + micro
 * table beneath. In edit mode, each numeric becomes a 44px Mono input.
 */
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

import type { DraftState, EditErrors, DraftKey } from './useFoodDetailEdit';
import { formatGrams, formatKcal, formatMilligrams } from './foodDetail.format';

const MACRO_COLORS: Record<'protein' | 'carbs' | 'fat', string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
};

export interface FoodDetailMacrosProps {
  item: LibraryItem;
  editing: boolean;
  draft: DraftState;
  errors: EditErrors;
  onDraftChange: (key: DraftKey, value: string) => void;
}

function summaryText(item: LibraryItem): string {
  const kcal = item.nutrition.kcal;
  const p = item.nutrition.macros?.protein_g ?? null;
  const c = item.nutrition.macros?.carbs_g ?? null;
  const f = item.nutrition.macros?.fat_g ?? null;
  return `${formatKcal(kcal)} ${t.library.detail.kcalSuffix}, ${formatGrams(p)}g protein, ${formatGrams(c)}g carbs, ${formatGrams(f)}g fat.`;
}

function fillPct(value: number | null | undefined, denominator: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, (value / denominator) * 100));
}

export function FoodDetailMacros({
  item,
  editing,
  draft,
  errors,
  onDraftChange,
}: FoodDetailMacrosProps) {
  const macros = item.nutrition.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };
  const micros = item.nutrition.micros ?? {};
  const sodiumMg = typeof micros.sodium_mg === 'number' ? micros.sodium_mg : null;

  // Macro bar denominators are rough daily-target equivalents so the bars
  // give a visual sense of scale. The briefing doesn't specify targets;
  // we pick reasonable constants (50g / 300g / 70g) which match the Task
  // 4.1 library card macro pattern.
  const PROTEIN_TARGET = 50;
  const CARBS_TARGET = 300;
  const FAT_TARGET = 70;

  return (
    <div>
      <div className="kalori-fd-kcal-frame" data-testid="food-detail-kcal-frame">
        <span className="kalori-fd-kcal-corner" data-corner="tl">
          {t.library.detail.cornerLabelSource}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="tr">
          {t.library.detail.cornerLabelRecorded}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="bl">
          {t.library.detail.cornerLabelPortion}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="br">
          {t.library.detail.cornerLabelDate}
        </span>

        <div className="kalori-fd-kcal-hero">
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <label className="sr-only" htmlFor="fd-edit-kcal">
                {t.library.detail.kcalLabel}
              </label>
              <input
                id="fd-edit-kcal"
                type="text"
                inputMode="numeric"
                value={draft.kcal}
                onChange={(e) => onDraftChange('kcal', e.target.value)}
                aria-label={t.library.detail.kcalLabel}
                aria-invalid={Boolean(errors.kcal)}
                data-testid="food-detail-edit-kcal-input"
                className="kalori-fd-input kalori-fd-input-num"
                style={{ maxWidth: 160 }}
              />
              {errors.kcal ? (
                <p
                  role="alert"
                  className="kalori-fd-error"
                  data-testid="food-detail-edit-kcal-error"
                >
                  {errors.kcal}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="kalori-fd-kcal-value num" data-testid="food-detail-kcal-value">
              {formatKcal(item.nutrition.kcal)}
            </span>
          )}
          <span className="kalori-fd-kcal-suffix">{t.library.detail.kcalSuffix}</span>
        </div>
      </div>

      <p id="food-detail-macros-summary" className="sr-only">
        {summaryText(item)}
      </p>

      <div className="kalori-fd-macros" data-testid="food-detail-macros">
        <MacroDisplay
          name={t.library.detail.macroProtein}
          value={macros.protein_g ?? null}
          unit="g"
          fill={fillPct(macros.protein_g ?? 0, PROTEIN_TARGET)}
          color={MACRO_COLORS.protein}
          editing={editing}
          inputValue={draft.protein_g}
          errorKey="protein_g"
          error={errors.protein_g}
          onDraftChange={onDraftChange}
        />
        <MacroDisplay
          name={t.library.detail.macroCarbs}
          value={macros.carbs_g ?? null}
          unit="g"
          fill={fillPct(macros.carbs_g ?? 0, CARBS_TARGET)}
          color={MACRO_COLORS.carbs}
          editing={editing}
          inputValue={draft.carbs_g}
          errorKey="carbs_g"
          error={errors.carbs_g}
          onDraftChange={onDraftChange}
        />
        <MacroDisplay
          name={t.library.detail.macroFat}
          value={macros.fat_g ?? null}
          unit="g"
          fill={fillPct(macros.fat_g ?? 0, FAT_TARGET)}
          color={MACRO_COLORS.fat}
          editing={editing}
          inputValue={draft.fat_g}
          errorKey="fat_g"
          error={errors.fat_g}
          onDraftChange={onDraftChange}
        />
      </div>

      <div className="kalori-fd-micros" data-testid="food-detail-micros">
        {editing ? (
          <>
            <label htmlFor="fd-edit-fiber" className="kalori-fd-micro-name">
              {t.library.detail.macroFiber}
            </label>
            <input
              id="fd-edit-fiber"
              type="text"
              inputMode="decimal"
              value={draft.fiber_g}
              onChange={(e) => onDraftChange('fiber_g', e.target.value)}
              aria-label={t.library.detail.macroFiber}
              aria-invalid={Boolean(errors.fiber_g)}
              data-testid="food-detail-edit-fiber-input"
              className="kalori-fd-input kalori-fd-input-num"
            />
            <label htmlFor="fd-edit-sugar" className="kalori-fd-micro-name">
              {t.library.detail.macroSugar}
            </label>
            <input
              id="fd-edit-sugar"
              type="text"
              inputMode="decimal"
              value={draft.sugar_g}
              onChange={(e) => onDraftChange('sugar_g', e.target.value)}
              aria-label={t.library.detail.macroSugar}
              aria-invalid={Boolean(errors.sugar_g)}
              data-testid="food-detail-edit-sugar-input"
              className="kalori-fd-input kalori-fd-input-num"
            />
            <label htmlFor="fd-edit-sodium" className="kalori-fd-micro-name">
              {t.library.detail.microSodium}
            </label>
            <input
              id="fd-edit-sodium"
              type="text"
              inputMode="decimal"
              value={draft.sodium_mg}
              onChange={(e) => onDraftChange('sodium_mg', e.target.value)}
              aria-label={t.library.detail.microSodium}
              aria-invalid={Boolean(errors.sodium_mg)}
              data-testid="food-detail-edit-sodium-input"
              className="kalori-fd-input kalori-fd-input-num"
            />
          </>
        ) : (
          <MicrosReadOnly
            fiberG={macros.fiber_g ?? null}
            sugarG={(macros as { sugar_g?: number }).sugar_g ?? null}
            sodiumMg={sodiumMg}
          />
        )}
      </div>
    </div>
  );
}

interface MacroDisplayProps {
  name: string;
  value: number | null;
  unit: string;
  fill: number;
  color: string;
  editing: boolean;
  inputValue: string;
  errorKey: DraftKey;
  error: string | undefined;
  onDraftChange: (key: DraftKey, value: string) => void;
}

function MacroDisplay(props: MacroDisplayProps) {
  const { name, value, unit, fill, color, editing, inputValue, errorKey, error, onDraftChange } =
    props;
  if (editing) {
    const id = `fd-edit-${errorKey}`;
    return (
      <div className="kalori-fd-macro-row">
        <label htmlFor={id} className="kalori-fd-macro-label">
          {name}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => onDraftChange(errorKey, e.target.value)}
          aria-label={name}
          aria-invalid={Boolean(error)}
          data-testid={`food-detail-edit-${errorKey}-input`}
          className="kalori-fd-input kalori-fd-input-num"
          style={{ maxWidth: 120 }}
        />
        {error ? (
          <p role="alert" className="kalori-fd-error" style={{ gridColumn: '1 / -1' }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="kalori-fd-macro-row"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      aria-label={`${name} ${formatGrams(value)}${unit}`}
      data-testid={`food-detail-macro-${errorKey}`}
    >
      <span className="kalori-fd-macro-label">{name}</span>
      <span className="kalori-fd-macro-value num">
        {formatGrams(value)}
        {unit}
      </span>
      <div className="kalori-fd-macro-bar">
        <div
          className="kalori-fd-macro-bar-fill"
          style={{ width: `${fill}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MicrosReadOnly({
  fiberG,
  sugarG,
  sodiumMg,
}: {
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}) {
  const rows: Array<{ name: string; value: string; key: string }> = [];
  if (fiberG !== null && fiberG !== undefined) {
    rows.push({
      name: t.library.detail.macroFiber,
      value: `${formatGrams(fiberG)} ${t.library.detail.macroUnitGrams}`,
      key: 'fiber',
    });
  }
  if (sugarG !== null && sugarG !== undefined) {
    rows.push({
      name: t.library.detail.macroSugar,
      value: `${formatGrams(sugarG)} ${t.library.detail.macroUnitGrams}`,
      key: 'sugar',
    });
  }
  if (sodiumMg !== null && sodiumMg !== undefined) {
    rows.push({
      name: t.library.detail.microSodium,
      value: `${formatMilligrams(sodiumMg)} ${t.library.detail.macroUnitMg}`,
      key: 'sodium',
    });
  }
  if (rows.length === 0) {
    return (
      <p
        className="kalori-fd-micro-empty"
        style={{ gridColumn: '1 / -1' }}
        data-testid="food-detail-no-micros"
      >
        {t.library.detail.noMicros}
      </p>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'contents' }}>
          <span className="kalori-fd-micro-name">{r.name}</span>
          <span className="kalori-fd-micro-value num">{r.value}</span>
        </div>
      ))}
    </>
  );
}

export default FoodDetailMacros;
