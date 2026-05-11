/**
 * AC2 (F12 cross-tab) — `lib/auth/cross-tab-signout.ts` integration tests.
 *
 * Contract per synthesis §3.1 + briefing F12 cross-tab half:
 *   - `broadcastSignOut(reason?)` posts a SignOutMessage on
 *     `BroadcastChannel('kalori-auth')`.
 *   - `useCrossTabSignOut()` (a React hook) listens for SignOutMessages and on
 *     receive: triggers `supabase.auth.signOut()` + redirects to
 *     `/login?reason=cross-tab` after 5s.
 *   - Topic name is verbatim `'kalori-auth'` (TOPICS.auth).
 *   - Echo suppression: a tab does NOT receive its own broadcasts (originTabId
 *     check).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { TOPICS } from '@/lib/broadcast/topics';

// Mock the supabase browser client — the hook must call signOut() on receive.
const signOut = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: { signOut },
  }),
}));

async function pollUntil<T>(
  fn: () => T | undefined,
  timeoutMs = 1500,
  intervalMs = 10,
): Promise<T> {
  const start = Date.now();
  while (true) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error('pollUntil timeout');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Stub window.location for redirect tracking.
type WindowStub = { hrefWrites: string[]; restore: () => void };
function stubLocation(): WindowStub {
  const hrefWrites: string[] = [];
  const original = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      _href: 'http://localhost/settings',
      get href(): string {
        return this._href;
      },
      set href(v: string) {
        this._href = v;
        hrefWrites.push(v);
      },
      assign(v: string): void {
        this._href = v;
        hrefWrites.push(v);
      },
    },
  });
  return {
    hrefWrites,
    restore: () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    },
  };
}

describe('AC2 — F12 cross-tab sign-out', () => {
  let win: WindowStub;

  beforeEach(() => {
    signOut.mockReset();
    signOut.mockImplementation(async () => ({ error: null }));
    win = stubLocation();
    sessionStorage.clear();
  });

  afterEach(() => {
    win.restore();
  });

  it('uses verbatim topic string "kalori-auth"', () => {
    expect(TOPICS.auth).toBe('kalori-auth');
  });

  it('broadcasts a SignOutMessage on TOPICS.auth via broadcastSignOut()', async () => {
    const { broadcastSignOut } = await import('@/lib/auth/cross-tab-signout');

    const messages: unknown[] = [];
    const observer = new BroadcastChannel(TOPICS.auth);
    observer.onmessage = (ev) => {
      messages.push(ev.data);
    };

    broadcastSignOut('manual');

    await pollUntil(() => (messages.length > 0 ? messages[0] : undefined), 1000);
    observer.close();

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const first = messages[0] as { type: string; reason: string };
    expect(first.type).toBe('signout');
    expect(first.reason).toBe('manual');
  });

  it('three-tab scenario: receivers trigger supabase.auth.signOut()', async () => {
    const { useCrossTabSignOut } = await import('@/lib/auth/cross-tab-signout');

    // Tab B and C each mount the hook.
    const hookB = renderHook(() => useCrossTabSignOut());
    const hookC = renderHook(() => useCrossTabSignOut());

    // Sender posts directly with a different originTabId so receivers fire.
    const senderChannel = new BroadcastChannel(TOPICS.auth);
    senderChannel.postMessage({
      type: 'signout',
      reason: 'manual',
      at: Date.now(),
      originTabId: 'tab-A-different-from-bc',
    });

    // Wait for handler to fire — it calls signOut() synchronously after the
    // message arrives.
    await pollUntil(() => (signOut.mock.calls.length > 0 ? true : undefined), 1500);

    senderChannel.close();
    hookB.unmount();
    hookC.unmount();

    // Both tabs should have triggered signOut.
    expect(signOut.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not echo own broadcasts (suppresses self-receive)', async () => {
    const { useCrossTabSignOut, broadcastSignOut } = await import('@/lib/auth/cross-tab-signout');
    const { unmount } = renderHook(() => useCrossTabSignOut());

    broadcastSignOut('manual');

    // Wait long enough for any echo to potentially fire — but echo suppression
    // means it will NOT.
    await new Promise((r) => setTimeout(r, 200));

    expect(signOut).not.toHaveBeenCalled();
    unmount();
  });
});
