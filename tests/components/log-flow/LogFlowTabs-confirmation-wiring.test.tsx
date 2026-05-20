/**
 * Task 3.6 Codex Split B F-UI-3.6-B-1 — confirmation wiring regression test.
 *
 * Bug: `<LogFlowTabs />` rendered `<TypeTab />` / `<SnapTab />` without the
 * `onParseSuccess` / `onAnalyzeSuccess` callbacks, so the shipped tabs
 * NEVER entered the confirmation phase in production — only Task 3.3's
 * component tests (which called `enterConfirmation` directly on the store)
 * made the flow appear to work.
 *
 * Contract (Task 3.4 §2.3 + synthesis §6.1):
 *   1. TypeTab PARSE success → store `phase === 'confirmation'`.
 *   2. SnapTab ANALYZE success → store `phase === 'confirmation'`.
 *   3. Manual-fallback submit (from either tab) → store `phase === 'confirmation'`.
 *
 * The tests here render the real `<LogFlowTabs />` (not `<TypeTab />` in
 * isolation), mock `authPost` / `authFetch` so the network side resolves
 * deterministically, fire the user action, and assert the store flipped
 * to confirmation + `<ConfirmationScreen />` mounted.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Shared mock handles — tests mutate per-case.
const authPostMock = vi.fn();
const authFetchMock = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPostMock(...args),
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  SessionExpiredError: class SE extends Error {},
}));

// ConfirmationScreen calls useRouter() for router.refresh() after save —
// happy-dom has no app router, so stub it.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// This wiring suite asserts the desktop editable portion input. The mobile
// wheel trigger is covered separately by mobile-wheel-picker-consumers.
vi.mock('@/lib/hooks/use-is-mobile', () => ({
  MOBILE_QUERY: '(max-width: 1279px)',
  useIsMobile: () => false,
}));

describe('<LogFlowTabs /> — F-UI-3.6-B-1 confirmation wiring', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
    authPostMock.mockReset();
    authFetchMock.mockReset();
    // Default authFetch → dedup-check no-match (ConfirmationScreen preflight).
    authFetchMock.mockResolvedValue(new Response(JSON.stringify({ match: null }), { status: 200 }));
  });
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('TYPE tab — successful PARSE enters confirmation phase', async () => {
    const user = userEvent.setup();
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

    render(<LogFlowTabs />);

    const ta = screen.getByTestId('type-tab-textarea');
    await user.type(ta, 'pho bo');
    await user.click(screen.getByTestId('type-tab-parse-button'));

    // Assert the store flipped to confirmation AND ConfirmationScreen mounted.
    await waitFor(() => {
      expect(useLogFlowStore.getState().phase).toBe('confirmation');
    });
    expect(screen.getByTestId('confirmation-screen')).toBeInTheDocument();
    const payload = useLogFlowStore.getState().confirmationPayload;
    expect(payload?.source).toBe('text');
    expect(payload?.tab).toBe('type');
    expect(payload?.items[0]?.name).toBe('pho bo');
    expect(payload?.reasoning).toBe('1 bowl of pho bo ≈ 450 kcal');
  });

  it('SNAP tab — successful ANALYZE (via fallback path) enters confirmation phase', async () => {
    // Simulate the SnapTab's done-state by firing onAnalyzeSuccess equivalent.
    // Easier TDD path: switch to snap tab, seed a done snapDraft via the store,
    // and assert the wiring propagates enterConfirmation when the tab's
    // success callback fires. Rather than drive through full compression +
    // vision mocks, we assert via the observable seam: when SnapTab's
    // onAnalyzeSuccess prop is invoked, the store enters confirmation.
    //
    // The production bug is that LogFlowTabs does NOT pass the callback.
    // Once wired, simulating a successful analyze call on SnapTab with a
    // compressed draft + mocked authPost chain SHOULD flip the store.
    //
    // For this test we take the direct route: render LogFlowTabs, flip the
    // active tab to snap, and assert the SnapTab component under
    // LogFlowTabs receives onAnalyzeSuccess (by invoking the same mock
    // network path that SnapTab uses and confirming the store transitions).

    // Mock vision + thumbnail calls.
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return {
          result: {
            items: [
              {
                name: 'banh mi',
                portion: 1,
                unit: 'piece',
                kcal: 350,
                macros: { protein_g: 15, carbs_g: 50, fat_g: 10, fiber_g: 3 },
                micros: {},
                confidence: 0.85,
              },
            ],
            reasoning: 'one banh mi',
          },
        };
      }
      if (url === '/api/storage/thumbnail') {
        return {
          path: 'user/1.jpg',
          signedUrl: 'https://signed',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
      }
      throw new Error(`unexpected authPost url: ${url}`);
    });

    // Mock compressDualOutput so we don't need the worker / browser-image-compression.
    // Task 4.7.5 split compressImage into two passes (vision + thumbnail) — the
    // SnapTab consumes `compressDualOutput`. Compressed shape:
    //   { vision: CompressResult, thumbnail: CompressResult }
    vi.doMock('@/lib/image/compress', () => ({
      compressDualOutput: async (_file: File, opts?: { onProgress?: (p: number) => void }) => {
        opts?.onProgress?.(0.5);
        const visionBlob = new Blob(['x'], { type: 'image/jpeg' });
        const thumbBlob = new Blob(['x'], { type: 'image/webp' });
        return {
          vision: {
            base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==',
            sizeBytes: 100,
            blob: visionBlob,
            widthPx: 640,
            heightPx: 480,
          },
          thumbnail: {
            base64: 'data:image/webp;base64,UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
            sizeBytes: 50,
            blob: thumbBlob,
            widthPx: 320,
            heightPx: 240,
          },
        };
      },
      compressImage: async (_file: File, opts?: { onProgress?: (p: number) => void }) => {
        opts?.onProgress?.(0.5);
        return {
          base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==',
          sizeBytes: 100,
          blob: new Blob(['x'], { type: 'image/jpeg' }),
          widthPx: 640,
          heightPx: 480,
        };
      },
      stripDataUrlPrefix: (b64: string) =>
        b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64,
    }));

    const { SnapTab } = await import('@/app/(app)/log/_components/SnapTab');
    // Render SnapTab in isolation to verify behaviour once wired.
    // The LogFlowTabs wiring test below asserts the actual prop pass-through.

    // Instead of going through full file-drop mechanics, directly exercise the
    // wiring contract: LogFlowTabs should pass onAnalyzeSuccess that calls
    // enterConfirmation. We do that by rendering LogFlowTabs and passing
    // a file to the hidden input.
    useLogFlowStore.getState().setActiveTab('snap');
    void SnapTab; // imported to ensure mocks resolve

    const user = userEvent.setup();
    render(<LogFlowTabs />);

    const fileInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, file);

    await waitFor(
      () => {
        expect(useLogFlowStore.getState().phase).toBe('confirmation');
      },
      { timeout: 3000 },
    );
    const payload = useLogFlowStore.getState().confirmationPayload;
    expect(payload?.source).toBe('photo');
    expect(payload?.tab).toBe('snap');
    expect(payload?.items[0]?.name).toBe('banh mi');
    expect(screen.getByTestId('confirmation-item-0-name')).toHaveValue('banh mi');
    expect(screen.getByTestId('confirmation-item-0-portion')).toHaveValue(1);
    expect(screen.getByTestId('confirmation-item-0-kcal')).toHaveValue(350);
  });

  it('TYPE tab manual-fallback submit enters confirmation phase', async () => {
    // Seed a failure state so ManualEntryFallback mounts inline in TypeTab.
    act(() => {
      useLogFlowStore.getState().setFailureMode('network', 'seed input');
    });
    render(<LogFlowTabs />);

    const user = userEvent.setup();
    const foodInput = screen.getByLabelText(/food name/i);
    const portionInput = screen.getByLabelText(/portion/i);
    const kcalInput = screen.getByLabelText(/kcal|calories/i);

    await user.clear(foodInput);
    await user.type(foodInput, 'bun cha');
    await user.type(portionInput, '300');
    await user.type(kcalInput, '520');

    await user.click(screen.getByTestId('manual-entry-fallback-submit'));

    await waitFor(() => {
      expect(useLogFlowStore.getState().phase).toBe('confirmation');
    });
    const payload = useLogFlowStore.getState().confirmationPayload;
    expect(payload?.source).toBe('manual');
    expect(payload?.tab).toBe('type');
    expect(payload?.items[0]?.name).toBe('bun cha');
    expect(payload?.items[0]?.portion).toBe(300);
    expect(payload?.items[0]?.kcal).toBe(520);
  });
});
