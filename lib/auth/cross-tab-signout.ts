'use client';

/**
 * F12 cross-tab sign-out propagation (Task 5.2).
 *
 * Contract per synthesis §3.1 + briefing F12 cross-tab half:
 *   - `broadcastSignOut(reason?)` — emit a SignOutMessage on
 *     BroadcastChannel('kalori-auth'). Called from:
 *       - SIGN OUT button click handler (reason: 'manual')
 *       - AccountDeleteFlow on success (reason: 'account-deleted')
 *       - Future server-revoked path (reason: 'session-revoked')
 *   - `useCrossTabSignOut()` — React hook installing the listener. On receive,
 *     it calls supabase.auth.signOut() and redirects to /login?reason=cross-tab
 *     after a 5s countdown banner (the banner UI itself lives in
 *     <CrossTabSignOutListener /> — this hook owns the timer + redirect only).
 *
 * Echo suppression: each tab generates a stable per-session UUID
 * (sessionStorage 'kalori-tab-id'); receivers ignore messages whose
 * `originTabId` matches their own.
 *
 * Sibling, NOT a dependency of, `lib/auth/refresh-interceptor.ts` (R1
 * firewall — the two modules have orthogonal lifecycles per briefing §F12
 * split contracts).
 */
import { useEffect } from 'react';

import { TOPICS } from '@/lib/broadcast/topics';
import { getBrowserSupabase } from '@/lib/supabase/client';

export type SignOutReason = 'manual' | 'session-revoked' | 'account-deleted';

export interface SignOutMessage {
  type: 'signout';
  reason: SignOutReason;
  at: number;
  originTabId: string;
}

const TAB_ID_KEY = 'kalori-tab-id';

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
    // sessionStorage may be unavailable (private tabs, security policies).
    // Fall back to a per-call random id; echo suppression then degrades to
    // no-suppression but everything else still works.
    return `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

/**
 * Emitter — call from SignOut button handler AND AccountDeleteFlow on success.
 * Posts a SignOutMessage; the channel is held briefly so the message lands
 * before being closed.
 */
export function broadcastSignOut(reason: SignOutReason = 'manual'): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(TOPICS.auth);
    const message: SignOutMessage = {
      type: 'signout',
      reason,
      at: Date.now(),
      originTabId: getTabId(),
    };
    channel.postMessage(message);
    // Close after a microtask so the message lands.
    queueMicrotask(() => {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    });
  } catch {
    // If BroadcastChannel construction fails, silently degrade — the local
    // tab's sign-out path is independent of cross-tab propagation.
  }
}

/**
 * Hook — installs BroadcastChannel('kalori-auth') listener.
 *
 * On receive (from a different originTabId): calls supabase.auth.signOut()
 * and redirects to /login?reason=cross-tab. The 5s banner countdown is
 * UI-level state owned by <CrossTabSignOutListener /> in Phase 2B — this
 * hook itself fires the redirect after a 5s timer so a tab without the
 * banner component still propagates correctly.
 *
 * Cleanup unconditionally calls channel.close() on unmount (HMR safety).
 */
export function useCrossTabSignOut(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ownTabId = getTabId();
    let channel: BroadcastChannel | null = null;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      channel = new BroadcastChannel(TOPICS.auth);
    } catch {
      return;
    }

    const handler = (ev: MessageEvent): void => {
      const data = ev.data as Partial<SignOutMessage> | null;
      if (!data || data.type !== 'signout') return;
      if (data.originTabId === ownTabId) return; // echo suppression

      // Best-effort signOut + 5s redirect. The banner UI in Phase 2B may
      // observe the same channel and render a countdown — this hook is the
      // baseline redirect even when the UI component is absent.
      void getBrowserSupabase()
        .auth.signOut()
        .catch(() => {
          /* swallow — proceed to redirect regardless */
        });

      redirectTimer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?reason=cross-tab';
        }
      }, 5000);
    };

    channel.addEventListener('message', handler);

    return () => {
      try {
        channel?.removeEventListener('message', handler);
        channel?.close();
      } catch {
        /* ignore */
      }
      if (redirectTimer !== null) clearTimeout(redirectTimer);
    };
  }, []);
}
