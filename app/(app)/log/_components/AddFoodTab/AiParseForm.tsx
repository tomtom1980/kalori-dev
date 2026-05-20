'use client';

/**
 * <TypeTab /> — "Log by typing" panel (Task 3.3).
 *
 * Flow: user types → 600ms debounced chip preview (deferred via
 * useDeferredValue) → PARSE submit dispatches `authPost('/api/ai/text-parse')`
 * via R1 refresh-interceptor → success routes to parsed-items preview
 * (Task 3.4 seam) OR fail → setFailureMode → ManualEntryFallback mounts inline.
 *
 * A11y contract changes (Phase-3 compliance fixes):
 *   - PARSE button uses `aria-disabled` NOT HTML `disabled`, so SR users can
 *     focus it and hear the `aria-describedby` reason (compliance §C2).
 *   - Submit handler checks `canSubmit` early-exit to preserve the guard.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { t } from '@/lib/i18n/en';
import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import type { ParseResultT } from '@/lib/ai/schemas';
import { classifyError } from '@/lib/log-flow/classify-error';
import { selectFailureMode, selectTypeDraft, useLogFlowStore } from '@/lib/stores/useLogFlowStore';

import { ManualEntryFallback, type ManualSubmitPayload } from '../ManualEntryFallback';

export interface AiParseFormProps {
  /** Task 3.4 seam. */
  onParseSuccess?: (result: ParseResultT) => void;
  /** F-UI-3.6-B-1 — manual-fallback submit forwarded to LogFlowTabs. */
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
  /**
   * Add Food tab merge — render a back-arrow header when AiParseForm is
   * the inline-swap subview inside <AddFoodTab>. Omit in library-only
   * mode (the form is the entire surface; there's nowhere to go back to).
   */
  onBack?: () => void;
}

const MIN_CHARS = 3;
const MAX_CHARS = 4000;

type TextParseResponse = { result: ParseResultT } | { fallback: true; originalInput: string };

export function AiParseForm({ onParseSuccess, onManualSubmit, onBack }: AiParseFormProps = {}) {
  const draft = useLogFlowStore(selectTypeDraft);
  const setDraft = useLogFlowStore((s) => s.setTypeDraft);
  const setTypeParsed = useLogFlowStore((s) => s.setTypeParsed);
  const setFailureMode = useLogFlowStore((s) => s.setFailureMode);
  const ensureClientId = useLogFlowStore((s) => s.ensureClientId);
  const failureMode = useLogFlowStore(selectFailureMode);

  const labelId = useId();
  const helperId = useId();
  const disabledReasonId = useId();
  const [isParsing, setIsParsing] = useState(false);
  const [liveMessage, setLiveMessage] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parsingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Phase B Codex R1 F-PB-R1-1 — the previous post-SAVE_OK reset lived in a
   * `useLogFlowStore.subscribe(...)` useEffect here, but TypeTab unmounts
   * during `phase === 'confirmation'` (LogFlowTabs swaps in
   * <ConfirmationScreen />). The subscription was therefore torn down
   * before the SAVE_OK transition could fire — a false-positive masked
   * only by unit tests that synthesised a confirmation snapshot while
   * keeping TypeTab mounted.
   *
   * The reset now runs inside `commitSaveSuccess(tab)` on the store,
   * called from ConfirmationScreen after a 200 OK from
   * /api/entries/save. By the time TypeTab re-mounts (entry phase), the
   * persisted draft is already empty — no listener needed.
   */

  const trimmed = draft.trim();
  const isBusy = isParsing;
  const isTooShort = trimmed.length < MIN_CHARS;
  const canSubmit = !isTooShort && !isBusy;

  const finishParsing = (): void => {
    parsingRef.current = false;
    if (mountedRef.current) setIsParsing(false);
  };

  const onSubmit = (ev: React.FormEvent): void => {
    ev.preventDefault();
    if (!canSubmit || parsingRef.current) return;

    parsingRef.current = true;
    setIsParsing(true);
    void (async () => {
      setLiveMessage(t.log.typeParsing);
      const clientId = ensureClientId('type');
      try {
        const res = await authPost<TextParseResponse>('/api/ai/text-parse', {
          client_id: clientId,
          userText: trimmed,
        });
        if ('fallback' in res && res.fallback) {
          setFailureMode('network', res.originalInput);
          setLiveMessage('');
          finishParsing();
          return;
        }
        if ('result' in res) {
          setTypeParsed(res.result);
          finishParsing();
          onParseSuccess?.(res.result);
          setLiveMessage('');
        }
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          // Interceptor owns the redirect; surface a toast elsewhere.
          setLiveMessage(t.log.sessionExpiredToast);
          finishParsing();
          return;
        }
        setFailureMode(classifyError(err), trimmed);
        setLiveMessage('');
        finishParsing();
      }
    })();
  };

  const handleClickGuarded = (ev: React.MouseEvent<HTMLButtonElement>): void => {
    // Mirror of onSubmit guard — because we use aria-disabled (not disabled)
    // the button IS clickable; reject early for invalid states.
    if (!canSubmit || parsingRef.current) {
      ev.preventDefault();
    }
  };

  return (
    <>
      {onBack ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 'var(--spacing-3)',
          }}
        >
          <button
            type="button"
            data-testid="ai-parse-form-back"
            aria-label={t.log.backToLibraryAriaLabel}
            onClick={onBack}
            className="kalori-add-food-back-button"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
            <span>{t.log.backToLibraryAriaLabel}</span>
          </button>
        </div>
      ) : null}
      <form
        onSubmit={onSubmit}
        aria-describedby={helperId}
        data-testid="type-tab-form"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}
      >
        <label
          id={labelId}
          htmlFor="type-tab-textarea"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '10.5px',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
          }}
        >
          {t.log.typeDescribeLabel}
        </label>

        <div style={{ position: 'relative' }}>
          <textarea
            id="type-tab-textarea"
            ref={textareaRef}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value.slice(0, MAX_CHARS))}
            placeholder={t.log.typeDescribePlaceholder}
            autoComplete="off"
            rows={6}
            aria-labelledby={labelId}
            aria-describedby={helperId}
            data-testid="type-tab-textarea"
            data-parsing={isBusy ? 'true' : 'false'}
            readOnly={isBusy}
            className="kalori-log-textarea"
          />
          <span
            className="num"
            aria-label={t.log.typeCharCountA11y}
            style={{
              position: 'absolute',
              bottom: 'var(--spacing-2)',
              right: 'var(--spacing-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-dust)',
            }}
          >
            {String(draft.length).padStart(4, '0')} / {MAX_CHARS}
          </span>
        </div>

        <p
          id={helperId}
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontStyle: 'italic',
            color: 'var(--color-sand)',
            margin: 0,
          }}
        >
          {t.log.typeHelper}
        </p>

        {/* Hidden disabled-reason sentence — read by SR via aria-describedby when
            the button is aria-disabled. */}
        <span id={disabledReasonId} className="sr-only">
          {t.log.typeParseDisabledReason}
        </span>

        <div role="status" aria-live="polite" style={{ minHeight: 0 }}>
          {liveMessage || null}
        </div>

        {failureMode ? (
          <ManualEntryFallback
            forceMode="type"
            {...(onManualSubmit ? { onManualSubmit } : {})}
            onRetry={() => {
              setFailureMode(null, null);
            }}
          />
        ) : null}

        <button
          type="submit"
          aria-disabled={!canSubmit}
          onClick={handleClickGuarded}
          data-testid="type-tab-parse-button"
          aria-busy={isBusy ? 'true' : undefined}
          aria-describedby={isTooShort ? disabledReasonId : undefined}
          className="kalori-log-cta"
        >
          {isBusy ? (
            <span className="kalori-log-cta-content">
              <span
                aria-hidden="true"
                data-testid="type-tab-parse-spinner"
                className="kalori-log-cta-spinner"
              />
              <span>{t.log.typeParseLoadingCTA}</span>
            </span>
          ) : (
            t.log.typeParseCTA
          )}
        </button>
      </form>
    </>
  );
}

export default AiParseForm;
