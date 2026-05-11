'use client';

/**
 * Task 5.1.4 — Always-mounted host for `<PWAInstallPrompt />`.
 *
 * Codex Round 2 (R2-F1)
 * ─────────────────────
 * `usePWAInstall()` lives HERE (in the always-mounted bundle), not inside
 * the lazy modal child. Chromium's `beforeinstallprompt` event is one-shot;
 * if the listener registers only after the dynamic modal chunk resolves,
 * any event fired before that point is permanently lost. Keeping the hook
 * in the eager host guarantees the listener is wired immediately on mount.
 *
 * The visual modal is still lazy via `next/dynamic({ ssr: false })`, but it
 * is only mounted when there is something to show (`canInstall` for the
 * deferred-prompt path, OR `isIOSWithoutA2HS` for the manual A2HS variant)
 * AND the user is not already installed AND not within the dismissal
 * cooldown. This preserves the bundle-split benefit for first paint.
 *
 * Trigger policy
 * ──────────────
 * Auto-triggers and Settings entry-points land in 5.1.6. For 5.1.4 the host
 * defaults `open` to `false`. Auto-trigger UX is wired post-MVP; the
 * listener (the part this host MUST own) is in place from first paint.
 *
 * R1 / I11 / R3
 * ─────────────
 * - The host is `'use client'`. It only ever runs after hydration.
 * - `usePWAInstall()` itself is hydration-safe (returns conservative
 *   defaults on first render; reads `localStorage` / `navigator` only in a
 *   post-mount effect).
 * - No raw `fetch()`, no `client_id` mutation.
 *
 * @see Planning/.tmp/task-5.1.4-codex-round2.md R2-F1
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';

import { usePWAInstall } from '@/lib/pwa/use-pwa-install';

import type { PWAInstallPromptProps } from './PWAInstallPrompt';

const PWAInstallPrompt = dynamic<PWAInstallPromptProps>(
  () => import('./PWAInstallPrompt').then((m) => m.PWAInstallPrompt),
  { ssr: false, loading: () => null },
);

export function PWAInstallPromptHost(): React.ReactElement | null {
  // R2-F1: hook lives in the eager host so beforeinstallprompt is captured
  // immediately on mount, regardless of when the lazy modal chunk resolves.
  const {
    canInstall,
    isInstalled,
    isIOSWithoutA2HS,
    platform,
    promptInstall,
    dismiss,
    isRecentlyDismissed,
  } = usePWAInstall();

  const [openRequest, setOpenRequest] = useState(false);

  // The modal renders only when there's something useful to show:
  //   - the platform exposed a deferred prompt (Android/Chromium), OR
  //   - we're on iOS Safari without A2HS (manual instructions variant).
  // AND the user has not just dismissed AND is not already installed.
  const shouldExpose = !isInstalled && !isRecentlyDismissed && (canInstall || isIOSWithoutA2HS);

  if (!shouldExpose) {
    // Nothing to render — the lazy chunk is NOT requested, and the listener
    // (in usePWAInstall) is still active for a future beforeinstallprompt
    // event. We do NOT use a useEffect to flip openRequest off when
    // shouldExpose drops; instead we early-return null which unmounts the
    // dialog. When shouldExpose flips back on, openRequest is naturally
    // gated by `shouldExpose && openRequest` below — preserving the rule
    // that we don't auto-open without an external trigger.
    return null;
  }

  // Auto-trigger UX (auto-opening on first eligible render) is deferred to
  // 5.1.6. For 5.1.4 the host stays closed unless an external surface
  // (e.g. Settings entry-point) flips `openRequest`. The lazy chunk is
  // requested only when `shouldExpose` is true and the dialog is mounted.
  return (
    <PWAInstallPrompt
      open={openRequest}
      onOpenChange={setOpenRequest}
      canInstall={canInstall}
      isIOSWithoutA2HS={isIOSWithoutA2HS}
      platform={platform}
      promptInstall={promptInstall}
      dismiss={dismiss}
    />
  );
}

export default PWAInstallPromptHost;
