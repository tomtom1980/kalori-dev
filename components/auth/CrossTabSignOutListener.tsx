'use client';

/**
 * <CrossTabSignOutListener /> — Task 5.2 Phase 2B (synthesis §2.4).
 *
 * Mounted exactly once at `app/(app)/layout.tsx` (sibling to
 * <UndoToastMount />, <PWAInstallPromptHost />). When another tab signs
 * out, the BroadcastChannel('kalori-auth') message lands here, this
 * component flips into a 5s sticky banner with a countdown, then forces
 * redirect to /login?reason=cross-tab.
 *
 * The hook `useCrossTabSignOut()` already owns its own redirect timer — we
 * do NOT call it here because the banner UI duplicates the timer with a
 * visible countdown. Instead we wire our own listener and run our own
 * 5s redirect; the hook's redirect is the chrome-less fallback for tabs
 * that do not mount the banner.
 *
 * Contract per synthesis §2.4 + Conflicts #4/#5/#6:
 *   - role="status" aria-live="polite" aria-atomic="true"
 *   - 5s countdown, NOT auto-dismissable by user (SIGN IN button
 *     short-circuits to /login?reason=cross-tab earlier)
 *   - 2px ember bottom border (Risk #4 — oxblood fails 2.03:1 on bg-2)
 *   - Defer behaviour during AccountDeleteFlow Step 4 / State D handled
 *     via `sessionStorage['kalori-pending-cross-tab-signout']` (Conflict
 *     #5/#6) — the AccountDeleteFlow sets the flag while in `progress`
 *     state; this listener checks the flag and queues the banner until
 *     the flag is cleared.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { TOPICS } from '@/lib/broadcast/topics';
import { t } from '@/lib/i18n/en';
import { getBrowserSupabase } from '@/lib/supabase/client';

interface SignOutEnvelope {
  type: 'signout';
  originTabId: string;
}

const TAB_ID_KEY = 'kalori-tab-id';
const PENDING_KEY = 'kalori-pending-cross-tab-signout';
// Codex R1 C1 — deferred-marker key. When PENDING_KEY is set and a sign-out
// signal lands, we drop the in-memory signal but persist a deferred marker
// here so the AccountDeleteFlow's `finally` block (which clears PENDING_KEY)
// can replay it. Survives any pending → cleared transition, including the
// failure branch.
const DEFERRED_KEY = 'kalori-deferred-cross-tab-signout';
const BANNER_SECONDS = 5;
// Polling cadence for the pending → cleared transition. The
// AccountDeleteFlow's `finally` runs on the same tab in the same JS context
// but in a separate React tree, so we cannot subscribe to its setState. The
// `storage` event ONLY fires on OTHER tabs per WHATWG; same-tab observers
// must poll. 250ms is short enough to feel instant, long enough to be cheap.
const PENDING_POLL_MS = 250;

function getTabId(): string {
  if (typeof window === 'undefined') return 'ssr-no-tab-id';
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    sessionStorage.setItem(TAB_ID_KEY, fresh);
    return fresh;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function CrossTabSignOutListener(): React.ReactElement | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Phase 3 a11y fix C3a — when OfflineBar is also mounted, the banner
  // should stack BELOW it (not overlap). OfflineBar sets
  // `html[data-offline="true"]` while visible (see components/offline/
  // OfflineBar.tsx). We mirror that signal to a state value here so the
  // banner's `top` offset matches the bar height. Default 0px when no
  // offline bar is mounted.
  const [offlineBarVisible, setOfflineBarVisible] = useState(false);
  // Counts from `BANNER_SECONDS` to 0; null = no banner active.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupTimers = useCallback((): void => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (redirectRef.current !== null) {
      clearTimeout(redirectRef.current);
      redirectRef.current = null;
    }
  }, []);

  const startBanner = useCallback((): void => {
    setSecondsLeft(BANNER_SECONDS);
    // Best-effort signOut on the local tab so any in-flight requests
    // cease seeing the now-revoked token.
    void getBrowserSupabase()
      .auth.signOut()
      .catch(() => {
        /* swallow — proceed regardless */
      });

    tickRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev === null || prev <= 0 ? prev : prev - 1));
    }, 1000);

    redirectRef.current = setTimeout(() => {
      cleanupTimers();
      if (typeof window !== 'undefined') {
        window.location.href = '/login?reason=cross-tab';
      }
    }, BANNER_SECONDS * 1000);
  }, [cleanupTimers]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ownTabId = getTabId();
    let channel: BroadcastChannel | null = null;

    try {
      channel = new BroadcastChannel(TOPICS.auth);
    } catch {
      return;
    }

    const handler = (ev: MessageEvent): void => {
      const data = ev.data as Partial<SignOutEnvelope> | null;
      if (!data || data.type !== 'signout') return;
      if (data.originTabId === ownTabId) return; // echo suppression

      // Codex R1 C1 — Defer if AccountDeleteFlow is mid-cascade (Conflict
      // #5). Persist a deferred marker so the listener can replay it once
      // the pending flag clears (both on success AND failure paths). The
      // previous behaviour silently dropped the signal, leaving this tab
      // out-of-sync if the local delete failed.
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PENDING_KEY) === '1') {
        try {
          sessionStorage.setItem(DEFERRED_KEY, '1');
        } catch {
          /* ignore — replay path will no-op if storage is unavailable */
        }
        return;
      }

      startBanner();
    };

    channel.addEventListener('message', handler);

    return () => {
      try {
        channel?.removeEventListener('message', handler);
        channel?.close();
      } catch {
        /* ignore */
      }
      cleanupTimers();
    };
  }, [startBanner, cleanupTimers]);

  // Codex R1 C1 — Deferred-marker replay. Polls sessionStorage for the
  // pending → cleared transition; when PENDING_KEY drops AND DEFERRED_KEY
  // is set, fire the banner once and consume the deferred marker. Polling
  // (rather than `storage` events) is required because AccountDeleteFlow's
  // `finally` block runs on the SAME tab — `storage` events fire only on
  // OTHER tabs per WHATWG. Same-tab observers must poll.
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const interval = setInterval(() => {
      const pending = sessionStorage.getItem(PENDING_KEY) === '1';
      const deferred = sessionStorage.getItem(DEFERRED_KEY) === '1';
      if (!pending && deferred) {
        try {
          sessionStorage.removeItem(DEFERRED_KEY);
        } catch {
          /* ignore */
        }
        startBanner();
      }
    }, PENDING_POLL_MS);
    return () => clearInterval(interval);
  }, [startBanner]);

  // Phase 3 a11y fix C3a — observe `html[data-offline]` so the banner
  // stacks below OfflineBar when both are visible.
  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const update = (): void => {
      setOfflineBarVisible(html.getAttribute('data-offline') === 'true');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ['data-offline'] });
    return () => observer.disconnect();
  }, []);

  if (secondsLeft === null) return null;

  const bodyText = t.settings.crossTabBanner.bodyFormat.replace('{seconds}', String(secondsLeft));
  const countdownText = t.settings.crossTabBanner.countdownFormat.replace(
    '{seconds}',
    String(secondsLeft),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="cross-tab-signout-banner"
      style={{
        position: 'fixed',
        // Phase 3 a11y fix C3a — stack below OfflineBar (32px tall) when
        // both are mounted; at top:0 otherwise. Synthesis §1.3 / auditor
        // §1.3 mandate: banner does not obscure the offline indicator.
        top: offlineBarVisible ? '32px' : 0,
        left: 0,
        right: 0,
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacing-3)',
        padding: '0 var(--spacing-4)',
        background: 'var(--color-bg-2)',
        borderBottom: '2px solid var(--color-ember)',
        color: 'var(--color-ivory)',
        // Banner z-index above OfflineBar (z=25) and any open dialog (z=60/61)
        // per synthesis §1.3 line 252 ("appears OVER any open modal").
        zIndex: 70,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 600,
          fontSize: '16px',
          color: 'var(--color-ember)',
          width: '18px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {t.settings.crossTabBanner.glyph}
      </span>
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: '15px',
          color: 'var(--color-ivory)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {bodyText}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-dust)',
        }}
      >
        {countdownText}
      </span>
      <a
        href="/login?reason=cross-tab"
        data-testid="cross-tab-signin-cta"
        style={{
          minWidth: '44px',
          minHeight: '44px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 var(--spacing-3)',
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          textDecoration: 'none',
          color: 'var(--color-ember)',
          border: '1px solid var(--color-ember)',
        }}
      >
        {t.settings.crossTabBanner.signInCta}
      </a>
    </div>
  );
}

export default CrossTabSignOutListener;
