'use client';

/**
 * <SnapTab /> — "Log by photo" panel (Task 3.3).
 *
 * Flow:
 *   1. User captures / uploads / drops file.
 *   2. compressDualOutput() runs in Web Worker → emits BOTH a vision blob
 *      (≤ 500 KB JPEG, ≤ 1600px) and a thumbnail blob (≤ 50 KB WebP/JPEG)
 *      from a single decode pass.
 *   3. `authPost('/api/ai/vision', { imageBase64 })` for Gemini parse,
 *      using the vision blob's base64.
 *   4. On success, `authPost('/api/storage/thumbnail', { imageBase64 })`
 *      uses the THUMBNAIL blob's base64 (distinct bytes from vision) to
 *      persist under `food-thumbnails/{user_id}/{client_id}.{ext}`.
 *   5. Render parsed-items preview (Task 3.4 seam).
 *
 * Failure modes route to ManualEntryFallback, retaining thumbnailDataUrl (I7).
 *
 * Style changes (Phase-3 fixes):
 *   - Camera icon + caption + 56×56 oxblood CAPTURE square hierarchy.
 *   - Compression placeholder: 160×160 bg-2 with ImageDown icon + %-tick caption.
 *   - UPLOAD INSTEAD: oxblood link style (no underline at rest) via CSS class.
 *   - Capture button wraps hidden file input in a <label> for WCAG 3.3.2.
 *   - useCallback dropped (RC manages).
 *
 * I3 (Codex round 1): `compressImage` returns data URLs only (no blob: URLs),
 * so the previous `currentBlobUrlRef` pattern was dead code. The `measureBlob`
 * helper inside `compress.ts` owns blob-URL lifecycle internally, including
 * the I2 fallback revoke. SnapTab no longer needs a ref guard.
 */
import * as Sentry from '@sentry/nextjs';
import { Camera, ImageDown } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

import { t } from '@/lib/i18n/en';
import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import type { ParsedItemT, ParseResultT } from '@/lib/ai/schemas';
import { classifyError } from '@/lib/log-flow/classify-error';
import {
  selectCurrentSnapDraft,
  selectFailureMode,
  useLogFlowStore,
} from '@/lib/stores/useLogFlowStore';

import { ManualEntryFallback, type ManualSubmitPayload } from './ManualEntryFallback';

export interface SnapTabProps {
  /** Task 3.4 seam. */
  onAnalyzeSuccess?: (parsed: ParsedItemT[], signedUrl: string | null) => void;
  /** F-UI-3.6-B-1 — manual-fallback submit forwarded to LogFlowTabs. */
  onManualSubmit?: (payload: ManualSubmitPayload) => void;
}

type VisionResponse = { result: ParseResultT } | { fallback: true; originalInput: string };
type ThumbnailResponse = { path: string; signedUrl: string; expiresAt: string };

export function SnapTab({ onAnalyzeSuccess, onManualSubmit }: SnapTabProps) {
  const draft = useLogFlowStore(selectCurrentSnapDraft);
  const setSnapDraft = useLogFlowStore((s) => s.setSnapDraft);
  const setFailureMode = useLogFlowStore((s) => s.setFailureMode);
  const ensureClientId = useLogFlowStore((s) => s.ensureClientId);
  const failureMode = useLogFlowStore(selectFailureMode);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File): Promise<void> {
    if (!/^image\//.test(file.type)) {
      setSnapDraft({
        status: 'error',
        error: t.log.snapUnsupportedMime,
        thumbnailDataUrl: null,
      });
      return;
    }

    const clientId = ensureClientId('snap');
    setSnapDraft({ status: 'compressing', progress: 0 });

    try {
      const { compressDualOutput, stripDataUrlPrefix } = await import('@/lib/image/compress');
      // Task 4.7.5 — dual-output compression. Vision blob (≤500 KB JPEG)
      // for /api/ai/vision; thumbnail blob (≤50 KB WebP/JPEG) for
      // /api/storage/thumbnail. Wall-clock progress maps both passes into
      // a single bar — no UI change needed.
      const compressed = await compressDualOutput(file, {
        onProgress: (p) => setSnapDraft({ status: 'compressing', progress: p }),
      });
      if (compressed.vision.sizeBytes > 500 * 1024) {
        setSnapDraft({
          status: 'error',
          error: t.log.snapTooLarge,
          thumbnailDataUrl: compressed.vision.base64,
        });
        return;
      }

      const visionBase64Bare = stripDataUrlPrefix(compressed.vision.base64);
      const visionMimeType = compressed.vision.blob.type || 'image/jpeg';
      const thumbnailBase64Bare = stripDataUrlPrefix(compressed.thumbnail.base64);
      const thumbnailMimeType = compressed.thumbnail.blob.type || 'image/jpeg';

      // Move to analyzing — the AbortController lives in-place for
      // cancellation from the UI.
      const abortController = new AbortController();
      setSnapDraft({
        status: 'analyzing',
        thumbnailDataUrl: compressed.vision.base64,
        abortController,
      });

      startTransition(async () => {
        try {
          const vision = await authPost<VisionResponse>('/api/ai/vision', {
            client_id: clientId,
            imageBase64: visionBase64Bare,
            mimeType: visionMimeType,
          });
          if ('fallback' in vision && vision.fallback) {
            setSnapDraft({
              status: 'error',
              error: t.log.aiFailureFallback,
              thumbnailDataUrl: compressed.vision.base64,
            });
            setFailureMode('network', vision.originalInput);
            return;
          }
          if (!('result' in vision)) return;

          // Upload thumbnail — I4 invariant enforcement point. Distinct
          // bytes from the vision blob: thumbnailBase64Bare is the
          // ≤50 KB WebP/JPEG produced by the second compression pass.
          let signedUrl: string | null;
          try {
            const thumb = await authPost<ThumbnailResponse>('/api/storage/thumbnail', {
              client_id: clientId,
              imageBase64: thumbnailBase64Bare,
              mimeType: thumbnailMimeType,
            });
            signedUrl = thumb.signedUrl;
          } catch (thumbErr) {
            // Task 4.7.5 — thumbnail upload failed. Non-blocking: the
            // entry is still saved (parsed items are load-bearing). We
            // surface the failure to Sentry + an inline warning so it's
            // observable instead of swallowed. Early-return out of the
            // success-path mutation so the failure-path state lands once.
            Sentry.captureException(thumbErr, {
              tags: { component: 'snap-tab', stage: 'thumbnail-upload' },
            });
            setSnapDraft({
              status: 'done',
              thumbnailDataUrl: compressed.vision.base64,
              parsed: vision.result.items,
              thumbnailUploadFailed: true,
            });
            onAnalyzeSuccess?.(vision.result.items, null);
            return;
          }

          setSnapDraft({
            status: 'done',
            thumbnailDataUrl: compressed.vision.base64,
            parsed: vision.result.items,
          });
          onAnalyzeSuccess?.(vision.result.items, signedUrl);
        } catch (err) {
          if (err instanceof SessionExpiredError) {
            setSnapDraft({
              status: 'error',
              error: t.log.sessionExpiredToast,
              thumbnailDataUrl: compressed.vision.base64,
            });
            return;
          }
          setFailureMode(classifyError(err), '<image>');
          setSnapDraft({
            status: 'error',
            error: t.log.aiFailureFallback,
            thumbnailDataUrl: compressed.vision.base64,
          });
        }
      });
    } catch (err) {
      setSnapDraft({
        status: 'error',
        error: err instanceof Error ? err.message : 'compression_failed',
        thumbnailDataUrl: null,
      });
    }
  }

  const onInputChange = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const file = ev.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (ev: React.DragEvent<HTMLDivElement>): void => {
    ev.preventDefault();
    setIsDragging(false);
    const file = ev.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (ev: React.DragEvent<HTMLDivElement>): void => {
    ev.preventDefault();
  };

  const clickUpload = (): void => {
    fileInputRef.current?.click();
  };

  const thumbnailDataUrl =
    (draft.status === 'uploading' ||
      draft.status === 'analyzing' ||
      draft.status === 'done' ||
      draft.status === 'error') &&
    draft.thumbnailDataUrl
      ? draft.thumbnailDataUrl
      : null;

  const fileInputId = 'snap-tab-file-input';

  return (
    <div
      data-testid="snap-tab"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}
    >
      <div
        role="button"
        tabIndex={0}
        data-testid="snap-tab-dropzone"
        data-dragging={isDragging ? 'true' : 'false'}
        aria-label={t.log.snapCaptureA11y}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onClick={clickUpload}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clickUpload();
          }
        }}
        className="kalori-log-dropzone"
      >
        {thumbnailDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/image does not accept data: URLs
          <img
            src={thumbnailDataUrl}
            alt=""
            role="presentation"
            width={160}
            height={160}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--spacing-4)',
              padding: 'var(--spacing-6)',
              textAlign: 'center',
            }}
          >
            <Camera size={48} strokeWidth={1.5} color="var(--color-dust)" aria-hidden="true" />
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-dust)',
                margin: 0,
              }}
            >
              {isDragging ? t.log.snapCaptureDrop : t.log.snapCaptureCaption}
            </p>
            <button
              type="button"
              className="kalori-log-capture-square"
              aria-label={t.log.snapCaptureSquareA11y}
              data-testid="snap-tab-capture-square"
              onClick={(ev) => {
                ev.stopPropagation();
                clickUpload();
              }}
            />
          </div>
        )}
      </div>

      {/* sr-only label for the hidden file input — compliance §M2. */}
      <label htmlFor={fileInputId} className="sr-only">
        {t.log.snapCaptureA11y}
      </label>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        capture="environment"
        onChange={onInputChange}
        data-testid="snap-tab-file-input"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          clipPath: 'inset(100%)',
        }}
      />

      <button
        type="button"
        onClick={clickUpload}
        data-testid="snap-tab-upload-instead"
        className="kalori-log-link"
      >
        {t.log.snapUploadInstead}
      </button>

      {draft.status === 'compressing' ? (
        <div
          className="kalori-log-compressing"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(draft.progress * 100)}
          aria-label={t.log.snapCompressingLabel}
          data-testid="snap-tab-compressing"
        >
          <ImageDown size={24} strokeWidth={1.5} aria-hidden="true" />
          <span
            className="num"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              letterSpacing: '0.18em',
              color: 'var(--color-dust)',
              textTransform: 'uppercase',
            }}
          >
            {t.log.snapCompressingCaption.replace(
              '{pct}',
              String(Math.round(draft.progress * 100)),
            )}
          </span>
        </div>
      ) : null}

      {draft.status === 'analyzing' ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            color: 'var(--color-sand)',
          }}
        >
          {t.log.snapAnalyzing}
        </p>
      ) : null}

      {failureMode ? (
        <ManualEntryFallback
          forceMode="snap"
          {...(onManualSubmit ? { onManualSubmit } : {})}
          onRetry={() => {
            setFailureMode(null, null);
          }}
        />
      ) : null}

      {draft.status === 'done' ? (
        <>
          {draft.thumbnailUploadFailed ? (
            <p
              data-testid="snap-tab-thumbnail-failed"
              role="status"
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--color-sand)',
                margin: 0,
                paddingTop: 'var(--spacing-2)',
                paddingBottom: 'var(--spacing-2)',
                borderTop: '1px solid var(--color-rule)',
                borderBottom: '1px solid var(--color-rule)',
              }}
            >
              {t.log.snapThumbnailFailed}
            </p>
          ) : null}
          <div data-testid="snap-tab-done" style={{ display: 'flex', gap: 'var(--spacing-3)' }}>
            <button
              type="button"
              onClick={() => setSnapDraft({ status: 'idle' })}
              className="kalori-log-btn-outline"
            >
              {t.log.snapRetake}
            </button>
          </div>
        </>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {isPending ? t.log.snapAnalyzing : ''}
      </span>
    </div>
  );
}

export default SnapTab;
