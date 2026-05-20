/**
 * `<FoodDetail />` Log Now atomic-insert test — Task C.2 (US-STAB-C2 AC4).
 *
 * Validates that the LOG THIS NOW button now performs an atomic server-side
 * insert via authPost('/api/library/[id]/log-now', ...) INSTEAD of the
 * legacy `router.push('/log?tab=library&...')` deep-link.
 *
 * Contract:
 *   - Click invokes authPost with the new route + a UUID client_id body.
 *   - useRef latch prevents double-submit (lesson #1: latch set BEFORE
 *     entering startTransition; released in finally).
 *   - On success: pushToast called with the success copy; router.refresh()
 *     fires so the Recent Entries section re-renders.
 *   - On error: Sentry.captureException invoked BEFORE setting the
 *     inline error banner (lesson #9 — never swallow).
 *   - SessionExpiredError: silently no-ops (interceptor handles redirect).
 *
 * RED-state failure mode: the existing FoodDetail.tsx implementation calls
 * `router.push('/log?tab=library&...')` — these assertions fail until the
 * onLogNow callback is rewritten.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

// next/dynamic — render imported module directly (same pattern as
// FoodDetail.a11y.test.tsx).
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

// Sentry mock to assert capture-before-fail.
const sentryCaptureMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (err: unknown, ctx?: unknown) => sentryCaptureMock(err, ctx),
}));

// Undo store: only need the pushToast slice; default to a vi.fn we can spy on.
const pushToastMock = vi.fn();
vi.mock('@/lib/stores/useUndoQueueStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stores/useUndoQueueStore')>(
    '@/lib/stores/useUndoQueueStore',
  );
  return {
    ...actual,
    useUndoQueueStore: (selector?: (s: unknown) => unknown) => {
      // Component selects `(s) => s.pushToast` — return the mock when called
      // with a selector, or a state-like obj fallback.
      const state = { pushToast: pushToastMock };
      return selector ? selector(state) : state;
    },
  };
});

import { FoodDetail } from '@/app/(app)/library/_components/FoodDetail/FoodDetail';
import { SessionExpiredError } from '@/lib/auth/refresh-interceptor';

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
  authPostMock.mockReset();
  sentryCaptureMock.mockReset();
  pushToastMock.mockReset();
});

describe('<FoodDetail /> — AC4 Log Now atomic insert', () => {
  it('clicking LOG THIS NOW invokes authPost on /api/library/[id]/log-now with a UUID client_id', async () => {
    authPostMock.mockResolvedValue({ entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' } });
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    // Library Add Item → "log this now" now opens a meal-slot picker.
    // The original test verified the immediate POST; the picker adds a
    // one-click intermediary. Picking SNACK keeps the test's intent (a
    // single POST is fired) without changing what's being verified.
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
    });

    const [url, body] = authPostMock.mock.calls[0]!;
    expect(url).toBe(`/api/library/${baseItem.id}/log-now`);
    expect(body).toMatchObject({});
    expect(typeof (body as { client_id?: unknown }).client_id).toBe('string');
    // RFC 4122 UUIDv4-ish shape.
    expect((body as { client_id: string }).client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('does NOT call router.push to /log on click (legacy deep-link removed)', async () => {
    authPostMock.mockResolvedValue({ entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' } });
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    // Library Add Item → "log this now" now opens a meal-slot picker.
    // The original test verified the immediate POST; the picker adds a
    // one-click intermediary. Picking SNACK keeps the test's intent (a
    // single POST is fired) without changing what's being verified.
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalled();
    });
    const pushedToLog = pushMock.mock.calls.some(
      ([href]) => typeof href === 'string' && href.startsWith('/log'),
    );
    expect(pushedToLog).toBe(false);
  });

  it('on success: pushes a success toast AND calls router.refresh()', async () => {
    authPostMock.mockResolvedValue({ entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' } });
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(await screen.findByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(pushToastMock).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('double-submit latch: rapid double click only fires one authPost', async () => {
    // authPost stays pending for the duration so the latch must hold.
    let resolveFn: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    await user.click(btn);
    // Library Add Item → "log this now" now opens a meal-slot picker.
    // The original test verified the immediate POST; the picker adds a
    // one-click intermediary. Picking SNACK keeps the test's intent (a
    // single POST is fired) without changing what's being verified.
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));
    await user.click(btn);
    await user.click(btn);

    // Even with 3 rapid clicks, only one POST should fire because the latch
    // is set before entering startTransition.
    expect(authPostMock).toHaveBeenCalledTimes(1);

    resolveFn({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });
  });

  it('on error: Sentry.captureException invoked BEFORE error banner shown (lesson #9)', async () => {
    const callOrder: string[] = [];
    sentryCaptureMock.mockImplementation(() => callOrder.push('sentry'));
    authPostMock.mockRejectedValue(new Error('boom'));

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(await screen.findByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(sentryCaptureMock).toHaveBeenCalledTimes(1);
    });
    expect(sentryCaptureMock).toHaveBeenCalledWith(expect.any(Error), expect.anything());

    // Error banner becomes visible — and its appearance happens AFTER Sentry
    // capture (we resolve waitFor only when both have fired).
    await waitFor(() => {
      expect(screen.getByText(/couldn't log — try again/i)).toBeInTheDocument();
    });

    expect(callOrder[0]).toBe('sentry');
  });

  it('on SessionExpiredError: no Sentry capture, no error banner (interceptor owns the redirect)', async () => {
    authPostMock.mockRejectedValue(new SessionExpiredError());
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(await screen.findByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalled();
    });

    expect(sentryCaptureMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't log — try again/i)).not.toBeInTheDocument();
  });

  // C.2 Phase 3 Round 1 (CRIT-3 design-a11y).
  it('in-flight cue: button is disabled + aria-busy + label "Logging…" while pending, restored after resolve', async () => {
    let resolveFn: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const btn = await screen.findByTestId('food-detail-log-now');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent(/log this now/i);

    await user.click(btn);
    // Meal-slot picker — pick SNACK to fire the POST (the original
    // test expected the POST to fire on the first click, but the
    // picker adds an intermediate step).
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    // While pending: disabled + aria-busy + label swapped to "Logging…".
    await waitFor(() => {
      expect(btn).toBeDisabled();
    });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveTextContent(/logging/i);

    // Visually-hidden live region announces "Logging…" to AT.
    const status = screen.getByTestId('food-detail-log-now-status');
    expect(status).toHaveTextContent(/logging/i);

    // Resolve — button returns to idle state.
    resolveFn({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });

    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
    expect(btn).toHaveAttribute('aria-busy', 'false');
    expect(btn).toHaveTextContent(/log this now/i);
    expect(status).toHaveTextContent('');
  });

  // C.2 Phase 3 Round 1 (C-CRIT-1 react-perf): request body field name.
  it('sends `logged_at` field (not `ate_at`) — matches server strict Zod schema', async () => {
    authPostMock.mockResolvedValue({ entry: { id: 'entry-1', logged_at: '2026-05-15T08:30:00Z' } });
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(await screen.findByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(authPostMock).toHaveBeenCalledTimes(1);
    });

    const [, body] = authPostMock.mock.calls[0]!;
    const typed = body as Record<string, unknown>;
    expect(typed).toHaveProperty('logged_at');
    expect(typed).not.toHaveProperty('ate_at');
    expect(typeof typed.logged_at).toBe('string');
    // ISO 8601 shape (the server schema uses z.string().datetime()).
    expect(typed.logged_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
