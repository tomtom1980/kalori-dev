/**
 * `<FoodDetail />` Log Now retry — client_id idempotency persistence
 * (Task C.CODEX Round 3 Finding R3-1).
 *
 * Closes the retry-duplicates loophole flagged by Codex R3. The R2 fix to
 * the log-now route preserves the inserted `food_entries` row when the
 * post-insert recheck returns 500 `recheck_failed`, but the client was
 * minting a FRESH `client_id` on every click. A user hitting the inline
 * banner and retrying generated a brand-new idempotency key — the server's
 * I11 SELECT-by-`(user_id, client_id)` replay path could not locate the
 * preserved row, so a SECOND insert duplicated the entry.
 *
 * Contract under test:
 *   - Retryable failures (5xx + network TypeError) → component persists the
 *     original `client_id` so the next click's POST reuses it; the server
 *     I11 SELECT-by-(user_id, client_id) finds the preserved row and
 *     returns it with `replayed: true`.
 *   - Definitive outcomes (2xx success, 4xx validation, SessionExpiredError)
 *     → component clears the persisted `client_id` so the next click mints
 *     a fresh one (a new attempt is semantically a fresh request).
 *   - Persistence is COMPONENT-LIFETIME scoped: an unmount/remount cycle
 *     resets the persisted `client_id` (no localStorage, no cross-session
 *     persistence — Codex R3 spec).
 *
 * RED-state failure mode: pre-fix, every onLogNow call mints
 * `clientId = crypto.randomUUID()` unconditionally, so the SECOND call's
 * UUID differs from the first. These assertions FAIL until a
 * `pendingClientIdRef` is wired into the click handler.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

// next/dynamic — render imported module directly (same pattern as
// FoodDetail-LogNow.test.tsx).
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

// Stub next/navigation router.
const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      refresh: refreshMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

// authPost mock — overridable per-test via setMock helper.
const authPostMock = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => {
  class FakeAuthApiError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'AuthApiError';
      this.status = status;
      this.body = body;
    }
  }
  class FakeSessionExpiredError extends Error {
    constructor(message = 'Session expired after refresh attempt') {
      super(message);
      this.name = 'SessionExpiredError';
    }
  }
  return {
    authPost: (...args: unknown[]) => authPostMock(...args),
    AuthApiError: FakeAuthApiError,
    SessionExpiredError: FakeSessionExpiredError,
  };
});

const sentryCaptureMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (err: unknown, ctx?: unknown) => sentryCaptureMock(err, ctx),
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
import { AuthApiError } from '@/lib/auth/refresh-interceptor';

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

/** Pull `client_id` from the Nth authPost call argument tuple. */
function clientIdFromCall(n: number): string {
  const call = authPostMock.mock.calls[n];
  if (!call) throw new Error(`No authPost call at index ${n}`);
  const body = call[1] as { client_id?: unknown };
  if (typeof body.client_id !== 'string') {
    throw new Error(`Call ${n} body missing string client_id`);
  }
  return body.client_id;
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  authPostMock.mockReset();
  sentryCaptureMock.mockReset();
  pushToastMock.mockReset();
});

describe('<FoodDetail /> — Log Now client_id retry persistence (Codex R3-1)', () => {
  it('PERSISTS client_id when first call returns 500 recheck_failed (retry reuses same UUID)', async () => {
    // R2-fix shape: `authPost` throws `authPost <url> failed: 500` on any
    // non-ok response. The recheck_failed 500 is the canonical retryable
    // server error — the route preserved the inserted row, so the retry
    // must use the SAME client_id to hit the I11 SELECT replay path.
    authPostMock
      .mockRejectedValueOnce(new Error(`authPost /api/library/${baseItem.id}/log-now failed: 500`))
      .mockResolvedValueOnce({
        entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
        replayed: true,
      });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    // Wait for the first call to settle + error banner to mount.
    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('food-detail-error')).toBeInTheDocument();
    });

    // User retries.
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });

    expect(clientIdFromCall(0)).toBe(clientIdFromCall(1));
  });

  it('CLEARS client_id when first call returns 200 OK (next click mints fresh UUID)', async () => {
    authPostMock
      .mockResolvedValueOnce({
        entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
      })
      .mockResolvedValueOnce({
        entry: { id: 'entry-2', logged_at: '2026-05-15T08:31:00Z' },
      });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
      // Button returns to idle after success.
      expect(btn).not.toBeDisabled();
    });

    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });

    expect(clientIdFromCall(0)).not.toBe(clientIdFromCall(1));
  });

  it('CLEARS client_id when first call returns 400 logged_at_too_old (retry mints fresh UUID)', async () => {
    // 400 validation error — different logged_at on retry IS a fresh request.
    // The persisted row (if any) is for the OLD logged_at; a new attempt
    // with new logged_at should not collide.
    authPostMock
      .mockRejectedValueOnce(new Error(`authPost /api/library/${baseItem.id}/log-now failed: 400`))
      .mockResolvedValueOnce({
        entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
      });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('food-detail-error')).toBeInTheDocument();
    });

    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });

    expect(clientIdFromCall(0)).not.toBe(clientIdFromCall(1));
  });

  it('PERSISTS client_id when first call rejects with TypeError (network failure → retry reuses UUID)', async () => {
    // Network failure (fetch rejects with TypeError) is the other canonical
    // retryable failure mode — the server may or may not have received the
    // request; the I11 idempotency contract means the retry is safe either
    // way ONLY IF the client_id is preserved.
    authPostMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({
      entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
    });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('food-detail-error')).toBeInTheDocument();
    });

    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });

    expect(clientIdFromCall(0)).toBe(clientIdFromCall(1));
  });

  it('component-scoped persistence: unmount/remount resets the persisted client_id (no cross-session)', async () => {
    // Codex R3 explicitly bounds the fix to component-state-scoped
    // persistence. A remount after navigate-away-and-back is a fresh attempt
    // — localStorage is OUT OF SCOPE.
    authPostMock
      .mockRejectedValueOnce(new Error(`authPost /api/library/${baseItem.id}/log-now failed: 500`))
      .mockResolvedValueOnce({
        entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
      });

    const user = userEvent.setup();
    const { unmount } = render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn1 = await screen.findByTestId('food-detail-log-now');
    await user.click(btn1);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
    });

    // User navigates away — component unmounts.
    unmount();

    // User returns to /library/[id] — fresh mount.
    render(<FoodDetail item={baseItem} history={baseHistory} />);
    const btn2 = await screen.findByTestId('food-detail-log-now');
    await user.click(btn2);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });

    // Fresh mount = fresh client_id. The persisted-across-retry value
    // from the first mount MUST NOT leak into the second mount.
    expect(clientIdFromCall(0)).not.toBe(clientIdFromCall(1));
  });

  it('duplicate Log Now opens in-app dialog and cancel does not retry', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock.mockRejectedValueOnce(
      new AuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }),
    );

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('duplicate-log-cancel'));

    expect(authPostMock).toHaveBeenCalledTimes(1);
  });

  it('duplicate Log Now confirm retries with allow_duplicate and the same client_id', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock
      .mockRejectedValueOnce(new AuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }))
      .mockResolvedValueOnce({
        entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' },
      });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('duplicate-log-confirm'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(2);
    });
    expect(clientIdFromCall(0)).toBe(clientIdFromCall(1));
    expect(authPostMock.mock.calls[1]?.[1]).toMatchObject({ allow_duplicate: true });
  });
});
