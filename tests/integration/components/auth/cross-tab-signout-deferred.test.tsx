/**
 * Task 5.3 Codex Round 1 C1 — Cross-tab sign-out dropped during AccountDeleteFlow Step 4.
 *
 * Original behaviour (`components/auth/CrossTabSignOutListener.tsx:~123`):
 *   While `sessionStorage['kalori-pending-cross-tab-signout']` is set, an
 *   incoming `BroadcastChannel('kalori-auth')` sign-out message is silently
 *   dropped. If the local delete fails (recoverable or unrecoverable),
 *   the signal is never replayed → other tabs already signed out, this
 *   tab keeps showing Step 6 "failure" with a still-valid session in
 *   memory. State is inconsistent across tabs.
 *
 * Fix contract — deferred-marker pattern:
 *   - When pending-flag is set and a sign-out signal arrives, store it in
 *     sessionStorage as a "deferred signal" (key
 *     `kalori-deferred-cross-tab-signout`).
 *   - When the pending flag transitions from set → cleared (the
 *     `AccountDeleteFlow.handleSubmit` `finally` block clears it), the
 *     listener replays any deferred signal: drops the flag, fires
 *     `startBanner()`.
 *
 * RED-first: this test mounts the listener, primes the pending flag,
 * dispatches a signal, then asserts the banner appears AFTER the flag is
 * cleared. The fail-path branch is also exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

import { TOPICS } from '@/lib/broadcast/topics';
import { CrossTabSignOutListener } from '@/components/auth/CrossTabSignOutListener';

// Mock the supabase browser client — the listener calls signOut() on receive.
const signOut = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: { signOut },
  }),
}));

const PENDING_KEY = 'kalori-pending-cross-tab-signout';
const DEFERRED_KEY = 'kalori-deferred-cross-tab-signout';

describe('Codex R1 C1 — cross-tab sign-out deferred-marker pattern', () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockImplementation(async () => ({ error: null }));
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('defers signal while pending flag is set, replays after flag is cleared', async () => {
    sessionStorage.setItem(PENDING_KEY, '1');

    const { queryByTestId, unmount } = render(<CrossTabSignOutListener />);

    // Sanity: the banner is NOT visible yet.
    expect(queryByTestId('cross-tab-signout-banner')).toBeNull();

    // Dispatch a sign-out signal from a sibling tab. Echo suppression keys
    // off `originTabId` — pick one not already used.
    const sender = new BroadcastChannel(TOPICS.auth);
    await act(async () => {
      sender.postMessage({
        type: 'signout',
        reason: 'cross-tab',
        at: Date.now(),
        originTabId: 'sibling-tab-not-this-one',
      });
      // Allow message dispatch to land.
      await new Promise((r) => setTimeout(r, 50));
    });

    // The signal was deferred → no banner yet.
    expect(queryByTestId('cross-tab-signout-banner')).toBeNull();
    // The deferred-marker MUST be set in sessionStorage so it survives the
    // pending → cleared transition.
    expect(sessionStorage.getItem(DEFERRED_KEY)).not.toBeNull();

    // Simulate the AccountDeleteFlow finally block: clear pending flag.
    await act(async () => {
      sessionStorage.removeItem(PENDING_KEY);
      // Nudge the listener — the deferred-replay path is triggered by a
      // synthetic event the implementation owns. We dispatch the canonical
      // `storage` event so a passive listener could pick it up; the
      // implementation may instead use an interval or a custom event.
      // The test assertion is on the visible outcome — banner appears.
      window.dispatchEvent(new StorageEvent('storage', { key: PENDING_KEY, newValue: null }));
      await new Promise((r) => setTimeout(r, 100));
    });

    // The deferred signal MUST replay → banner becomes visible.
    await waitFor(
      () => {
        expect(queryByTestId('cross-tab-signout-banner')).not.toBeNull();
      },
      { timeout: 1500 },
    );
    // Deferred-marker is consumed (cleared) on replay.
    expect(sessionStorage.getItem(DEFERRED_KEY)).toBeNull();

    sender.close();
    unmount();
  });

  it('replays deferred signal after delete failure (pending → cleared on failure path)', async () => {
    sessionStorage.setItem(PENDING_KEY, '1');

    const { queryByTestId, unmount } = render(<CrossTabSignOutListener />);

    const sender = new BroadcastChannel(TOPICS.auth);
    await act(async () => {
      sender.postMessage({
        type: 'signout',
        reason: 'cross-tab',
        at: Date.now(),
        originTabId: 'sibling-tab-not-this-one-fail',
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(queryByTestId('cross-tab-signout-banner')).toBeNull();
    expect(sessionStorage.getItem(DEFERRED_KEY)).not.toBeNull();

    // Failure path: AccountDeleteFlow.handleSubmit catch branch hits the
    // `finally`, clears PENDING_KEY. Failure does NOT clear DEFERRED_KEY.
    await act(async () => {
      sessionStorage.removeItem(PENDING_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: PENDING_KEY, newValue: null }));
      await new Promise((r) => setTimeout(r, 100));
    });

    await waitFor(
      () => {
        expect(queryByTestId('cross-tab-signout-banner')).not.toBeNull();
      },
      { timeout: 1500 },
    );

    sender.close();
    unmount();
  });
});
