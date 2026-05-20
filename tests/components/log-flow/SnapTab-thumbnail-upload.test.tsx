/**
 * Task 4.7.5 D1 — <SnapTab /> dual-output thumbnail upload tests.
 *
 * Bug pre-fix: SnapTab compresses ONCE into a ≤500 KB vision blob and POSTs
 * the same bytes to BOTH /api/ai/vision AND /api/storage/thumbnail. The
 * thumbnail route's hard 50 KB gate (I4 invariant) returns 413 every time;
 * SnapTab silently swallows the error so the user thinks the upload
 * succeeded.
 *
 * Contract (Task 4.7.5):
 *   1. SnapTab calls compressDualOutput() (NOT compressImage()).
 *   2. /api/ai/vision receives the vision blob's base64.
 *   3. /api/storage/thumbnail receives the THUMBNAIL blob's base64
 *      (a different payload from the vision blob).
 *   4. Thumbnail upload failure does NOT block onAnalyzeSuccess.
 *   5. Thumbnail upload failure surfaces:
 *        - SnapDraft.done.thumbnailUploadFailed = true
 *        - Sentry.captureException with component:'snap-tab' tag
 *        - Inline warning rendered with snapThumbnailFailed copy
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { SnapTab } from '@/app/(app)/log/_components/SnapTab';
import { t } from '@/lib/i18n/en';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

// Shared mock handles — reset per-case.
const authPostMock = vi.fn();
const sentryCaptureExceptionMock = vi.fn();
const NO_FOOD_TITLE = 'No recognizable food item is on this picture.';
const NO_FOOD_BODY = 'Try another photo or add the food item without a photo.';
const ADD_FOOD_ITEM = 'Add food item';

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (...args: unknown[]) => authPostMock(...args),
  authFetch: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => sentryCaptureExceptionMock(...args),
  addBreadcrumb: vi.fn(),
}));

// Stub the dynamic compress import so we control vision vs thumbnail blobs.
vi.mock('@/lib/image/compress', () => ({
  compressDualOutput: vi.fn(async () => ({
    vision: {
      blob: new Blob(['vision-bytes'], { type: 'image/jpeg' }),
      base64: 'data:image/jpeg;base64,AAAA',
      widthPx: 1600,
      heightPx: 1200,
      sizeBytes: 12,
    },
    thumbnail: {
      blob: new Blob(['thumb-bytes'], { type: 'image/webp' }),
      base64: 'data:image/webp;base64,BBBB',
      widthPx: 320,
      heightPx: 240,
      sizeBytes: 11,
    },
  })),
  // Keep the existing helper so SnapTab still imports it.
  stripDataUrlPrefix: (s: string) => {
    const c = s.indexOf(',');
    return c < 0 ? s : s.slice(c + 1);
  },
}));

function makeImageFile(): File {
  return new File(['fake'], 'meal.jpg', { type: 'image/jpeg' });
}

describe('<SnapTab /> — Task 4.7.5 dual-output thumbnail upload', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    authPostMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('posts the VISION blob base64 to /api/ai/vision and the THUMBNAIL blob base64 to /api/storage/thumbnail', async () => {
    // Vision succeeds → thumbnail succeeds.
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return {
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
            reasoning: '1 bowl ≈ 450 kcal',
          },
        };
      }
      if (url === '/api/storage/thumbnail') {
        return {
          path: 'user/abc.webp',
          signedUrl: 'https://signed.test/x',
          expiresAt: '2030-01-01T00:00:00Z',
        };
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const onAnalyzeSuccess = vi.fn();
    render(<SnapTab onAnalyzeSuccess={onAnalyzeSuccess} />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(onAnalyzeSuccess).toHaveBeenCalledTimes(1);
    });

    // Two POSTs: vision + thumbnail.
    const visionCall = authPostMock.mock.calls.find((c) => c[0] === '/api/ai/vision');
    const thumbCall = authPostMock.mock.calls.find((c) => c[0] === '/api/storage/thumbnail');

    expect(visionCall).toBeDefined();
    expect(thumbCall).toBeDefined();

    const visionBody = visionCall?.[1] as {
      imageBase64: string;
      mimeType: string;
      client_id: string;
    };
    const thumbBody = thumbCall?.[1] as {
      imageBase64: string;
      mimeType: string;
      client_id: string;
    };

    // Vision body: base64 stripped from `data:image/jpeg;base64,AAAA` → 'AAAA'.
    expect(visionBody.imageBase64).toBe('AAAA');
    expect(visionBody.mimeType).toBe('image/jpeg');

    // Thumbnail body: base64 stripped from `data:image/webp;base64,BBBB` → 'BBBB'.
    // CRITICAL: this MUST differ from the vision base64 — proves the thumbnail
    // blob is the source, not the vision blob.
    expect(thumbBody.imageBase64).toBe('BBBB');
    expect(thumbBody.mimeType).toBe('image/webp');

    // Same client_id across both POSTs.
    expect(visionBody.client_id).toBe(thumbBody.client_id);
    expect(visionBody.client_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('thumbnail upload failure does NOT block entry — onAnalyzeSuccess still fires with signedUrl=null', async () => {
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return {
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
            reasoning: '1 bowl ≈ 450 kcal',
          },
        };
      }
      if (url === '/api/storage/thumbnail') {
        throw new Error('413: thumbnail_too_large');
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const onAnalyzeSuccess = vi.fn();
    render(<SnapTab onAnalyzeSuccess={onAnalyzeSuccess} />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(onAnalyzeSuccess).toHaveBeenCalledTimes(1);
    });

    // signedUrl is null (entry still saved), parsed items forwarded.
    const [parsed, signedUrl] = onAnalyzeSuccess.mock.calls[0] as [
      Array<{ name: string }>,
      string | null,
    ];
    expect(signedUrl).toBeNull();
    expect(parsed[0]?.name).toBe('pho bo');

    // Failure mode is NOT set (no ManualEntryFallback rerouting).
    expect(useLogFlowStore.getState().failureMode).toBeNull();

    // SnapDraft.done with thumbnailUploadFailed=true.
    const draft = useLogFlowStore.getState().snapDraft;
    expect(draft.status).toBe('done');
    if (draft.status === 'done') {
      expect(draft.thumbnailUploadFailed).toBe(true);
    }
  });

  it('thumbnail upload failure captures Sentry exception with component:snap-tab tags', async () => {
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return {
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
            reasoning: '1 bowl ≈ 450 kcal',
          },
        };
      }
      throw new Error('413: thumbnail_too_large');
    });

    render(<SnapTab onAnalyzeSuccess={vi.fn()} />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
    });

    const [err, ctx] = sentryCaptureExceptionMock.mock.calls[0] as [
      Error,
      { tags?: { component?: string; stage?: string } },
    ];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('413');
    expect(ctx?.tags?.component).toBe('snap-tab');
    expect(ctx?.tags?.stage).toBe('thumbnail-upload');
  });

  it('inline warning is rendered when thumbnailUploadFailed=true', async () => {
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return {
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
            reasoning: '1 bowl ≈ 450 kcal',
          },
        };
      }
      throw new Error('413: thumbnail_too_large');
    });

    render(<SnapTab onAnalyzeSuccess={vi.fn()} />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId('snap-tab-thumbnail-failed')).toBeInTheDocument();
    });

    const warning = screen.getByTestId('snap-tab-thumbnail-failed');
    // role=status + aria-live=polite (matches existing analyzing-indicator pattern).
    expect(warning.getAttribute('role')).toBe('status');
    expect(warning.getAttribute('aria-live')).toBe('polite');
    // Exact i18n key match — surfaces copy drift (e.g. en.ts edits) as a
    // test failure instead of silently passing the looser regex.
    expect(warning.textContent).toBe(t.log.snapThumbnailFailed);
  });

  it('no-food vision fallback shows no manual detail form and Try Photo Again resets the snap draft', async () => {
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return { fallback: true, reason: 'no_food', originalInput: '<image>' };
      }
      throw new Error(`unexpected URL ${url}`);
    });

    render(<SnapTab />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByText(NO_FOOD_TITLE)).toBeInTheDocument();
    });

    expect(screen.getByText(NO_FOOD_BODY)).toBeInTheDocument();
    expect(screen.queryByTestId('manual-entry-fallback')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/food name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(t.log.fallbackSubmitCTA)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADD_FOOD_ITEM })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.log.fallbackRetryPhotoCTA })).toBeInTheDocument();
    expect(useLogFlowStore.getState().clientIds.snap).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: t.log.fallbackRetryPhotoCTA }));

    expect(useLogFlowStore.getState().snapDraft.status).toBe('idle');
    expect(useLogFlowStore.getState().clientIds.snap).toBeUndefined();
    expect(screen.queryByText(NO_FOOD_TITLE)).not.toBeInTheDocument();
    expect(screen.getByTestId('snap-tab-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('snap-tab-dropzone').querySelector('img')).toBeNull();
  });

  it('no-food Add food item opens the no-photo Add Food AI description flow', async () => {
    authPostMock.mockImplementation(async (url: string) => {
      if (url === '/api/ai/vision') {
        return { fallback: true, reason: 'no_food', originalInput: '<image>' };
      }
      throw new Error(`unexpected URL ${url}`);
    });

    useLogFlowStore.getState().setActiveTab('snap');
    render(<LogFlowTabs />);

    const input = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(screen.getByText(NO_FOOD_TITLE)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: ADD_FOOD_ITEM }));

    expect(useLogFlowStore.getState().activeTab).toBe('type');
    expect(useLogFlowStore.getState().snapDraft.status).toBe('idle');
    expect(useLogFlowStore.getState().clientIds.snap).toBeUndefined();
    expect(screen.getByText(t.log.typeDescribeLabel)).toBeInTheDocument();
    expect(screen.getByTestId('type-tab-textarea')).toBeInTheDocument();
    expect(screen.queryByTestId('manual-entry-fallback')).not.toBeInTheDocument();
  });
});
