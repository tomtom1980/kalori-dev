'use client';

/**
 * Task 5.1.4 — `<PWAInstallPrompt />` folded-letter install modal.
 *
 * Visual conceit (`planning/ui-design.md` §7.9 + `task-5.1-ui-design-lead.md`
 * §A): tear-line top border (2px dotted), typewriter indent (3px extra
 * padding-inline-start on body), ribbon-tab CTA (CTA inset 6px past where
 * right padding would normally end). Pure typography — no animated unfold.
 *
 * Variants
 * ────────
 * - Android / Chromium / desktop-chromium → "INSTALL" + "NOT NOW" CTAs.
 *   Click INSTALL → invokes the `promptInstall` prop (deferred prompt).
 * - iOS Safari → "Three steps" instructions + "GOT IT" single CTA.
 *
 * Accessibility (`task-5.1-ui-ux-auditor.md` §C/§D)
 * ─────────────────────────────────────────────────
 * - Built on Radix Dialog primitives → focus trap + return-focus + portal.
 * - `role="dialog" aria-modal="true" aria-labelledby aria-describedby`.
 * - First-focus on the primary CTA (`INSTALL` / `GOT IT`).
 * - ESC closes AND treats as NOT NOW (writes dismissal flag) per
 *   `ux-specialist §A.3`.
 * - Backdrop click also dismisses.
 *
 * Codex Round 2 (R2-F1)
 * ─────────────────────
 * Install state arrives through PROPS, not via `usePWAInstall()`. The hook
 * lives in the always-mounted `PWAInstallPromptHost` so the one-shot
 * `beforeinstallprompt` event is captured BEFORE this lazy chunk resolves.
 *
 * R1 / I11 / R3
 * ─────────────
 * - Zero raw `fetch()` — install action calls the supplied `promptInstall`
 *   prop only (which wraps `deferredPrompt.prompt()`, NOT network).
 * - No `client_id` mutation — modal is display + state only.
 * - `'use client'`. The host (`app/(app)/layout.tsx`) imports the host which
 *   imports this lazily via `next/dynamic({ ssr: false, loading: () => null })`.
 *
 * @see Planning/.tmp/task-5.1.4-briefing.md §9
 * @see Planning/.tmp/task-5.1.4-codex-round2.md R2-F1
 */

import * as Dialog from '@radix-ui/react-dialog';
import { addBreadcrumb } from '@sentry/nextjs';
import { useCallback, useEffect } from 'react';

import { t } from '@/lib/i18n/en';
import { useOutbox } from '@/lib/offline/use-outbox';
import type { InstallPlatform } from '@/lib/pwa/use-pwa-install';

export interface PWAInstallPromptProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** True when the platform fired `beforeinstallprompt` and the user has not dismissed. */
  canInstall: boolean;
  /** True for iOS Safari without A2HS — drives the manual-instructions modal variant. */
  isIOSWithoutA2HS: boolean;
  /** Detected platform — drives the modal copy variant. */
  platform: InstallPlatform;
  /** Calls `deferredPrompt.prompt()` and forwards the userChoice outcome. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
  /** Marks the prompt dismissed (writes localStorage, clears canInstall). */
  dismiss: () => void;
}

export function PWAInstallPrompt({
  open,
  onOpenChange,
  canInstall,
  isIOSWithoutA2HS,
  platform,
  promptInstall,
  dismiss,
}: PWAInstallPromptProps): React.ReactElement {
  const { meta } = useOutbox();
  const isReducedMotion = meta.isReducedMotion;
  const showIosVariant = isIOSWithoutA2HS || platform === 'ios-safari';

  // Sentry breadcrumbs — informational only (briefing §17).
  useEffect(() => {
    if (!open) return;
    addBreadcrumb({
      category: 'pwa.install',
      message: 'pwa.install_prompt.shown',
      level: 'info',
      data: { platform },
    });
  }, [open, platform]);

  const handleDismiss = useCallback(() => {
    dismiss();
    addBreadcrumb({
      category: 'pwa.install',
      message: 'pwa.install_prompt.dismissed',
      level: 'info',
      data: { platform },
    });
    onOpenChange(false);
  }, [dismiss, onOpenChange, platform]);

  const handleInstall = useCallback(async () => {
    const outcome = await promptInstall();
    addBreadcrumb({
      category: 'pwa.install',
      message:
        outcome === 'accepted' ? 'pwa.install_prompt.accepted' : 'pwa.install_prompt.dismissed',
      level: 'info',
      data: { platform, outcome },
    });
    onOpenChange(false);
  }, [promptInstall, onOpenChange, platform]);

  // Radix's onEscapeKeyDown / onPointerDownOutside fire on dismissal paths.
  // We treat both as NOT NOW (writes dismissal flag).
  const handleEscapeKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      handleDismiss();
    },
    [handleDismiss],
  );

  const handlePointerDownOutside = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
      handleDismiss();
    },
    [handleDismiss],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="pwa-install-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgb(14 10 8 / 0.72)',
            zIndex: 80,
            opacity: 1,
            transition: isReducedMotion ? 'none' : 'opacity 120ms linear',
          }}
        />
        <Dialog.Content
          data-testid="pwa-install-prompt"
          data-platform={platform}
          data-reduced-motion={isReducedMotion ? 'true' : 'false'}
          aria-labelledby={t.pwa.install.titleId}
          aria-describedby={t.pwa.install.bodyId}
          onEscapeKeyDown={handleEscapeKeyDown}
          onPointerDownOutside={handlePointerDownOutside}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(100vw - 32px, 440px)',
            maxHeight: '90vh',
            overflowY: 'auto',
            backgroundColor: 'var(--color-bg-1)',
            // Tear-line top border — 2px dotted, sharp corners.
            borderTop: '2px dotted var(--color-rule)',
            borderLeft: '1px solid var(--color-rule-strong)',
            borderRight: '1px solid var(--color-rule-strong)',
            borderBottom: '1px solid var(--color-rule-strong)',
            // Zero radius, no shadow per Ledger.
            borderRadius: 'var(--radius-modal)',
            boxShadow: 'none',
            padding: '32px',
            color: 'var(--color-ivory)',
            zIndex: 81,
            opacity: 1,
            transition: isReducedMotion ? 'none' : 'opacity 120ms linear',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-inter)',
              fontWeight: 500,
              fontSize: '10.5px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-oxblood-soft)',
              margin: 0,
            }}
          >
            {t.pwa.install.kicker}
          </p>
          <Dialog.Title
            id={t.pwa.install.titleId}
            style={{
              fontFamily: 'var(--font-newsreader)',
              fontWeight: 300,
              fontSize: '28px',
              lineHeight: 1.15,
              color: 'var(--color-ivory)',
              margin: '8px 0 12px',
            }}
          >
            {t.pwa.install.title}
          </Dialog.Title>
          <Dialog.Description
            id={t.pwa.install.bodyId}
            style={{
              fontFamily: 'var(--font-newsreader)',
              fontStyle: 'italic',
              fontSize: '15px',
              lineHeight: 1.5,
              color: 'var(--color-sand)',
              margin: 0,
              // Typewriter indent — 3px extra inline-start padding.
              paddingInlineStart: '3px',
            }}
          >
            {showIosVariant ? t.pwa.install.bodyIos : t.pwa.install.bodyAndroid}
          </Dialog.Description>

          {showIosVariant ? <IOSInstructions /> : <WhatYouGetList />}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
              // Ribbon-tab inset — primary CTA tucks 6px past right edge.
              marginInlineEnd: '-6px',
            }}
          >
            {showIosVariant ? (
              <button type="button" autoFocus onClick={handleDismiss} style={primaryCtaStyle}>
                {t.pwa.install.ctaGotIt}
              </button>
            ) : (
              <>
                <button type="button" onClick={handleDismiss} style={ghostCtaStyle}>
                  {t.pwa.install.ctaNotNow}
                </button>
                <button
                  type="button"
                  autoFocus
                  disabled={!canInstall}
                  aria-disabled={!canInstall}
                  onClick={handleInstall}
                  style={primaryCtaStyle}
                >
                  {t.pwa.install.ctaInstall}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WhatYouGetList(): React.ReactElement {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: '20px 0 0',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        fontFamily: 'var(--font-newsreader)',
        fontSize: '14px',
        lineHeight: 1.5,
        color: 'var(--color-ivory)',
      }}
    >
      <li>{t.pwa.install.whatYouGet1}</li>
      <li>{t.pwa.install.whatYouGet2}</li>
      <li>{t.pwa.install.whatYouGet3}</li>
    </ul>
  );
}

function IOSInstructions(): React.ReactElement {
  return (
    <div
      style={{
        marginTop: '20px',
        fontFamily: 'var(--font-newsreader)',
        fontSize: '14px',
        lineHeight: 1.55,
        color: 'var(--color-ivory)',
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontFamily: 'var(--font-inter)',
          fontWeight: 500,
          fontSize: '10.5px',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.pwa.install.iosStepsHeading}
      </p>
      <ol
        style={{
          margin: 0,
          paddingInlineStart: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <li>{t.pwa.install.iosStep1}</li>
        <li>{t.pwa.install.iosStep2}</li>
        <li>{t.pwa.install.iosStep3}</li>
      </ol>
    </div>
  );
}

const primaryCtaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 500,
  fontSize: '12px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-ivory)',
  backgroundColor: 'var(--color-oxblood)',
  border: 'none',
  height: '44px',
  padding: '0 20px',
  cursor: 'pointer',
  borderRadius: 'var(--radius-modal)',
};

const ghostCtaStyle: React.CSSProperties = {
  fontFamily: 'var(--font-inter)',
  fontWeight: 500,
  fontSize: '12px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--color-sand)',
  backgroundColor: 'transparent',
  border: 'none',
  height: '44px',
  padding: '0 20px',
  cursor: 'pointer',
  borderRadius: 'var(--radius-modal)',
};

export default PWAInstallPrompt;
