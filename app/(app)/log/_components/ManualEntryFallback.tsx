'use client';

/**
 * <ManualEntryFallback /> — I7 anchor. Mounts inline inside the active tab
 * panel when `failureMode !== null`. The shared error banner lives at the
 * tablist level (see `<LogFlowErrorBanner />`); this component carries
 * ONLY the form region so users can complete the log manually.
 *
 * Pre-fill rules per briefing §I7:
 *   - Type failure: food-name = originalInput
 *   - Snap failure: retain thumbnailDataUrl, empty food-name
 *   - Library failure: selection preserved (handled outside)
 *
 * Phase-3 fixes applied:
 *   - Validation: aria-invalid + aria-errormessage + visible inline error
 *     + focus shift to first invalid field on submit (compliance §M4).
 *   - Alert banner hoisted into <LogFlowErrorBanner /> (style critical #12).
 *   - Photo preview uses descriptive alt text in the recovery context
 *     (compliance §M6).
 *   - Number inputs carry `className="num"` for tabular numerals.
 */
import { useEffect, useId, useRef, useState } from 'react';

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
  /** Task 3.4 seam — not wired in 3.3. */
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
  /** Resets failureMode and re-fires the previous dispatch. */
  onRetry?: () => void;
}

export interface ManualSubmitPayload {
  foodName: string;
  portionGrams: number;
  kcal: number;
  source: 'manual';
  photoDataUrl?: string;
}

interface FieldErrors {
  foodName?: string;
  portion?: string;
  kcal?: string;
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
  // Task 3.4 I11 patch: manual entry must mint a fresh client_id (the failed
  // parse already burned the previous one). Calling `clearClientId(tab)`
  // BEFORE `onManualSubmit` ensures any caller that subsequently invokes
  // `authPost`/`authFetch` reads a fresh UUID via `ensureClientId` instead of
  // the stale one — otherwise the server's I11 replay would refuse the
  // logically-new manual entry. Architecture §7.3 latent-bug.
  const clearClientId = useLogFlowStore((s) => s.clearClientId);

  const mode = forceMode ?? activeTab;

  const regionId = useId();
  const foodNameId = useId();
  const foodNameErrId = useId();
  const portionId = useId();
  const portionErrId = useId();
  const kcalId = useId();
  const kcalErrId = useId();
  const summaryErrId = useId();

  const foodInputRef = useRef<HTMLInputElement | null>(null);
  const portionInputRef = useRef<HTMLInputElement | null>(null);
  const kcalInputRef = useRef<HTMLInputElement | null>(null);

  const [foodName, setFoodName] = useState<string>(mode === 'type' ? (originalInput ?? '') : '');
  const [portion, setPortion] = useState<string>('');
  const [kcal, setKcal] = useState<string>('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);

  // Mount-focus: first pre-filled input gets focus so SR users land there.
  // Only fire on the FIRST transition into a truthy failureMode — not on
  // subsequent failureMode changes while the fallback is still open, or
  // focus would be yanked back mid-edit on a retry re-failure (M5).
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

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const portionNum = Number(portion);
    const kcalNum = Number(kcal);
    const next: FieldErrors = {};
    if (!foodName.trim()) next.foodName = t.log.fallbackErrorFoodRequired;
    if (!Number.isFinite(portionNum) || portionNum <= 0)
      next.portion = t.log.fallbackErrorPortionRequired;
    if (!Number.isFinite(kcalNum) || kcalNum < 0) next.kcal = t.log.fallbackErrorKcalRequired;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setShowSummary(true);
      // Focus first invalid field.
      if (next.foodName) foodInputRef.current?.focus();
      else if (next.portion) portionInputRef.current?.focus();
      else if (next.kcal) kcalInputRef.current?.focus();
      return;
    }
    setErrors({});
    setShowSummary(false);
    const payload: ManualSubmitPayload = {
      foodName: foodName.trim(),
      portionGrams: portionNum,
      kcal: kcalNum,
      source: 'manual',
    };
    if (mode === 'snap' && snapDraft.status === 'error' && snapDraft.thumbnailDataUrl) {
      payload.photoDataUrl = snapDraft.thumbnailDataUrl;
    }
    // Task 3.4 I11 patch: clear before delegating so the manual submit gets
    // a fresh UUID from the next ensureClientId() call.
    clearClientId(mode);
    onManualSubmit?.(payload);
  };

  const hasPhoto = mode === 'snap' && snapDraft.status === 'error' && !!snapDraft.thumbnailDataUrl;

  return (
    <section
      role="region"
      aria-labelledby={regionId}
      data-testid="manual-entry-fallback"
      style={{
        backgroundColor: 'var(--color-bg-2)',
        padding: 'var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-4)',
      }}
    >
      <h3 id={regionId} className="sr-only">
        {t.log.fallbackManualCTA}
      </h3>

      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image does not accept data: URLs
        <img
          src={snapDraft.thumbnailDataUrl as string}
          alt={t.log.snapPhotoAttachedAlt}
          width={160}
          height={160}
          style={{ objectFit: 'cover' }}
          data-testid="manual-entry-fallback-photo"
        />
      ) : null}

      {/* Retry button kept for parity with the legacy test surface — it
          mirrors the banner's retry semantics so users who scroll past
          the banner can still recover. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onRetry}
          data-testid="manual-entry-fallback-retry"
          className="kalori-log-retry"
        >
          {t.log.fallbackRetryCTA}
        </button>
      </div>

      {showSummary ? (
        <div
          id={summaryErrId}
          role="alert"
          aria-live="assertive"
          data-testid="manual-entry-fallback-summary"
          style={{
            padding: 'var(--spacing-3)',
            backgroundColor: 'var(--color-bg-1)',
            borderLeft: '2px solid var(--color-ember)',
            color: 'var(--color-ivory)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontStyle: 'italic',
          }}
        >
          {t.log.fallbackErrorSummary}
        </div>
      ) : null}

      <form
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}
      >
        <label htmlFor={foodNameId} style={labelStyle}>
          {t.log.fallbackFoodNameLabel}
        </label>
        <input
          id={foodNameId}
          ref={foodInputRef}
          value={foodName}
          onChange={(e) => {
            setFoodName(e.target.value);
            if (errors.foodName) {
              setErrors((prev) => {
                const { foodName: _drop, ...rest } = prev;
                void _drop;
                return rest;
              });
            }
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
            style={errorStyle}
          >
            {errors.foodName}
          </span>
        ) : null}

        <label htmlFor={portionId} style={labelStyle}>
          {t.log.fallbackPortionLabel}
        </label>
        <input
          id={portionId}
          ref={portionInputRef}
          type="text"
          inputMode="decimal"
          value={portion}
          onChange={(e) => {
            setPortion(e.target.value);
            if (errors.portion) {
              setErrors((prev) => {
                const { portion: _drop, ...rest } = prev;
                void _drop;
                return rest;
              });
            }
          }}
          autoComplete="off"
          aria-required="true"
          aria-invalid={errors.portion ? 'true' : 'false'}
          aria-errormessage={errors.portion ? portionErrId : undefined}
          className="kalori-log-input num"
          style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
        />
        {errors.portion ? (
          <span
            id={portionErrId}
            role="alert"
            data-testid="manual-entry-fallback-error-portion"
            style={errorStyle}
          >
            {errors.portion}
          </span>
        ) : null}

        <label htmlFor={kcalId} style={labelStyle}>
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
            if (errors.kcal) {
              setErrors((prev) => {
                const { kcal: _drop, ...rest } = prev;
                void _drop;
                return rest;
              });
            }
          }}
          autoComplete="off"
          aria-required="true"
          aria-invalid={errors.kcal ? 'true' : 'false'}
          aria-errormessage={errors.kcal ? kcalErrId : undefined}
          className="kalori-log-input num"
          style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}
        />
        {errors.kcal ? (
          <span
            id={kcalErrId}
            role="alert"
            data-testid="manual-entry-fallback-error-kcal"
            style={errorStyle}
          >
            {errors.kcal}
          </span>
        ) : null}

        <button type="submit" data-testid="manual-entry-fallback-submit" className="kalori-log-cta">
          {t.log.fallbackSubmitCTA}
        </button>
      </form>
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '10.5px',
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-dust)',
};

const errorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '12px',
  color: 'var(--color-oxblood)',
};

export default ManualEntryFallback;
