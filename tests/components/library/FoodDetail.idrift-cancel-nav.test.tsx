/**
 * `<FoodDetail />` — POST-MVP-CODEX-R2-IDRIFT characterization tests.
 *
 * Background: commit `60bebd8` ("fix: E.CODEX Round-2 I1 — isolate
 * library-only Type draft on openModal") was characterised by an
 * auto-fix sub-agent as "lint-staged formatting" but actually contained
 * two real behavior changes to the library FoodDetail surface. Codex
 * Round-2 flagged the drift; the user authorised keep-with-tests.
 *
 * This file characterizes Change 1: FoodDetail's edit-mode CANCEL
 * button now also navigates back to `/library` after `edit.cancel()`,
 * matching the surrounding route-mode "exit this surface" pattern
 * already established by:
 *   - the top-bar BACK button (`onBack` → `router.push('/library')`)
 *   - the top-bar CLOSE (X) button (`onClose` → `router.push('/library')`)
 *   - the ESC key handler (also routes through `onClose`)
 *
 * In route mode (the default and only call-site today, per `Bug 1`
 * library overhaul 2026-05-16), `/library/[id]` is a navigated PAGE,
 * not a modal. Dropping the user on the detail page in view mode after
 * they explicitly chose to discard edits would leave them looking at
 * unchanged data — bouncing to /library matches the "Cancel takes me
 * out" mental model.
 *
 * Characterizes behavior introduced in 60bebd8 / locked in by
 * POST-MVP-CODEX-R2-IDRIFT closure (2026-05-17).
 *
 * Mock + harness intentionally mirror `FoodDetail.mutation-block.test.tsx`
 * so the test surface is consistent with sibling tests.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

vi.mock('next/dynamic', async () => {
  const { Suspense, lazy, createElement } = await import('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<unknown>) => {
      const Lazy = lazy(async () => {
        const mod = (await loader()) as unknown;
        let Comp: unknown = mod;
        if (typeof mod === 'object' && mod !== null) {
          const asMod = mod as { default?: unknown };
          Comp =
            asMod.default ??
            Object.values(mod as Record<string, unknown>).find(
              (v) => typeof v === 'function' || typeof v === 'object',
            );
        }
        return { default: Comp as React.ComponentType<Record<string, unknown>> };
      });
      const Wrapper = (props: Record<string, unknown>) =>
        createElement(Suspense, { fallback: null }, createElement(Lazy, props));
      return Wrapper;
    },
  };
});

const pushMock = vi.fn();
const refreshMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      refresh: refreshMock,
      replace: replaceMock,
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

vi.mock('@/lib/auth/refresh-interceptor', () => {
  class FakeSessionExpiredError extends Error {
    constructor(message = 'Session expired after refresh attempt') {
      super(message);
      this.name = 'SessionExpiredError';
    }
  }
  return {
    authPost: vi.fn().mockResolvedValue({ ok: true, item: {} }),
    AuthApiError: class AuthApiError extends Error {},
    SessionExpiredError: FakeSessionExpiredError,
  };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

const pushToastMock = vi.fn();
vi.mock('@/lib/stores/useUndoQueueStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stores/useUndoQueueStore')>(
    '@/lib/stores/useUndoQueueStore',
  );
  return {
    ...actual,
    useUndoQueueStore: (selector?: (s: unknown) => unknown) => {
      const state = { pushToast: pushToastMock };
      return selector ? selector(state) : state;
    },
  };
});

import { FoodDetail } from '@/app/(app)/library/_components/FoodDetail/FoodDetail';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18, fiber_g: 3 },
    micros: { sodium_mg: 800 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

const baseHistory = {
  firstLoggedAt: '2026-04-01T10:00:00Z',
  totalLogCount: 3,
  recent: [] as Array<{ id: string; loggedAt: string; mealCategory: string }>,
};

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  replaceMock.mockReset();
  pushToastMock.mockReset();
});

describe('<FoodDetail /> — POST-MVP-CODEX-R2-IDRIFT cancel-then-navigate', () => {
  it('clicking CANCEL in edit mode calls router.push("/library")', async () => {
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    // Enter edit mode via the EDIT button so we exercise the real flow,
    // not initialMode="edit" which has its own side-effect on first render.
    await user.click(screen.getByTestId('food-detail-edit-button'));
    expect(screen.getByTestId('food-detail-actions-edit')).toBeInTheDocument();

    pushMock.mockClear();
    await user.click(screen.getByTestId('food-detail-cancel-button'));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/library');
    });
  });

  it('CANCEL exits edit mode (drops draft) BEFORE navigating — both effects observed', async () => {
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(screen.getByTestId('food-detail-edit-button'));

    // Mutate a draft field to prove `edit.cancel()` actually fired (it
    // restores the draft from `initial`, which the next enter-edit
    // would re-derive — but we observe the simpler signal: edit-mode
    // CTA strip is replaced by the view-mode strip after cancel).
    const kcalInput = screen.getByTestId('food-detail-edit-kcal-input');
    await user.clear(kcalInput);
    await user.type(kcalInput, '999');

    pushMock.mockClear();
    await user.click(screen.getByTestId('food-detail-cancel-button'));

    // edit.cancel() collapses edit mode back to view mode (synchronous
    // via the hook's setState calls); the navigation push runs inside
    // `startNavTransition` so we await both signals.
    await waitFor(() => {
      // View-mode action strip is back.
      expect(screen.getByTestId('food-detail-actions-view')).toBeInTheDocument();
      // Navigation push fired.
      expect(pushMock).toHaveBeenCalledWith('/library');
    });
  });

  it('CANCEL navigation is consistent with BACK + CLOSE (all three push to /library)', async () => {
    const user = userEvent.setup();

    // BACK button → /library
    const { unmount: unmount1 } = render(<FoodDetail item={baseItem} history={baseHistory} />);
    pushMock.mockClear();
    await user.click(screen.getByTestId('food-detail-back'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/library'));
    const backCallCount = pushMock.mock.calls.filter((c) => c[0] === '/library').length;
    expect(backCallCount).toBe(1);
    unmount1();

    // CLOSE button → /library
    pushMock.mockClear();
    const { unmount: unmount2 } = render(<FoodDetail item={baseItem} history={baseHistory} />);
    await user.click(screen.getByTestId('food-detail-close'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/library'));
    const closeCallCount = pushMock.mock.calls.filter((c) => c[0] === '/library').length;
    expect(closeCallCount).toBe(1);
    unmount2();

    // CANCEL (edit mode) → /library — the IDRIFT-locked behavior.
    pushMock.mockClear();
    render(<FoodDetail item={baseItem} history={baseHistory} />);
    await user.click(screen.getByTestId('food-detail-edit-button'));
    await user.click(screen.getByTestId('food-detail-cancel-button'));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/library'));
    const cancelCallCount = pushMock.mock.calls.filter((c) => c[0] === '/library').length;
    expect(cancelCallCount).toBe(1);
  });
});
