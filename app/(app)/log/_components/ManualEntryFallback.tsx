'use client';

import * as Collapsible from '@radix-ui/react-collapsible';
import { useEffect, useId, useRef, useState } from 'react';

import {
  MobileWheelPicker,
  type MobileWheelPickerOption,
} from '@/components/primitives/MobileWheelPicker';
import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { t } from '@/lib/i18n/en';
import {
  selectCurrentSnapDraft,
  selectFailureMode,
  selectOriginalInput,
  useLogFlowStore,
} from '@/lib/stores/useLogFlowStore';

export interface ManualEntryFallbackProps {
  /** Test-only override; prod reads from the store. */
  forceMode?: 'type' | 'snap' | 'library';
  /** Task 3.4 seam - not wired in 3.3. */
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
  /** Resets failureMode and re-fires the previous dispatch. */
  onRetry?: () => void;
}

export type ManualUnit = 'g' | 'serving' | 'piece' | 'bowl' | 'cup';

export interface ManualMacroPayload {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface ManualSubmitPayload {
  foodName: string;
  quantity: number;
  unit: ManualUnit;
  /** Backward-compatible alias for the legacy grams-only field. */
  portionGrams: number;
  kcal: number;
  source: 'manual';
  macros?: ManualMacroPayload;
  needsReview?: boolean;
  photoDataUrl?: string;
}

interface FieldErrors {
  foodName?: string;
  portion?: string;
  kcal?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
}

const MANUAL_UNITS: ManualUnit[] = ['g', 'serving', 'piece', 'bowl', 'cup'];
const GRAM_PRESETS = [50, 100, 150, 250];
const COUNT_PRESETS = [1, 2, 3];
const GRAM_WHEEL_VALUES = [25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500];
const COUNT_WHEEL_VALUES = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5];

type MacroDraft = Record<'protein' | 'carbs' | 'fat' | 'fiber', string>;

function unitLabel(unit: ManualUnit): string {
  switch (unit) {
    case 'g':
      return t.log.fallbackUnitGram;
    case 'serving':
      return t.log.fallbackUnitServing;
    case 'piece':
      return t.log.fallbackUnitPiece;
    case 'bowl':
      return t.log.fallbackUnitBowl;
    case 'cup':
      return t.log.fallbackUnitCup;
    default:
      return unit;
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function formatQuantityLabel(value: number, unit: ManualUnit): string {
  return `${formatNumber(value)} ${unitLabel(unit)}`;
}

function defaultQuantityForUnit(unit: ManualUnit): number {
  return unit === 'g' ? 100 : 1;
}

function wheelValuesForUnit(unit: ManualUnit): number[] {
  return unit === 'g' ? GRAM_WHEEL_VALUES : COUNT_WHEEL_VALUES;
}

function normalizeWheelValue(value: number, unit: ManualUnit): number {
  const values = wheelValuesForUnit(unit);
  return values.includes(value) ? value : defaultQuantityForUnit(unit);
}

function isValidPositiveNumber(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function parseOptionalMacro(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

function hasMacroValues(values: MacroDraft): boolean {
  return Object.values(values).some((value) => value.trim() !== '');
}

export function ManualEntryFallback({
  forceMode,
  onManualSubmit,
  onRetry,
}: ManualEntryFallbackProps) {
  const originalInput = useLogFlowStore(selectOriginalInput);
  const failureMode = useLogFlowStore(selectFailureMode);
  const snapDraft = useLogFlowStore(selectCurrentSnapDraft);
  const activeTab = useLogFlowStore((s) => s.activeTab);
  const clearClientId = useLogFlowStore((s) => s.clearClientId);

  const mode = forceMode ?? activeTab;

  const regionId = useId();
  const foodNameId = useId();
  const foodNameErrId = useId();
  const portionId = useId();
  const portionErrId = useId();
  const unitGroupId = useId();
  const kcalId = useId();
  const kcalErrId = useId();
  const proteinId = useId();
  const proteinErrId = useId();
  const carbsId = useId();
  const carbsErrId = useId();
  const fatId = useId();
  const fatErrId = useId();
  const fiberId = useId();
  const fiberErrId = useId();
  const summaryErrId = useId();

  const foodInputRef = useRef<HTMLInputElement | null>(null);
  const portionInputRef = useRef<HTMLInputElement | null>(null);
  const portionButtonRef = useRef<HTMLButtonElement | null>(null);
  const kcalInputRef = useRef<HTMLInputElement | null>(null);
  const proteinInputRef = useRef<HTMLInputElement | null>(null);
  const carbsInputRef = useRef<HTMLInputElement | null>(null);
  const fatInputRef = useRef<HTMLInputElement | null>(null);
  const fiberInputRef = useRef<HTMLInputElement | null>(null);

  const [foodName, setFoodName] = useState<string>(mode === 'type' ? (originalInput ?? '') : '');
  const [portion, setPortion] = useState<string>('');
  const [unit, setUnit] = useState<ManualUnit>('g');
  const [kcal, setKcal] = useState<string>('');
  const [protein, setProtein] = useState<string>('');
  const [carbs, setCarbs] = useState<string>('');
  const [fat, setFat] = useState<string>('');
  const [fiber, setFiber] = useState<string>('');
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelDraft, setWheelDraft] = useState<number>(100);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const isMobile = useIsMobile();

  const presets = unit === 'g' ? GRAM_PRESETS : COUNT_PRESETS;
  const wheelOptions: MobileWheelPickerOption<number>[] = wheelValuesForUnit(unit).map((value) => ({
    value,
    label: formatQuantityLabel(value, unit),
  }));

  const hasFocusedRef = useRef(false);
  useEffect(() => {
    if (failureMode && !hasFocusedRef.current) {
      foodInputRef.current?.focus();
      hasFocusedRef.current = true;
    }
    if (!failureMode) {
      hasFocusedRef.current = false;
    }
  }, [failureMode]);

  const clearError = (key: keyof FieldErrors): void => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const { [key]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  };

  const focusPortionControl = (): void => {
    if (isMobile) portionButtonRef.current?.focus();
    else portionInputRef.current?.focus();
  };

  const submit = (): void => {
    const portionNum = Number(portion);
    const kcalNum = Number(kcal);
    const macroValues = { protein, carbs, fat, fiber };
    const proteinNum = parseOptionalMacro(protein);
    const carbsNum = parseOptionalMacro(carbs);
    const fatNum = parseOptionalMacro(fat);
    const fiberNum = parseOptionalMacro(fiber);
    const next: FieldErrors = {};

    if (!foodName.trim()) next.foodName = t.log.fallbackErrorFoodRequired;
    if (!Number.isFinite(portionNum) || portionNum <= 0) {
      next.portion = t.log.fallbackErrorQuantityRequired;
    }
    if (!Number.isFinite(kcalNum) || kcalNum < 0) next.kcal = t.log.fallbackErrorKcalRequired;
    if (Number.isNaN(proteinNum)) next.protein = t.log.fallbackErrorMacroRequired;
    if (Number.isNaN(carbsNum)) next.carbs = t.log.fallbackErrorMacroRequired;
    if (Number.isNaN(fatNum)) next.fat = t.log.fallbackErrorMacroRequired;
    if (Number.isNaN(fiberNum)) next.fiber = t.log.fallbackErrorMacroRequired;

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setShowSummary(true);
      if (next.foodName) foodInputRef.current?.focus();
      else if (next.portion) focusPortionControl();
      else if (next.kcal) kcalInputRef.current?.focus();
      else if (next.protein) proteinInputRef.current?.focus();
      else if (next.carbs) carbsInputRef.current?.focus();
      else if (next.fat) fatInputRef.current?.focus();
      else if (next.fiber) fiberInputRef.current?.focus();
      return;
    }

    setErrors({});
    setShowSummary(false);
    const payload: ManualSubmitPayload = {
      foodName: foodName.trim(),
      quantity: portionNum,
      unit,
      portionGrams: portionNum,
      kcal: kcalNum,
      source: 'manual',
      needsReview: true,
    };

    if (hasMacroValues(macroValues)) {
      payload.macros = {
        protein_g: proteinNum ?? 0,
        carbs_g: carbsNum ?? 0,
        fat_g: fatNum ?? 0,
        fiber_g: fiberNum ?? 0,
      };
    }
    if (mode === 'snap' && snapDraft.status === 'error' && snapDraft.thumbnailDataUrl) {
      payload.photoDataUrl = snapDraft.thumbnailDataUrl;
    }

    clearClientId(mode);
    onManualSubmit?.(payload);
  };

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const target = e.target;
    if (
      e.key === 'Enter' &&
      target instanceof HTMLInputElement &&
      target.type !== 'radio' &&
      target.type !== 'button'
    ) {
      e.preventDefault();
      submit();
    }
  };

  const hasPhoto = mode === 'snap' && snapDraft.status === 'error' && !!snapDraft.thumbnailDataUrl;
  const heading =
    mode === 'snap'
      ? t.log.fallbackHeadingSnap
      : mode === 'library'
        ? t.log.fallbackHeadingLibrary
        : t.log.fallbackHeadingType;
  const retryLabel = mode === 'snap' ? t.log.fallbackRetryPhotoCTA : t.log.fallbackRetryCTA;

  return (
    <section
      role="region"
      aria-labelledby={regionId}
      data-testid="manual-entry-fallback"
      className="kalori-manual-fallback"
    >
      <div className="kalori-manual-fallback-context">
        {hasPhoto ? (
          <div className="kalori-manual-fallback-photo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image does not accept data: URLs */}
            <img
              src={snapDraft.thumbnailDataUrl as string}
              alt={t.log.snapPhotoAttachedAlt}
              width={112}
              height={112}
              data-testid="manual-entry-fallback-photo"
              className="kalori-manual-fallback-photo"
            />
          </div>
        ) : null}
        <div className="kalori-manual-fallback-copy">
          <h3 id={regionId} className="kalori-manual-fallback-heading">
            {heading}
          </h3>
          <p className="kalori-manual-fallback-note">
            {hasPhoto ? t.log.fallbackSnapNeedsReview : t.log.fallbackManualNote}
          </p>
        </div>
      </div>

      {showSummary ? (
        <div
          id={summaryErrId}
          role="alert"
          aria-live="assertive"
          data-testid="manual-entry-fallback-summary"
          className="kalori-manual-fallback-summary"
        >
          {t.log.fallbackErrorSummary}
        </div>
      ) : null}

      <div className="kalori-manual-fallback-form" onKeyDown={handleManualKeyDown}>
        <div className="kalori-manual-fallback-field">
          <label htmlFor={foodNameId} className="kalori-manual-fallback-label">
            {t.log.fallbackFoodNameLabel}
          </label>
          <input
            id={foodNameId}
            ref={foodInputRef}
            value={foodName}
            onChange={(e) => {
              setFoodName(e.target.value);
              clearError('foodName');
            }}
            autoComplete="off"
            aria-required="true"
            aria-invalid={errors.foodName ? 'true' : 'false'}
            aria-errormessage={errors.foodName ? foodNameErrId : undefined}
            className="kalori-log-input"
          />
          {errors.foodName ? (
            <span
              id={foodNameErrId}
              role="alert"
              data-testid="manual-entry-fallback-error-food"
              className="kalori-manual-fallback-error"
            >
              {errors.foodName}
            </span>
          ) : null}
        </div>

        <div className="kalori-manual-fallback-field">
          <label htmlFor={portionId} className="kalori-manual-fallback-label">
            {t.log.fallbackQuantityLabel}
          </label>
          {isMobile ? (
            <>
              <button
                type="button"
                id={portionId}
                ref={portionButtonRef}
                data-testid="manual-entry-fallback-quantity-wheel-trigger"
                onClick={() => {
                  const current = normalizeWheelValue(
                    isValidPositiveNumber(portion) ? Number(portion) : defaultQuantityForUnit(unit),
                    unit,
                  );
                  setWheelDraft(current);
                  setWheelOpen(true);
                }}
                aria-haspopup="listbox"
                aria-describedby={errors.portion ? portionErrId : undefined}
                data-invalid={errors.portion ? 'true' : 'false'}
                className="kalori-manual-fallback-wheel-trigger num"
              >
                {isValidPositiveNumber(portion)
                  ? formatQuantityLabel(Number(portion), unit)
                  : t.log.fallbackQuantityChoose}
              </button>
              <MobileWheelSheet
                open={wheelOpen}
                onCancel={() => setWheelOpen(false)}
                onDone={() => {
                  const nextValue = normalizeWheelValue(wheelDraft, unit);
                  setWheelDraft(nextValue);
                  setPortion(String(nextValue));
                  clearError('portion');
                  setWheelOpen(false);
                }}
                title={t.log.fallbackQuantityWheelTitle}
                description={unitLabel(unit)}
                data-testid="manual-entry-fallback-quantity-wheel-sheet"
              >
                <MobileWheelPicker
                  value={wheelDraft}
                  onChange={setWheelDraft}
                  onCommit={(value) => {
                    setPortion(String(value));
                    clearError('portion');
                    setWheelOpen(false);
                  }}
                  onCancel={() => setWheelOpen(false)}
                  options={wheelOptions}
                  ariaLabel={t.log.fallbackQuantityWheelTitle}
                  data-testid="manual-entry-fallback-quantity-wheel"
                />
              </MobileWheelSheet>
            </>
          ) : (
            <input
              id={portionId}
              ref={portionInputRef}
              type="text"
              inputMode="decimal"
              value={portion}
              onChange={(e) => {
                setPortion(e.target.value);
                clearError('portion');
              }}
              autoComplete="off"
              aria-required="true"
              aria-invalid={errors.portion ? 'true' : 'false'}
              aria-errormessage={errors.portion ? portionErrId : undefined}
              className="kalori-log-input num kalori-manual-fallback-number"
            />
          )}
          {errors.portion ? (
            <span
              id={portionErrId}
              role="alert"
              data-testid="manual-entry-fallback-error-portion"
              className="kalori-manual-fallback-error"
            >
              {errors.portion}
            </span>
          ) : null}
        </div>

        <fieldset className="kalori-manual-fallback-unit-fieldset" aria-labelledby={unitGroupId}>
          <legend id={unitGroupId} className="kalori-manual-fallback-label">
            {t.log.fallbackUnitGroupLabel}
          </legend>
          <div className="kalori-manual-fallback-units">
            {MANUAL_UNITS.map((item) => (
              <label
                key={item}
                className="kalori-manual-fallback-unit-option"
                data-active={unit === item ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  name="manual-fallback-unit"
                  value={item}
                  checked={unit === item}
                  onChange={() => {
                    const nextQuantity = defaultQuantityForUnit(item);
                    setUnit(item);
                    setPortion(String(nextQuantity));
                    setWheelDraft(nextQuantity);
                    clearError('portion');
                  }}
                  className="sr-only"
                />
                <span>{unitLabel(item)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="kalori-manual-fallback-presets" aria-label={t.log.fallbackPresetGroupLabel}>
          {presets.map((preset) => (
            <button
              key={`${unit}-${preset}`}
              type="button"
              onClick={() => {
                setPortion(String(preset));
                clearError('portion');
              }}
              className="kalori-manual-fallback-preset"
            >
              {formatQuantityLabel(preset, unit)}
            </button>
          ))}
        </div>

        <div className="kalori-manual-fallback-field">
          <label htmlFor={kcalId} className="kalori-manual-fallback-label">
            {t.log.fallbackKcalLabel}
          </label>
          <input
            id={kcalId}
            ref={kcalInputRef}
            type="text"
            inputMode="decimal"
            value={kcal}
            onChange={(e) => {
              setKcal(e.target.value);
              clearError('kcal');
            }}
            autoComplete="off"
            aria-required="true"
            aria-invalid={errors.kcal ? 'true' : 'false'}
            aria-errormessage={errors.kcal ? kcalErrId : undefined}
            className="kalori-log-input num kalori-manual-fallback-number"
          />
          {errors.kcal ? (
            <span
              id={kcalErrId}
              role="alert"
              data-testid="manual-entry-fallback-error-kcal"
              className="kalori-manual-fallback-error"
            >
              {errors.kcal}
            </span>
          ) : null}
        </div>

        <Collapsible.Root open={macrosOpen} onOpenChange={setMacrosOpen}>
          <Collapsible.Trigger type="button" className="kalori-manual-fallback-macro-trigger">
            {t.log.fallbackMacrosToggle}
          </Collapsible.Trigger>
          <Collapsible.Content className="kalori-manual-fallback-macro-grid">
            <div className="kalori-manual-fallback-field">
              <label htmlFor={proteinId} className="kalori-manual-fallback-label">
                {t.log.fallbackProteinLabel}
              </label>
              <input
                id={proteinId}
                ref={proteinInputRef}
                type="text"
                inputMode="decimal"
                value={protein}
                onChange={(e) => {
                  setProtein(e.target.value);
                  clearError('protein');
                }}
                className="kalori-log-input num kalori-manual-fallback-number"
                aria-invalid={errors.protein ? 'true' : 'false'}
                aria-errormessage={errors.protein ? proteinErrId : undefined}
              />
              {errors.protein ? (
                <span
                  id={proteinErrId}
                  role="alert"
                  data-testid="manual-entry-fallback-error-protein"
                  className="kalori-manual-fallback-error"
                >
                  {errors.protein}
                </span>
              ) : null}
            </div>
            <div className="kalori-manual-fallback-field">
              <label htmlFor={carbsId} className="kalori-manual-fallback-label">
                {t.log.fallbackCarbsLabel}
              </label>
              <input
                id={carbsId}
                ref={carbsInputRef}
                type="text"
                inputMode="decimal"
                value={carbs}
                onChange={(e) => {
                  setCarbs(e.target.value);
                  clearError('carbs');
                }}
                className="kalori-log-input num kalori-manual-fallback-number"
                aria-invalid={errors.carbs ? 'true' : 'false'}
                aria-errormessage={errors.carbs ? carbsErrId : undefined}
              />
              {errors.carbs ? (
                <span
                  id={carbsErrId}
                  role="alert"
                  data-testid="manual-entry-fallback-error-carbs"
                  className="kalori-manual-fallback-error"
                >
                  {errors.carbs}
                </span>
              ) : null}
            </div>
            <div className="kalori-manual-fallback-field">
              <label htmlFor={fatId} className="kalori-manual-fallback-label">
                {t.log.fallbackFatLabel}
              </label>
              <input
                id={fatId}
                ref={fatInputRef}
                type="text"
                inputMode="decimal"
                value={fat}
                onChange={(e) => {
                  setFat(e.target.value);
                  clearError('fat');
                }}
                className="kalori-log-input num kalori-manual-fallback-number"
                aria-invalid={errors.fat ? 'true' : 'false'}
                aria-errormessage={errors.fat ? fatErrId : undefined}
              />
              {errors.fat ? (
                <span
                  id={fatErrId}
                  role="alert"
                  data-testid="manual-entry-fallback-error-fat"
                  className="kalori-manual-fallback-error"
                >
                  {errors.fat}
                </span>
              ) : null}
            </div>
            <div className="kalori-manual-fallback-field">
              <label htmlFor={fiberId} className="kalori-manual-fallback-label">
                {t.log.fallbackFiberLabel}
              </label>
              <input
                id={fiberId}
                ref={fiberInputRef}
                type="text"
                inputMode="decimal"
                value={fiber}
                onChange={(e) => {
                  setFiber(e.target.value);
                  clearError('fiber');
                }}
                className="kalori-log-input num kalori-manual-fallback-number"
                aria-invalid={errors.fiber ? 'true' : 'false'}
                aria-errormessage={errors.fiber ? fiberErrId : undefined}
              />
              {errors.fiber ? (
                <span
                  id={fiberErrId}
                  role="alert"
                  data-testid="manual-entry-fallback-error-fiber"
                  className="kalori-manual-fallback-error"
                >
                  {errors.fiber}
                </span>
              ) : null}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>

        <div className="kalori-manual-fallback-actions">
          <button
            type="button"
            onClick={onRetry}
            data-testid="manual-entry-fallback-retry"
            className="kalori-log-retry kalori-manual-fallback-retry"
          >
            {retryLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            data-testid="manual-entry-fallback-submit"
            className="kalori-log-cta kalori-manual-fallback-submit"
          >
            {t.log.fallbackSubmitCTA}
          </button>
        </div>
      </div>
    </section>
  );
}

export default ManualEntryFallback;
