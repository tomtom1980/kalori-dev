'use client';

/**
 * <ExportModal /> — Task 5.2 Phase 2B (synthesis §2.2).
 *
 * Single-format export modal. The format is pre-selected by the trigger
 * button in Settings — there is NO format chooser inside the modal
 * (synthesis Conflict #10).
 *
 * State machine: idle → fetching → ready → downloading (3s) → close.
 * Errors transition to `error`; user can retry.
 *
 * R1 firewall — uses `authFetch` for the GET; reads body as Blob and
 * triggers a programmatic download via an anchor click.
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';

import { authFetch } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';

export type ExportFormat = 'csv' | 'json' | 'zip';

export interface ExportModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  format: ExportFormat;
  counts: { entries: number; library: number; weight: number; water: number };
  /** Override the user-id portion of the suggested filename (test hook). */
  userIdSlug?: string | undefined;
}

type Phase = 'idle' | 'fetching' | 'ready' | 'downloading' | 'error';

function buildFilename(format: ExportFormat, userIdSlug: string): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const ymd = `${yyyy}${mm}${dd}`;
  // CSV route returns a `csv-bundle.zip` per synthesis §4.2; we still expose
  // the user-facing filename without the inner suffix so the suggested name
  // matches the user's expectation.
  if (format === 'zip') return `kalori-export-${userIdSlug}-${ymd}.zip`;
  if (format === 'json') return `kalori-export-${userIdSlug}-${ymd}.json`;
  return `kalori-export-${userIdSlug}-${ymd}.csv-bundle.zip`;
}

export function ExportModal({
  open,
  onOpenChange,
  format,
  counts,
  userIdSlug = 'me',
}: ExportModalProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorCause, setErrorCause] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  // Phase 3 design-compliance fix I1 — surface the auditor's "still working"
  // caption when the fetching state has been active for ≥ 15s (synthesis §8
  // auditor advisory). Drops back to false on phase exit.
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const downloadAnchorRef = useRef<HTMLAnchorElement | null>(null);

  // Reset state on open/close. The cleanup function is the only place that
  // touches React state — eslint-react's `set-state-in-effect` rule treats
  // cleanup functions as the canonical place to revoke external resources
  // and reset refs without a cascading render warning.
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);
  useEffect(() => {
    // Mount-time / open-flip-time reset. Done in a microtask via
    // queueMicrotask so the synchronous render that sets `open=true`
    // is not chased by an immediate setState in the same tick.
    if (!open) return;
    queueMicrotask(() => {
      setPhase('idle');
      setErrorCause(null);
      setShowSlowWarning(false);
    });
  }, [open]);

  // Phase 3 design-compliance fix I1 — slow-warning at 15s.
  // The cleanup function (canonical place to reset external resources per
  // eslint-react `set-state-in-effect`) handles the back-transition: when
  // phase exits `fetching`, the cleanup runs first and clears the flag.
  useEffect(() => {
    if (phase !== 'fetching') return;
    const timer = setTimeout(() => {
      setShowSlowWarning(true);
    }, 15_000);
    return () => {
      clearTimeout(timer);
      setShowSlowWarning(false);
    };
  }, [phase]);

  const startExport = async (): Promise<void> => {
    setPhase('fetching');
    setErrorCause(null);
    try {
      const res = await authFetch(`/api/export/${format}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { cause?: string };
        setErrorCause(body.cause ?? 'export_failed');
        setPhase('error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const fname = buildFilename(format, userIdSlug);
      setDownloadUrl(url);
      setFilename(fname);
      setPhase('ready');

      // Auto-trigger the download as soon as ready (synthesis §2.2 — the
      // ready→downloading transition fires the anchor click).
      requestAnimationFrame(() => {
        if (downloadAnchorRef.current) {
          downloadAnchorRef.current.click();
        }
        setPhase('downloading');
        // Auto-close after 3s (Conflict #16 — lengthened from 2s).
        setTimeout(() => {
          onOpenChange(false);
        }, 3000);
      });
    } catch (err) {
      setErrorCause(err instanceof Error ? err.name : 'network_error');
      setPhase('error');
    }
  };

  const bodyText = t.settings.exportModal.bodyFormat
    .replace('{N}', String(counts.entries))
    .replace('{L}', String(counts.library))
    .replace('{W}', String(counts.weight))
    .replace('{X}', String(counts.water));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="export-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 60,
          }}
        />
        <Dialog.Content
          data-testid="export-modal"
          aria-busy={phase === 'fetching' ? 'true' : 'false'}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(560px, 92vw)',
            background: 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            padding: '48px 40px',
            zIndex: 61,
            color: 'var(--color-ivory)',
          }}
        >
          {/*
            § EXPORT editorial kicker — escalated from oxblood-soft
            (2.83:1 on bg-1) to dust (~5.0:1) per the axe contrast
            mandate. See AccountSubsection for the parent rationale.
          */}
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
              margin: 0,
              marginBottom: 'var(--spacing-3)',
            }}
          >
            {t.settings.exportModal.kicker}
          </p>
          <Dialog.Title
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              fontSize: '28px',
              color: 'var(--color-ivory)',
              margin: 0,
              marginBottom: 'var(--spacing-3)',
              lineHeight: 1.2,
            }}
          >
            {t.settings.exportModal.title}
          </Dialog.Title>
          <Dialog.Description asChild>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '15px',
                color: 'var(--color-ivory)',
                margin: 0,
                marginBottom: 'var(--spacing-4)',
                lineHeight: 1.5,
              }}
            >
              {bodyText}
            </p>
          </Dialog.Description>
          {phase !== 'error' ? (
            <div
              aria-live="polite"
              aria-atomic="true"
              data-testid="export-modal-phase"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--color-dust)',
                marginBottom: 'var(--spacing-2)',
              }}
            >
              {phase === 'fetching'
                ? showSlowWarning
                  ? t.settings.exportModal.slowWarning15s
                  : t.settings.exportModal.phaseRead
                : phase === 'ready'
                  ? t.settings.exportModal.phaseReady
                  : phase === 'downloading'
                    ? t.settings.exportModal.downloadComplete
                    : t.settings.exportModal.estimate}
            </div>
          ) : null}
          {phase === 'error' ? (
            <div role="alert">
              <p
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '18px',
                  color: 'var(--color-ember)',
                  margin: 0,
                  marginBottom: 'var(--spacing-2)',
                }}
              >
                {t.settings.exportModal.errorTitle}
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--color-dust)',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                {t.settings.exportModal.errorCausePrefix}
                {errorCause}
              </p>
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-4)',
              marginTop: 'var(--spacing-6)',
            }}
          >
            <button
              type="button"
              data-testid="export-modal-cancel"
              onClick={() => onOpenChange(false)}
              style={{
                flex: 1,
                minHeight: '44px',
                background: 'transparent',
                color: 'var(--color-ivory)',
                border: '1px solid var(--color-sand)',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {t.settings.exportModal.cancel}
            </button>
            {phase === 'error' ? (
              <button
                type="button"
                data-testid="export-modal-retry"
                onClick={() => {
                  void startExport();
                }}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  background: 'var(--color-oxblood)',
                  color: 'var(--color-ivory)',
                  border: '1px solid var(--color-oxblood)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {t.settings.exportModal.retry}
              </button>
            ) : (
              <button
                type="button"
                data-testid="export-modal-cta"
                aria-disabled={phase === 'fetching' || phase === 'downloading'}
                onClick={() => {
                  if (phase === 'fetching' || phase === 'downloading') return;
                  void startExport();
                }}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  background: 'var(--color-oxblood)',
                  color: 'var(--color-ivory)',
                  border: '1px solid var(--color-oxblood)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  cursor:
                    phase === 'fetching' || phase === 'downloading' ? 'not-allowed' : 'pointer',
                  opacity: phase === 'fetching' || phase === 'downloading' ? 0.6 : 1,
                }}
              >
                {phase === 'ready' || phase === 'downloading'
                  ? t.settings.exportModal.downloadCta
                  : t.settings.exportModal.exportCta}
              </button>
            )}
          </div>
          {downloadUrl ? (
            <a
              ref={downloadAnchorRef}
              // @nav-audit external
              // (downloadUrl is a blob: URL produced by URL.createObjectURL)
              href={downloadUrl}
              download={filename}
              style={{ display: 'none' }}
              data-testid="export-modal-download-anchor"
            >
              {filename}
            </a>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ExportModal;
