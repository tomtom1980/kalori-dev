/**
 * @vitest-environment happy-dom
 *
 * Phase B Codex R1 — F-PB-R1-1: TypeTab draft must clear after a real
 * successful save through the LogFlowTabs → ConfirmationScreen pipeline.
 *
 * Adversarial finding (Codex):
 *   "TypeTab installs the resetDraft subscription inside its own useEffect,
 *    but LogFlowTabs explicitly replaces the entire Tabs.Root with
 *    ConfirmationScreen whenever phase === 'confirmation'. The save path
 *    happens inside ConfirmationScreen, so the TypeTab component that owns
 *    the listener has already unmounted and unsubscribed before
 *    clearClientId/exitConfirmation can produce the observed transition."
 *
 * The unit test in `tests/unit/log-flow/typetab-clears-after-save.test.tsx`
 * is a false-positive: it keeps `<TypeTab />` mounted via direct render and
 * synthesises a confirmation snapshot — a state impossible under the real
 * LogFlowTabs parent lifecycle.
 *
 * This integration test mounts the real `<LogFlowTabs />`, drives the full
 * lifecycle (entry → confirmation → save → entry), and asserts the type
 * draft + textarea are empty when the user returns to the type phase.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Shared mock handles — one per test case.
const authPostMock = vi.fn();
const authFetchMock = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPostMock(...args),
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  SessionExpiredError: class SE extends Error {},
}));

// ConfirmationScreen calls useRouter() for router.refresh() after save —
// happy-dom has no Next router, so stub it (matches LogFlowTabs-confirmation-wiring.test).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('LogFlowTabs — TYPE draft clears after real save lifecycle (F-PB-R1-1)', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
    authPostMock.mockReset();
    authFetchMock.mockReset();
  });
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('clears typeDraft + textarea after the user types → parses → saves → returns to TYPE tab', async () => {
    // 1) Mock the parse network call.
    authPostMock.mockResolvedValueOnce({
      result: {
        items: [
          {
            name: 'pho bo',
            portion: 1,
            unit: 'bowl',
            kcal: 450,
            macros: { protein_g: 25, carbs_g: 60, fat_g: 12, fiber_g: 3 },
            micros: {},
            confidence: 0.9,
          },
        ],
        reasoning: '1 bowl of pho bo ≈ 450 kcal',
      },
    });
    // 2) Mock the save chain: dedup-check (no-match) + entries/save (success).
    //    ConfirmationScreen issues a debounced dedup preflight on the primary
    //    item name AND posts to /api/entries/save on the Save click. We
    //    return permissive responses so the save path completes cleanly.
    authFetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/library/dedup-check')) {
        return new Response(JSON.stringify({ match: null }), { status: 200 });
      }
      if (typeof url === 'string' && url.includes('/api/entries/save')) {
        return new Response(JSON.stringify({ entry: { id: 'entry-test-id' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Unexpected calls — return 404 so the test fails loudly.
      return new Response(null, { status: 404 });
    });

    const user = userEvent.setup();

    // 3) Render LogFlowTabs in the entry phase, with TYPE active by default.
    const { rerender } = render(<LogFlowTabs />);

    // 4) Type the draft, click PARSE, wait for confirmation phase.
    const ta = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    await user.type(ta, 'pho bo');
    expect(useLogFlowStore.getState().typeDraft).toBe('pho bo');
    await user.click(screen.getByTestId('type-tab-parse-button'));

    await waitFor(() => {
      expect(useLogFlowStore.getState().phase).toBe('confirmation');
    });

    // 5) Click Save in ConfirmationScreen. The save path:
    //    POST /api/entries/save → 200 OK
    //      → clearClientId('type')
    //      → SAVE_OK reducer
    //      → onClose() → LogFlowTabs flips phase back to 'entry' + closeModal
    //    After this, the TYPE textarea is unmounted (modal closed) so we
    //    re-mount it via openModal + rerender to observe the post-save state.
    await user.click(screen.getByTestId('confirmation-save'));

    // 6) Wait for the save to complete (phase back to entry, clientIds.type
    //    cleared). This is the moment Codex flagged: TypeTab is unmounted
    //    here, so any subscription it owned has been torn down.
    await waitFor(() => {
      expect(useLogFlowStore.getState().clientIds.type).toBeUndefined();
      expect(useLogFlowStore.getState().phase).toBe('entry');
    });

    // 7) The user re-opens the modal (or the modal stays open and we see
    //    the entry phase again). The TYPE draft MUST now be empty — that's
    //    the user-visible promise of US-STAB-B2.
    useLogFlowStore.getState().openModal('type');
    rerender(<LogFlowTabs />);

    expect(useLogFlowStore.getState().typeDraft).toBe('');
    const reopenedTextarea = screen.getByTestId('type-tab-textarea') as HTMLTextAreaElement;
    expect(reopenedTextarea.value).toBe('');
  });
});
