import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BacTracker } from '@/components/dashboard/BacTracker';

// `vi.mock` factories are hoisted ABOVE the module's `const` declarations
// during transform. Use `vi.hoisted` so the mock spies are created in the
// same hoisted scope and the factory closures can reference them safely.
const { refreshMock, authFetchMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  authFetchMock: vi.fn(),
}));

// `next/navigation` is mocked solely as a regression guard — the new
// implementation must NEVER call `router.refresh()` (Bug D fix). Any test
// can assert the refresh mock was not called by reading `refreshMock`.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

// `authFetch` mock — the widget swapped from `router.refresh()` to
// `authFetch('/api/dashboard/bac')` for widget-only refresh (Bug D).
// `lib/auth/refresh-interceptor.ts` is the canonical 401-aware fetch
// wrapper. `SessionExpiredError` is re-exported from the real module so
// the widget's `instanceof`-check works without a stand-in class.
vi.mock('@/lib/auth/refresh-interceptor', async (importOriginal) => {
  const actual: typeof import('@/lib/auth/refresh-interceptor') = await importOriginal();
  return {
    ...actual,
    authFetch: authFetchMock,
  };
});

interface DeferredResponse {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
}

function deferredResponse(): DeferredResponse {
  let resolveFn!: (response: Response) => void;
  let rejectFn!: (error: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

describe('<BacTracker />', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    authFetchMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a default 0.0 BAC value when no alcohol applies', () => {
    render(
      <BacTracker bac={{ value: 0, calculatedAt: '2026-05-19T10:00:00.000Z' }} timezone="UTC" />,
    );

    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.0');
    expect(screen.getByTestId('bac-as-of')).toHaveTextContent(/as of/i);
  });

  it('renders current estimated BAC and an as-of timestamp', () => {
    render(
      <BacTracker
        bac={{ value: 0.0234, calculatedAt: '2026-05-19T10:00:00.000Z' }}
        timezone="UTC"
      />,
    );

    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.023');
    expect(screen.getByText(/current estimated bac/i)).toBeInTheDocument();
    expect(screen.getByTestId('bac-as-of')).toHaveTextContent('2026');
  });

  // -------------------------------------------------------------------------
  // Bug E — local-timezone rendering
  // -------------------------------------------------------------------------

  it('renders the as-of stamp in the supplied IANA timezone (Asia/Ho_Chi_Minh, UTC+7)', () => {
    render(
      <BacTracker
        bac={{ value: 0.01, calculatedAt: '2026-05-19T05:00:00.000Z' }}
        timezone="Asia/Ho_Chi_Minh"
      />,
    );

    const asOfCell = screen.getByTestId('bac-as-of');
    // 05:00 UTC in Vietnam (UTC+7) is 12:00 local.
    expect(asOfCell).toHaveTextContent('2026-05-19 12:00');
    // Regression guard — the hardcoded `' UTC'` suffix must not return.
    expect(asOfCell.textContent ?? '').not.toMatch(/\bUTC\b/);
  });

  // Security Review (bugfix-tomi 2026-05-19-bac-improvements) — M2 (MEDIUM):
  // If `profile.timezone` is corrupted (manually edited DB row, future
  // migration mistake), `Intl.DateTimeFormat({ timeZone: 'invalid' })`
  // throws `RangeError` → /dashboard 500s for that user permanently.
  // formatAsOf must normalize before passing to Intl + fall back to UTC.
  it('Security M2 — does NOT throw on invalid timezone; falls back so timestamp renders', () => {
    expect(() =>
      render(
        <BacTracker
          bac={{ value: 0.01, calculatedAt: '2026-05-19T05:00:00.000Z' }}
          // Crafted/corrupted profile.timezone value — must not crash.
          timezone="NotARealZone/Bogus"
        />,
      ),
    ).not.toThrow();
    const asOfCell = screen.getByTestId('bac-as-of');
    // UTC fallback: 05:00 UTC stays 05:00.
    expect(asOfCell).toHaveTextContent('2026-05-19 05:00');
  });

  it('renders the as-of stamp in the supplied IANA timezone (America/New_York, UTC-4 in May)', () => {
    render(
      <BacTracker
        bac={{ value: 0.01, calculatedAt: '2026-05-19T05:00:00.000Z' }}
        timezone="America/New_York"
      />,
    );

    const asOfCell = screen.getByTestId('bac-as-of');
    // 05:00 UTC in NYC on May 19 (EDT = UTC-4) is 01:00 local.
    expect(asOfCell).toHaveTextContent('2026-05-19 01:00');
    expect(asOfCell.textContent ?? '').not.toMatch(/\bUTC\b/);
  });

  // -------------------------------------------------------------------------
  // Bug D — widget-only refresh + loading affordance + error path
  // -------------------------------------------------------------------------

  it('refresh button calls /api/dashboard/bac via authFetch (and never router.refresh)', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse({ value: 0.018, calculatedAt: '2026-05-19T11:00:00.000Z' }),
    );

    render(
      <BacTracker bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }} timezone="UTC" />,
    );

    const button = screen.getByRole('button', { name: /refresh bac/i });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(authFetchMock).toHaveBeenCalledWith('/api/dashboard/bac');
    // Bug D regression guard — must NOT touch the App Router.
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('updates value AND timestamp from the fetch response (still in local tz)', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse({ value: 0.045, calculatedAt: '2026-05-19T11:30:00.000Z' }),
    );

    render(
      <BacTracker
        bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }}
        timezone="Asia/Ho_Chi_Minh"
      />,
    );

    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.010');
    // Pre-refresh stamp: 10:00 UTC → 17:00 Vietnam.
    expect(screen.getByTestId('bac-as-of')).toHaveTextContent('2026-05-19 17:00');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh bac/i }));
    });

    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.045');
    // Post-refresh stamp: 11:30 UTC → 18:30 Vietnam, still local.
    expect(screen.getByTestId('bac-as-of')).toHaveTextContent('2026-05-19 18:30');
  });

  it('shows a loading affordance while the refresh fetch is pending', async () => {
    const deferred = deferredResponse();
    authFetchMock.mockReturnValueOnce(deferred.promise);

    render(
      <BacTracker bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }} timezone="UTC" />,
    );

    const section = screen.getByTestId('bac-tracker');
    const button = screen.getByRole('button', { name: /refresh bac/i });
    expect(section).toHaveAttribute('aria-busy', 'false');

    await act(async () => {
      fireEvent.click(button);
    });

    // Mid-flight: section is aria-busy. The widget should also disable the
    // button so a rapid click cannot stack a second in-flight refresh.
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    // Resolve and let the transition complete.
    await act(async () => {
      deferred.resolve(jsonResponse({ value: 0.012, calculatedAt: '2026-05-19T10:05:00.000Z' }));
      await deferred.promise;
    });

    // After-flight: aria-busy cleared, button re-enabled, value reflected.
    expect(section).toHaveAttribute('aria-busy', 'false');
    expect(button).not.toBeDisabled();
    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.012');
  });

  it('preserves the old value when the fetch errors (non-2xx response)', async () => {
    authFetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'bac_lookup_failed' }, { status: 500 }),
    );

    render(
      <BacTracker
        bac={{ value: 0.022, calculatedAt: '2026-05-19T10:00:00.000Z' }}
        timezone="UTC"
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh bac/i }));
    });

    // Value untouched, button re-enabled, aria-busy cleared.
    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.022');
    expect(screen.getByTestId('bac-tracker')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: /refresh bac/i })).not.toBeDisabled();
  });

  it('re-syncs local state when the parent supplies a fresh bac prop', () => {
    const { rerender } = render(
      <BacTracker bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }} timezone="UTC" />,
    );
    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.010');

    rerender(
      <BacTracker bac={{ value: 0.05, calculatedAt: '2026-05-19T12:00:00.000Z' }} timezone="UTC" />,
    );

    expect(screen.getByTestId('bac-value')).toHaveTextContent('0.050');
    expect(screen.getByTestId('bac-as-of')).toHaveTextContent('2026-05-19 12:00');
  });

  it('uses an icon-only accessible refresh button (44x44 minimum)', () => {
    render(
      <BacTracker bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }} timezone="UTC" />,
    );

    const button = screen.getByRole('button', { name: /refresh bac/i });
    expect(button).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    button.focus();
    expect(button).toHaveFocus();
  });
});
