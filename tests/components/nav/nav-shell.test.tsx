/**
 * <NavShell /> — client island that reads `usePathname()` and hands the
 * pathname down to Sidebar / BottomTabBar / TopAppBar / LogFAB /
 * ShortcutsOverlay.
 *
 * Task 1.2 CI-fix coverage:
 *   - Renders all three responsive wrappers (`nav-shell-sidebar`,
 *     `nav-shell-top`, `nav-shell-mobile`) unconditionally — CSS decides
 *     visibility per viewport (ui-design.md §6.6).
 *   - The active-tab indicator on `/dashboard` routes through to both
 *     Sidebar + BottomTabBar: their nav links expose `aria-current="page"`.
 *   - Falls back to `/dashboard` section-kicker when `usePathname()` returns
 *     `null` (pre-hydration / 404) — `sectionKickerFor` never emits an empty
 *     kicker.
 *   - Renders children inside the `<main>` slot.
 *
 * `next/navigation` is mocked so the client island runs in Vitest without a
 * Next request context.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const usePathnameMock = vi.fn<() => string | null>(() => '/dashboard');
const searchParamsGetMock = vi.fn<(key: string) => string | null>(() => null);
const routerPushMock = vi.fn<(href: string) => void>();
// I1 (Codex round 1, bugfix-tomi 2026-05-08-mobile-water-button) — water
// FAB success path now invokes `router.refresh()` so the dashboard's
// RSC-rendered <WaterTracker /> re-fetches `snapshot.water.consumedMl`
// after a POST. Hoisted mock so the per-test assertions can spy on
// invocation count.
const routerRefreshMock = vi.fn<() => void>();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => ({
    get: (key: string) => searchParamsGetMock(key),
  }),
  useRouter: () => ({
    push: (href: string) => routerPushMock(href),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: () => routerRefreshMock(),
  }),
}));

// Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — water FAB now POSTs
// `/api/water/log` directly via `authPost` instead of navigating to the
// dashboard. Mock the refresh-interceptor so we can assert payload shape +
// toast emission without touching the network.
//
// Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — FAB switched from
// `authPost` to `authFetch` so the 409 OVER_DAILY_LIMIT response can be
// inspected by status code (authPost throws on non-2xx). The `authPostMock`
// reference name is preserved for existing test bodies; a thin
// `authFetchMock` wraps it in a Response shape, synthesizing 409 + body
// when the legacy mock rejects with a `status: 409, body: {...}`-tagged
// error.
const authPostMock = vi.fn<(url: string, body: unknown) => Promise<unknown>>();
const authFetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
authFetchMock.mockImplementation(async (url, init) => {
  let result: unknown;
  try {
    result = await authPostMock(url, init?.body ? JSON.parse(init.body as string) : undefined);
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    const e = err as { status?: number; body?: unknown };
    const status = typeof e.status === 'number' ? e.status : 500;
    return new Response(JSON.stringify(e.body ?? { error: 'mock_error' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(result ?? {}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

vi.mock('@/lib/auth/refresh-interceptor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/refresh-interceptor')>();
  return {
    ...actual,
    authPost: (url: string, body: unknown) => authPostMock(url, body),
    authFetch: (url: string, init?: RequestInit) => authFetchMock(url, init),
  };
});

// Bug-1 — `crypto.randomUUID` is mocked deterministically in the
// per-test setup so we can assert the exact `client_id` shape.
const announcePoliteMock = vi.fn<(message: string) => void>();
vi.mock('@/lib/a11y/announce', () => ({
  announcePolite: (message: string) => announcePoliteMock(message),
}));

// C2 (Codex round 2, bugfix-tomi 2026-05-08-mobile-water-button) — the
// FAB now derives `logged_on` at TAP TIME via `userTzToday(timezone)`
// instead of consuming a stale render-time `loggedOn` prop. Mock the
// helper so per-test assertions can pin its return value AND advance the
// "current day" between render and tap to prove the value is recomputed.
const userTzTodayMock = vi.fn<(tz: string) => string>();
vi.mock('@/lib/time/day', () => ({
  userTzToday: (tz: string) => userTzTodayMock(tz),
}));

const getDeviceTimeZoneMock = vi.fn<(fallback?: string) => string>();
vi.mock('@/lib/time/device-timezone', () => ({
  getDeviceTimeZone: (fallback?: string) => getDeviceTimeZoneMock(fallback),
}));

import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { useWaterMutationStore } from '@/lib/stores/useWaterMutationStore';
import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';
import { NavShell } from '@/components/nav/nav-shell';
import { SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';

describe('<NavShell />', () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue('/dashboard');
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
    authPostMock.mockReset();
    announcePoliteMock.mockReset();
    // Default `userTzToday` to a deterministic stable value; per-test
    // setup overrides it (e.g., the C2 tap-time recomputation case
    // toggles the return value between render and tap).
    userTzTodayMock.mockReset();
    userTzTodayMock.mockReturnValue('2026-05-08');
    getDeviceTimeZoneMock.mockReset();
    getDeviceTimeZoneMock.mockImplementation((fallback = 'UTC') => fallback);
    useUndoQueueStore.setState({ stack: [] });
    useWaterMutationStore.getState().reset();
    useDashboardDateTransitionStore.getState().clearLoadingDay();
    // Deterministic client_id mint so payload-shape assertions are stable.
    let i = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        `00000000-0000-4000-8000-00000000000${i++}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useWaterMutationStore.getState().reset();
    useDashboardDateTransitionStore.getState().clearLoadingDay();
  });

  it('renders all three responsive nav wrappers', () => {
    render(
      <NavShell>
        <p data-testid="page-body">body</p>
      </NavShell>,
    );
    expect(screen.getByTestId('nav-shell-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('nav-shell-top')).toBeInTheDocument();
    expect(screen.getByTestId('nav-shell-mobile')).toBeInTheDocument();
    // Children render inside <main>.
    expect(screen.getByTestId('page-body')).toBeInTheDocument();
  });

  it('marks the dashboard tab active when on /dashboard in both sidebar + bottom tab bar', () => {
    usePathnameMock.mockReturnValue('/dashboard');
    render(<NavShell>{null}</NavShell>);
    const sidebar = screen.getByTestId('nav-shell-sidebar');
    const mobile = screen.getByTestId('nav-shell-mobile');

    expect(within(sidebar).getByTestId('nav-dashboard')).toHaveAttribute('aria-current', 'page');
    expect(within(mobile).getByTestId('nav-dashboard')).toHaveAttribute('aria-current', 'page');
    // Non-active destinations must NOT carry aria-current.
    expect(within(sidebar).getByTestId('nav-library')).not.toHaveAttribute('aria-current');
  });

  it('marks the library tab active when on a sub-route (/library/foo)', () => {
    usePathnameMock.mockReturnValue('/library/pho-bo');
    render(<NavShell>{null}</NavShell>);
    const sidebar = screen.getByTestId('nav-shell-sidebar');
    expect(within(sidebar).getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByTestId('nav-dashboard')).not.toHaveAttribute('aria-current');
  });

  it('falls back to /dashboard when usePathname() returns null (pre-hydration)', () => {
    usePathnameMock.mockReturnValue(null);
    render(<NavShell>{null}</NavShell>);
    // Fallback is /dashboard so the DASHBOARD tab is active even without
    // a real pathname. Same behaviour as a normal first paint on that route.
    const sidebar = screen.getByTestId('nav-shell-sidebar');
    expect(within(sidebar).getByTestId('nav-dashboard')).toHaveAttribute('aria-current', 'page');
  });

  describe('Bug #5 — dual FAB pair (food primary + water secondary)', () => {
    it('renders BOTH the food FAB and the water FAB at mobile viewport', () => {
      render(<NavShell>{null}</NavShell>);
      const mobile = screen.getByTestId('nav-shell-mobile');
      expect(within(mobile).getByTestId('log-fab-food')).toBeInTheDocument();
      expect(within(mobile).getByTestId('log-fab-water')).toBeInTheDocument();
    });

    it('exposes distinct accessible names for each FAB so screen readers can disambiguate', () => {
      render(<NavShell>{null}</NavShell>);
      const mobile = screen.getByTestId('nav-shell-mobile');
      expect(within(mobile).getByRole('button', { name: /log food/i })).toBeInTheDocument();
      expect(within(mobile).getByRole('button', { name: /log water/i })).toBeInTheDocument();
    });

    it('food FAB still opens the log-flow modal (unchanged behaviour)', () => {
      // Confirm the food FAB does NOT route — it opens the log-flow modal
      // via the existing useLogFlowStore.openModal() path. We assert the
      // negative (router.push not called) because the modal mount is
      // mocked in vitest jsdom and we cannot directly observe `isOpen`
      // without instrumenting the store.
      render(<NavShell>{null}</NavShell>);
      const food = screen.getByTestId('log-fab-food');
      fireEvent.click(food);
      expect(routerPushMock).not.toHaveBeenCalled();
    });

    it('disables both mobile FABs while a dashboard day transition is pending', () => {
      useDashboardDateTransitionStore.getState().setLoadingDay('2026-05-09');

      render(<NavShell>{null}</NavShell>);

      expect(screen.getByTestId('log-fab-food')).toBeDisabled();
      expect(screen.getByTestId('log-fab-water')).toBeDisabled();
    });
  });

  // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — water FAB now
  // POSTs `/api/water/log` with `{ unit:'glass', count:1 }` directly
  // (replaces the previous Path A `router.push('/dashboard')` which was
  // a same-route no-op when the user was already on the dashboard).
  describe('Bug-1 — water FAB direct POST + toast (no navigation)', () => {
    it('clicking the water FAB POSTs /api/water/log with snake_case { client_id, unit, count, logged_on }', async () => {
      authPostMock.mockResolvedValueOnce({});
      render(<NavShell timezone="UTC">{null}</NavShell>);
      const water = screen.getByTestId('log-fab-water');
      fireEvent.click(water);
      // Let the async handler run.
      await Promise.resolve();
      await Promise.resolve();
      expect(authPostMock).toHaveBeenCalledTimes(1);
      const [url, body] = authPostMock.mock.calls[0]!;
      expect(url).toBe('/api/water/log');
      expect(body).toEqual({
        client_id: '00000000-0000-4000-8000-000000000000',
        unit: 'glass',
        count: 1,
        logged_on: '2026-05-08',
      });
    });

    it('on POST success, pushes a toast with description=t.fab.waterLoggedToast, kind=delete-failed, ttlMs=2000', async () => {
      authPostMock.mockResolvedValueOnce({});
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await Promise.resolve();
      await Promise.resolve();
      const { stack } = useUndoQueueStore.getState();
      expect(stack).toHaveLength(1);
      const entry = stack[0]!;
      expect(entry.description).toBe(t.fab.waterLoggedToast);
      expect(entry.kind).toBe('delete-failed');
      expect(entry.ttlMs).toBe(2000);
      // Polite SR announcement parity with WaterTracker.
      expect(announcePoliteMock).toHaveBeenCalledWith(t.fab.waterLoggedAnnounce);
    });

    it('on POST failure, pushes an error toast with t.fab.waterLoggedFailed', async () => {
      authPostMock.mockRejectedValueOnce(new Error('5xx'));
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await Promise.resolve();
      await Promise.resolve();
      // The failure-side toast surfaces with the localized failure copy.
      const stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedFailed);
      expect(stack[0]?.kind).toBe('delete-failed');
    });

    it('rapid double-tap fires authPost exactly ONCE (ref-latch guard)', async () => {
      // Hold the first POST mid-flight so the second click hits the latch.
      let resolveFirst!: () => void;
      const first = new Promise<void>((res) => {
        resolveFirst = res;
      });
      authPostMock.mockImplementationOnce(() => first.then(() => ({})));
      render(<NavShell timezone="UTC">{null}</NavShell>);
      const water = screen.getByTestId('log-fab-water');
      fireEvent.click(water);
      fireEvent.click(water);
      // Second click is suppressed before authPost is invoked again.
      expect(authPostMock).toHaveBeenCalledTimes(1);
      // Now release and let the latch clear.
      resolveFirst();
      await Promise.resolve();
      await Promise.resolve();
    });

    it('marks water mutations in-flight while the FAB POST is pending', async () => {
      let resolveFirst!: () => void;
      const first = new Promise<void>((res) => {
        resolveFirst = res;
      });
      authPostMock.mockImplementationOnce(() => first.then(() => ({})));
      render(<NavShell timezone="UTC">{null}</NavShell>);

      fireEvent.click(screen.getByTestId('log-fab-water'));

      expect(useWaterMutationStore.getState().inFlight).toBe(1);
      resolveFirst();

      await waitFor(() => expect(useWaterMutationStore.getState().inFlight).toBe(0));
    });

    it('does NOT navigate (router.push is never invoked from the water FAB)', async () => {
      authPostMock.mockResolvedValueOnce({});
      usePathnameMock.mockReturnValue('/library');
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await Promise.resolve();
      await Promise.resolve();
      // Route is preserved — the FAB does not push or replace the URL.
      expect(routerPushMock).not.toHaveBeenCalled();
    });

    // I1 (Codex round 1) — fix for "FAB success path persists data but
    // leaves the visible dashboard tracker stale". The cheap path: after
    // the POST resolves, call `router.refresh()` so the dashboard RSC
    // (`/app/(app)/dashboard/page.tsx` is `force-dynamic`) re-fetches
    // `snapshot.water.consumedMl` via `fetchDaySnapshot()` and the
    // `<WaterTracker />` island receives the updated `initial.consumedMl`
    // on the next render. No optimistic state in the FAB path; the
    // `useOptimistic` reducer in `<WaterTracker />` is the source of
    // truth for in-component visuals.
    it('after successful POST, calls router.refresh() to invalidate dashboard cache', async () => {
      authPostMock.mockResolvedValueOnce({});
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
    });

    it('keeps the water mutation in-flight after dashboard POST success until the water card receives totalMl', async () => {
      authPostMock.mockResolvedValueOnce({ totalMl: 250 });
      render(<NavShell timezone="UTC">{null}</NavShell>);

      fireEvent.click(screen.getByTestId('log-fab-water'));

      await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
      expect(useWaterMutationStore.getState().inFlight).toBe(1);
      expect(useWaterMutationStore.getState().pendingServerTotalMl).toBe(250);

      fireEvent.click(screen.getByTestId('log-fab-water'));
      expect(authPostMock).toHaveBeenCalledTimes(1);
    });

    it('on POST failure, does NOT call router.refresh() (nothing fresh to fetch)', async () => {
      authPostMock.mockRejectedValueOnce(new Error('5xx'));
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await waitFor(() =>
        expect(useUndoQueueStore.getState().stack[0]?.description).toBe(t.fab.waterLoggedFailed),
      );
      // The error toast is the only side effect — refreshing on failure
      // would mask the error and cause an unnecessary RSC re-fetch.
      expect(routerRefreshMock).not.toHaveBeenCalled();
    });

    // C2 (Codex round 2, bugfix-tomi 2026-05-08-mobile-water-button) —
    // the bug: `loggedOn` was computed once in the server layout and
    // captured as a stale prop in the persistent client nav shell. After
    // a long-lived session crossed midnight, the first water tap durably
    // wrote to YESTERDAY's date.
    //
    // Fix: drill `timezone` instead of (or in addition to) `loggedOn`,
    // and call `userTzToday(timezone)` AT TAP TIME inside the handler.
    // This test pins that contract by toggling the `userTzToday` mock
    // return value between render and tap — proves the handler does not
    // memoize the render-time value.
    it('computes loggedOn at tap time using the current device timezone', async () => {
      authPostMock.mockResolvedValueOnce({});
      // Render-time return: yesterday-in-UTC.
      userTzTodayMock.mockReturnValue('2026-05-08');
      getDeviceTimeZoneMock.mockReturnValue('America/Los_Angeles');
      render(<NavShell timezone="Asia/Ho_Chi_Minh">{null}</NavShell>);
      // Now simulate the long-lived session crossing midnight: between
      // render and tap, the calendar date advances. The handler MUST
      // re-call `userTzToday` and pick up the new value.
      userTzTodayMock.mockReturnValue('2026-05-09');
      fireEvent.click(screen.getByTestId('log-fab-water'));
      await Promise.resolve();
      await Promise.resolve();
      expect(authPostMock).toHaveBeenCalledTimes(1);
      const [, body] = authPostMock.mock.calls[0]!;
      // Critical assertion — the POST body uses TODAY (post-midnight),
      // not the render-time YESTERDAY value. Stale-prop bug would emit
      // '2026-05-08' here.
      expect(body).toMatchObject({ logged_on: '2026-05-09' });
      expect(getDeviceTimeZoneMock).toHaveBeenCalledWith('Asia/Ho_Chi_Minh');
      expect(userTzTodayMock).toHaveBeenCalledWith('America/Los_Angeles');
    });
  });

  // Bug-1 (bugfix-tomi 2026-05-09-water-fab-ux) — toast LATENCY fix.
  // Previously the success toast was pushed AFTER `await authPost(...)`
  // resolved. On mobile networks (Vercel iad1 ↔ Supabase ap-southeast-1
  // ≈ 150–200 ms one-way + server processing) this gave the FAB a
  // 500 ms–2 s perceived dead zone, prompting users to re-tap. The
  // fire-and-forget fix: push the success toast SYNCHRONOUSLY in the
  // click handler before the await, then POST in background; on
  // failure, dismiss the success toast and push an error toast.
  describe('Bug-1 — water FAB toast fires synchronously (instant feedback)', () => {
    it('pushes the success toast SYNCHRONOUSLY in the click handler before awaiting POST', () => {
      // Never-resolving authPost — proves the toast push does NOT depend
      // on the network round trip completing. The current implementation
      // (toast push AFTER await) leaves the stack empty until the
      // promise resolves; the fix puts the toast in the stack in the
      // same synchronous tick as the click event.
      authPostMock.mockImplementationOnce(() => new Promise<unknown>(() => {}));
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      // CRITICAL — read the stack with NO awaits. fireEvent.click runs
      // the handler synchronously up to its first await. If the toast
      // push is pre-await, stack already has 1 entry; if post-await,
      // stack is still empty.
      const { stack } = useUndoQueueStore.getState();
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);
      expect(stack[0]?.kind).toBe('delete-failed');
      expect(stack[0]?.ttlMs).toBe(2000);
      // Polite SR announcement also runs synchronously (instant a11y
      // feedback parity with the visual toast).
      expect(announcePoliteMock).toHaveBeenCalledWith(t.fab.waterLoggedAnnounce);
    });

    it('on POST failure, dismisses the success toast and pushes an error toast (swap, not stack)', async () => {
      authPostMock.mockRejectedValueOnce(new Error('5xx'));
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));

      // Success toast is pushed synchronously (already proven above).
      let stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);

      // Drain the rejected microtask cycle.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // After the failure, only the error toast remains — the optimistic
      // success toast was retracted. If the success toast were left in
      // the stack, `selectLiveTop` would re-surface it once the error
      // toast TTLs out (success is older but still has time left), so
      // the user would see "logged" right after seeing "couldn't log",
      // which is the worst possible UX.
      stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedFailed);
      expect(stack[0]?.kind).toBe('delete-failed');
      expect(stack[0]?.ttlMs).toBe(2000);
    });

    it('on POST success, leaves the success toast in the queue (no spurious dismiss)', async () => {
      authPostMock.mockResolvedValueOnce({});
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));

      // Synchronous push — stack has the success toast immediately.
      let stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      const successToastId = stack[0]?.toastId;
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);

      // Let the success path run.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Stack STILL holds exactly the same success toast — no dismiss,
      // no replacement, no duplicate push.
      stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.toastId).toBe(successToastId);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);
    });

    // C2 (Codex round 1, bugfix-tomi 2026-05-09-water-fab-ux) — truthful-
    // feedback contract: when authPost rejects with SessionExpiredError
    // (refresh-interceptor's force-signout path), the optimistic success
    // toast MUST be retracted and an error toast pushed. The previous
    // implementation `return`ed without dismissing, so the user saw "250 ml
    // logged" (with a polite SR announcement) for a write that 401'd and
    // never persisted. forceSignOut() inside authFetch already initiated
    // the redirect to /login?reason=session_expired before throwing, but
    // the redirect can take 100s of ms on slow mobile networks during which
    // the false success toast remains visible — long enough to mislead the
    // user and falsify the batch's truthful-feedback premise.
    it('on SessionExpiredError, dismisses success toast and pushes error toast (truthful feedback for non-persisting writes)', async () => {
      authPostMock.mockRejectedValueOnce(new SessionExpiredError());
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));

      // Success toast is pushed synchronously (proven elsewhere). Capture
      // its toastId so we can prove the AUTHENTIC dismiss happened (not
      // just a coincidental same-clientId replacement).
      let stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);
      const successToastId = stack[0]?.toastId;

      // Drain the rejected microtask cycle so the catch branch runs.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // After the SessionExpiredError, only the error toast remains. The
      // optimistic success toast was retracted. If the success toast were
      // left in the stack, the user would still see "250 ml logged" while
      // the redirect to /login is in flight (mobile networks: 100s of ms).
      stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.toastId).not.toBe(successToastId);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedFailed);
      expect(stack[0]?.kind).toBe('delete-failed');
      expect(stack[0]?.ttlMs).toBe(2000);
    });

    it('rapid double-tap still produces one POST + one success toast (ref-latch holds)', async () => {
      // First tap is mid-flight; second tap must hit the synchronous
      // ref-latch BEFORE the toast push. Otherwise a second tap would
      // produce a second optimistic toast and a wasted ref-latch
      // assertion at the only place that matters (network).
      let resolveFirst!: (v: unknown) => void;
      const first = new Promise<unknown>((res) => {
        resolveFirst = res;
      });
      authPostMock.mockImplementationOnce(() => first);
      render(<NavShell timezone="UTC">{null}</NavShell>);
      const water = screen.getByTestId('log-fab-water');
      fireEvent.click(water);
      fireEvent.click(water);

      // Network: still exactly ONE call.
      expect(authPostMock).toHaveBeenCalledTimes(1);
      // Toast: still exactly ONE entry (the optimistic success toast).
      expect(useUndoQueueStore.getState().stack).toHaveLength(1);
      expect(useUndoQueueStore.getState().stack[0]?.description).toBe(t.fab.waterLoggedToast);

      // Release the first POST so the test cleans up.
      resolveFirst({});
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — daily water
  // cap (5000 ml) FAB surface behavior. The FAB has NO knowledge of the
  // current daily total (per proposal: pre-emptive guard skipped on FAB
  // for de-coupled chrome reasons), so cap enforcement is purely server-
  // driven via the 409 OVER_DAILY_LIMIT response. The optimistic success
  // toast must be retracted and the cap toast pushed in its place.
  describe('Bug-1 — daily water cap (5000 ml) FAB behavior (server-driven)', () => {
    it('on 409 OVER_DAILY_LIMIT, dismisses optimistic success toast and pushes cap toast', async () => {
      const overLimit = new Error('OVER_DAILY_LIMIT') as Error & {
        status?: number;
        body?: { error: string; currentTotalMl: number; limitMl: number };
      };
      overLimit.status = 409;
      overLimit.body = { error: 'OVER_DAILY_LIMIT', currentTotalMl: 5000, limitMl: 5000 };
      authPostMock.mockRejectedValueOnce(overLimit);
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));

      // Synchronous push — success toast is in the stack first.
      let stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toBe(t.fab.waterLoggedToast);

      // After the 409, only the cap toast remains. The optimistic
      // success toast was retracted.
      await waitFor(() => {
        stack = useUndoQueueStore.getState().stack;
        expect(stack[0]?.description).toMatch(/limit reached/i);
      });
      expect(stack).toHaveLength(1);
      expect(stack[0]?.kind).toBe('delete-failed');
      expect(stack[0]?.ttlMs).toBe(2000);
    });

    // I1 (Codex round 1, bugfix-tomi 2026-05-09-water-custom-button) —
    // 409 resync contract. The chip's 409 handler parses the body and
    // commits `currentTotalMl` directly to its local committed state so
    // the visible UI reconciles to the server's authoritative total
    // (covers the multi-tab race where the dashboard is visually at
    // 4750 ml but the server is already at 5000 ml). The FAB has NO
    // local water-total state — the dashboard `<WaterTracker />` owns
    // the visible count via its `initial.consumedMl` prop derived from
    // the RSC snapshot. The FAB-side analog of "commit currentTotalMl
    // locally" is therefore `router.refresh()`, which causes the
    // dashboard RSC to re-fetch `snapshot.water.consumedMl` and feed the
    // fresh value into the WaterTracker. Without this refresh, a user
    // who taps the FAB at-cap sees the cap toast but the dashboard
    // bullets/ml total stays stuck at the pre-cap value.
    it('on 409 OVER_DAILY_LIMIT, parses the body and calls router.refresh() so the dashboard reconciles to the server total (mirrors chip 409 contract)', async () => {
      const overLimit = new Error('OVER_DAILY_LIMIT') as Error & {
        status?: number;
        body?: { error: string; currentTotalMl: number; limitMl: number };
      };
      overLimit.status = 409;
      overLimit.body = { error: 'OVER_DAILY_LIMIT', currentTotalMl: 5000, limitMl: 5000 };
      authPostMock.mockRejectedValueOnce(overLimit);
      render(<NavShell timezone="UTC">{null}</NavShell>);
      fireEvent.click(screen.getByTestId('log-fab-water'));
      // Dashboard re-fetches `snapshot.water.consumedMl` so a stale
      // visible total reconciles to the server's `currentTotalMl`.
      await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
    });

    it('rapid double-tap at cap (both 409): only ONE cap toast remains (dedupe within 1.5 s)', async () => {
      const overLimit = (): Error & { status?: number; body?: unknown } => {
        const err = new Error('OVER_DAILY_LIMIT') as Error & {
          status?: number;
          body?: { error: string; currentTotalMl: number; limitMl: number };
        };
        err.status = 409;
        err.body = { error: 'OVER_DAILY_LIMIT', currentTotalMl: 5000, limitMl: 5000 };
        return err;
      };
      // Make BOTH POSTs reject — but the ref-latch should suppress the
      // second one anyway. We line up two rejections defensively in case
      // implementation changes.
      authPostMock.mockRejectedValueOnce(overLimit());
      authPostMock.mockRejectedValueOnce(overLimit());
      render(<NavShell timezone="UTC">{null}</NavShell>);
      const water = screen.getByTestId('log-fab-water');
      fireEvent.click(water);
      fireEvent.click(water);
      // Exactly one cap toast — dedupe holds (or ref-latch suppressed
      // the second tap entirely; either is acceptable).
      await waitFor(() => {
        const stack = useUndoQueueStore.getState().stack;
        const capEntries = stack.filter((e) => /limit reached/i.test(e.description));
        expect(capEntries).toHaveLength(1);
      });
    });
  });

  it('renders a kicker for each primary destination + /log + brand fallback', () => {
    const cases: Array<[string, RegExp]> = [
      ['/dashboard', /dashboard/i],
      ['/library', /library/i],
      ['/progress', /progress/i],
      ['/settings', /settings/i],
      ['/log', /log/i],
      ['/something-else', /kalori/i],
    ];
    for (const [path, expected] of cases) {
      usePathnameMock.mockReturnValue(path);
      const { unmount } = render(<NavShell>{null}</NavShell>);
      const top = screen.getByTestId('nav-shell-top');
      expect(top.textContent ?? '').toMatch(expected);
      unmount();
    }
  });
});
