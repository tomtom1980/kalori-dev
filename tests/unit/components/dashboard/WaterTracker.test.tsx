/**
 * Task 3.5 Milestone 5.2 — WaterTracker + WaterQuickAdd tests.
 *
 * Bug-2 (bugfix-tomi 2026-05-09-water-fab-ux) — added prop-sync regression
 * tests that pin the `useEffect`-based sync between `initial.consumedMl`
 * and the local committed state, so a `router.refresh()` re-render with
 * fresh server data is no longer shadowed by a mount-time `useState` value.
 *
 * F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — followup closure: chip now
 * receives `timezone: string` and computes `userTzToday(timezone)` AT TAP
 * TIME, mirroring the C2 nav-shell pattern. Tests pin tap-time recompute.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WaterTracker } from '@/components/dashboard/WaterTracker';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { useWaterMutationStore } from '@/lib/stores/useWaterMutationStore';

// Mock the refresh-interceptor so the tests don't hit the network.
//
// Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — the chip switched
// from `authPost` to `authFetch` so the 409 OVER_DAILY_LIMIT response
// body can be read (authPost throws a generic Error on non-2xx; it
// cannot expose the status code without modifying the R1-firewalled
// refresh-interceptor module). Tests mock `authFetch` and the existing
// `authPost`-named test variable is rewired to delegate so existing test
// bodies stay untouched.
const authFetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
// Legacy test alias — matches the `authPost.mock*` references throughout
// the suite. Each call wraps the legacy `authPost`-shaped mock return
// value (a JSON object on success, a thrown Error on failure) into the
// `authFetch`-shaped Response surface the chip now expects. On rejection,
// the wrapper inspects the rejected error for `status` + `body` (set by
// 409-emulating tests) and synthesizes the matching Response so the chip
// sees a real status code rather than a thrown generic Error.
const authPost = vi.fn();
authFetchMock.mockImplementation(async (url, init) => {
  let result: unknown;
  try {
    result = await authPost(url, init?.body ? JSON.parse(init.body as string) : undefined, init);
  } catch (err) {
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
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (url: string, init?: RequestInit) => authFetchMock(url, init),
  authPost: (url: string, body: unknown, init?: RequestInit) => authPost(url, body, init),
  SessionExpiredError: class SE extends Error {},
}));

// Mock `userTzToday` so the chip's tap-time recompute is observable.
// Mirrors the C2 nav-shell test pattern (see
// `tests/components/nav/nav-shell.test.tsx:70-72`).
const userTzTodayMock = vi.fn<(tz: string) => string>();
vi.mock('@/lib/time/day', () => ({
  userTzToday: (tz: string) => userTzTodayMock(tz),
}));

const getDeviceTimeZoneMock = vi.fn<(fallback?: string) => string>();
vi.mock('@/lib/time/device-timezone', () => ({
  getDeviceTimeZone: (fallback?: string) => getDeviceTimeZoneMock(fallback),
}));

// Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — `useIsMobile` mock
// so the EDIT surface tests can toggle the desktop popover vs mobile sheet
// branch deterministically. Default = desktop (false) so existing tests
// see the familiar render tree.
const isMobileMock = vi.fn<() => boolean>(() => false);
vi.mock('@/lib/hooks/use-is-mobile', () => ({
  useIsMobile: () => isMobileMock(),
  MOBILE_QUERY: '(max-width: 1279px)',
}));

// Bug-2 — `useReducedMotion` mock so the popover/sheet reduced-motion
// branch can be toggled. Default = motion enabled (false). The mock
// also exports the `m`/`motion`/`AnimatePresence` re-exports the
// `MobileWheelSheet` primitive imports — we keep them as the real
// framer-motion ones so the sheet can still render.
const reducedMotionMock = vi.fn<() => boolean | null>(() => false);
vi.mock('@/lib/motion/defaults', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/motion/defaults')>('@/lib/motion/defaults');
  return {
    ...actual,
    useReducedMotion: () => reducedMotionMock(),
  };
});

describe('<WaterTracker />', () => {
  beforeEach(() => {
    authPost.mockReset();
    // R3-C2-prime (Option B) — `/api/water/log` now returns
    // `totalMl: number` in its 200 response. The chip uses this value to
    // set its committed baseline directly; the previous resetKey-guarded
    // local-increment path is reserved as a fallback when `totalMl` is
    // missing/null. Default mock supplies a sentinel `totalMl: 0` so
    // tests that don't care about the value still get the
    // server-authoritative semantics.
    authPost.mockResolvedValue({ row: { id: 'w-1' }, totalMl: 0 });
    // Default `userTzToday` to a deterministic stable value; per-test
    // overrides may toggle it to simulate midnight crossing.
    userTzTodayMock.mockReset();
    userTzTodayMock.mockReturnValue('2026-04-22');
    getDeviceTimeZoneMock.mockReset();
    getDeviceTimeZoneMock.mockImplementation((fallback = 'UTC') => fallback);
    useUndoQueueStore.setState({ stack: [] });
    useWaterMutationStore.getState().reset();
  });
  afterEach(() => {
    useUndoQueueStore.setState({ stack: [] });
    useWaterMutationStore.getState().reset();
  });

  it('renders + GLASS, + BOTTLE, EDIT buttons each with aria-label', () => {
    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );
    expect(
      screen.getByRole('button', { name: /Add 250 millilitres of water/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add 500 millilitres of water/i }),
    ).toBeInTheDocument();
    // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — third chip
    // re-purposed from CORRECT stub to EDIT (set-total via wheel/popover).
    expect(screen.getByRole('button', { name: /Edit total water amount/i })).toBeInTheDocument();
  });

  it('clicking + GLASS optimistically increments consumedMl before server response', async () => {
    // Arrange a server POST that takes time so we can see the optimistic state.
    let resolvePost: (v: unknown) => void = () => undefined;
    const postPromise = new Promise((r) => {
      resolvePost = r;
    });
    authPost.mockImplementation(() => postPromise);

    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));

    // Optimistic: the header ml count displays 250 before the post resolves.
    expect(screen.getByTestId('water-consumed-ml').textContent).toContain('250');

    // Let the post resolve.
    resolvePost({ row: { id: 'w-1' } });
  });

  it('fires authPost with { client_id, unit: "glass", count: 1, logged_on }', async () => {
    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add 500 millilitres of water/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(authPost).toHaveBeenCalledTimes(1);
    const [url, body] = authPost.mock.calls[0] ?? [];
    expect(url).toBe('/api/water/log');
    expect(body).toMatchObject({
      unit: 'bottle',
      count: 1,
      logged_on: '2026-04-22',
    });
    expect(typeof (body as { client_id: string }).client_id).toBe('string');
  });

  it('locks the water card and shows a spinner while a water POST is pending', async () => {
    let resolvePost!: (value: unknown) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    authPost.mockImplementationOnce(() => postPromise);
    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));

    expect(screen.getByTestId('water-tracker')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('water-tracker-loading')).toBeInTheDocument();
    expect(screen.getByTestId('water-glass')).toBeDisabled();
    expect(screen.getByTestId('water-bottle')).toBeDisabled();
    expect(screen.getByTestId('water-edit-button')).toBeDisabled();

    resolvePost({ row: { id: 'w-spinner-1' }, totalMl: 250 });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('water-tracker')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('water-tracker-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('water-glass')).toBeEnabled();
  });

  it('on server error pushes a delete-failed undo toast', async () => {
    authPost.mockRejectedValueOnce(new Error('db_error'));
    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
    // Allow the catch + push to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const failed = useUndoQueueStore.getState().stack.find((e) => e.kind === 'delete-failed');
    expect(failed).toBeDefined();
  });

  it('rolls back the optimistic ml count when the server POST fails', async () => {
    // React 19 `useOptimistic` only keeps optimistic state WHILE the enclosing
    // transition is pending — once the promise settles the transition closes
    // and React reverts to base. So we have to hold the POST pending, observe
    // the optimistic 250 value, then reject and observe rollback to 0.
    let rejectPost: (err: Error) => void = () => undefined;
    const postPromise = new Promise((_, reject) => {
      rejectPost = reject;
    });
    authPost.mockImplementationOnce(() => postPromise);

    render(
      <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));

    // Transition still pending → optimistic value visible.
    expect(screen.getByTestId('water-consumed-ml').textContent).toContain('250');

    // Reject and let the transition close.
    await act(async () => {
      rejectPost(new Error('db_error'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Transition closed → rollback to committed base (0).
    expect(screen.getByTestId('water-consumed-ml').textContent).toContain('0');
  });

  // Bug-2 (bugfix-tomi 2026-05-09-water-fab-ux) — the chip seeded
  // `useState(initial.consumedMl)`, which runs ONCE at mount. After a
  // successful FAB POST → `router.refresh()` → dashboard RSC re-renders
  // with FRESH `snapshot.water.consumedMl`, the chip's local state
  // shadowed the new prop and the readout stayed stale until next nav.
  // Fix: a `useEffect` syncs `committedConsumedMl` whenever
  // `initial.consumedMl` changes. These tests pin the contract.
  describe('prop-sync after RSC re-render (Bug-2 regression guard)', () => {
    it('updates committed consumedMl when initial prop changes (e.g., after router.refresh from FAB)', () => {
      const { rerender } = render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      // Baseline: render-time prop value is displayed.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('500');
      // Simulate `router.refresh()` re-rendering this same component
      // instance with a fresh server-side total.
      rerender(
        <WaterTracker initial={{ consumedMl: 750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      // Without the `useEffect` sync, this stays at 500 (`useState`
      // initializer runs once at mount). With the sync it tracks 750.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');
    });

    it('keeps the dashboard spinner until the refreshed server total is rendered', async () => {
      useWaterMutationStore.getState().begin();
      useWaterMutationStore.getState().waitForServerTotal(750);
      const { rerender } = render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );

      expect(screen.getByTestId('water-tracker')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('water-tracker-loading')).toBeInTheDocument();

      rerender(
        <WaterTracker initial={{ consumedMl: 750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');
      await act(async () => {
        await Promise.resolve();
      });

      expect(useWaterMutationStore.getState().inFlight).toBe(0);
      expect(screen.getByTestId('water-tracker')).toHaveAttribute('aria-busy', 'false');
      expect(screen.queryByTestId('water-tracker-loading')).not.toBeInTheDocument();
    });

    it('preserves optimistic increments across initial-prop updates (resetKey discards in-flight optimistic delta)', async () => {
      // Hold the chip's POST pending so the optimistic state stays
      // visible while we re-render with a fresh server total.
      let resolvePost: (v: unknown) => void = () => undefined;
      const postPromise = new Promise((r) => {
        resolvePost = r;
      });
      authPost.mockImplementationOnce(() => postPromise);

      const { rerender } = render(
        <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      // Optimistic delta visible against the 0-baseline.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('250');

      // Re-render with fresh server data (server has caught up to 500).
      // `useEffect` sync resets `committedConsumedMl` to 500 AND bumps
      // the resetKey so React drops the in-flight optimistic delta.
      // Without the resetKey bump the readout would briefly show
      // `500 + 250 = 750` (double-counting).
      rerender(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );

      // The readout MUST show 500 (server baseline) — not 750
      // (server baseline + optimistic delta).
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('500');

      // Cleanup pending promise.
      resolvePost({ row: { id: 'w-1' } });
      await act(async () => {
        await Promise.resolve();
      });
    });

    // R3-C2-prime (bugfix-tomi 2026-05-09-water-fab-ux Codex round 3, Option B) —
    // server-authoritative totalMl. `/api/water/log` now returns
    // `{ row, totalMl: <SUM-of-day> }` and the chip sets its committed
    // baseline DIRECTLY from the response total. This eliminates the
    // resetKey-discriminator coupling that previously dropped successful
    // chip writes when an unrelated baseline refresh fired mid-flight.
    //
    // Round-1 C1 (double-count when baseline absorbs the same write) and
    // round-3 C2-prime (undercount when baseline shift is unrelated) are
    // BOTH closed by always setting state to the server-supplied total —
    // there is no client-side prediction to mis-align.
    it('R3-C2-prime: success-path uses server totalMl directly (no double-count, no undercount)', async () => {
      // Hold the chip's POST pending so we can interleave a baseline
      // refresh BEFORE the success-path commit fires. The server
      // ultimately responds with `totalMl: 750` — its authoritative view
      // of the day after this insert lands.
      let resolvePost: (v: unknown) => void = () => undefined;
      const postPromise = new Promise((r) => {
        resolvePost = r;
      });
      authPost.mockImplementationOnce(() => postPromise);

      const { rerender } = render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );

      const user = userEvent.setup();
      // Step 1: chip fires +250 → optimistic shows 750, POST in flight.
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');

      // Step 2: simulate router.refresh re-rendering this island with a
      // fresh server total that ALREADY absorbed the +250. Baseline
      // updates to 750.
      rerender(
        <WaterTracker initial={{ consumedMl: 750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');

      // Step 3: resolve the original in-flight POST with server-authoritative
      // total = 750 (server's own view after the row landed). Chip sets
      // committedConsumedMl = 750 DIRECTLY (no `c + ml` add). Readout
      // stays at 750. WITHOUT Option B, a `c + ml` add against the new
      // 750 baseline would yield 1000 (double-count); WITHOUT the
      // (now-removed) C1 resetKey guard, that's exactly what would
      // happen.
      await act(async () => {
        resolvePost({ row: { id: 'w-1' }, totalMl: 750 });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');
      expect(screen.getByTestId('water-consumed-ml').textContent).not.toContain('1000');
    });

    // R3-C2-prime — orthogonal baseline shift (the new scenario Codex round-3
    // surfaced). The C1 resetKey-guard in earlier rounds DROPPED successful
    // writes when an unrelated baseline refresh bumped resetKey before the
    // POST resolved (server persisted the row but chip undercounted →
    // user re-tapped → duplicate logging). Option B fixes this because
    // the response carries the authoritative server total — INCLUDING this
    // write — so the chip's committed baseline reflects reality regardless
    // of intervening resetKey bumps.
    it('R3-C2-prime: when baseline shift is UNRELATED to the in-flight write, success still commits (no undercount)', async () => {
      // Hold the chip's POST pending. Server's authoritative total at
      // resolution time is 1000 (the +250 chip write + a 750 baseline
      // already on the day, regardless of intervening shifts).
      let resolvePost: (v: unknown) => void = () => undefined;
      const postPromise = new Promise((r) => {
        resolvePost = r;
      });
      authPost.mockImplementationOnce(() => postPromise);

      const { rerender } = render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );

      const user = userEvent.setup();
      // Step 1: chip fires +250 → optimistic 750.
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');

      // Step 2: UNRELATED baseline refresh — e.g., another tab logged
      // 250ml AFTER our in-flight tap was issued but BEFORE our POST
      // landed. Baseline arrives reflecting the OTHER tab's write only
      // (+250 from elsewhere = 750), but does NOT include our pending
      // +250. resetKey bumps in the prop-sync block.
      rerender(
        <WaterTracker initial={{ consumedMl: 750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');

      // Step 3: our original POST resolves. Server's authoritative day
      // total is now 1000 (the other tab's 250 + our 250 + original 500).
      // PRE-FIX (C1 guard): resetKey mismatch → success-path commit
      // SKIPPED → chip stays at 750 → user thinks their tap failed → re-taps.
      // POST-FIX (Option B): chip sets committedConsumedMl = 1000 from
      // the server-supplied totalMl. No undercount, no duplicate logging
      // pressure.
      await act(async () => {
        resolvePost({ row: { id: 'w-1' }, totalMl: 1000 });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('1000');
    });

    // R3-C2-prime fallback path — when the server's aggregation read
    // fails, the route returns `totalMl: null` (or omits it). The chip
    // MUST fall back to its prior local-prediction logic so a transient
    // server-side glitch does not freeze the UI. The fallback path is
    // the only place where the resetKey-guarded local increment still
    // runs.
    it('R3-C2-prime fallback: when server omits totalMl, chip uses local prediction', async () => {
      authPost.mockResolvedValueOnce({ row: { id: 'w-1' } /* totalMl absent */ });
      render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      // Drain the success-path microtask cycle.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // Local prediction = base (500) + ml (250) = 750.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');
    });

    it('R3-C2-prime fallback: explicit totalMl: null is treated as missing (uses local prediction)', async () => {
      authPost.mockResolvedValueOnce({ row: { id: 'w-1' }, totalMl: null });
      render(
        <WaterTracker initial={{ consumedMl: 500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('750');
    });
  });

  // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — daily water
  // cap (5000 ml) chip surface behavior. Pre-emptive client guard +
  // graceful 409 OVER_DAILY_LIMIT handling + 1.5 s toast dedupe.
  describe('Bug-1 — daily water cap (5000 ml) chip behavior', () => {
    it('GLASS chip at consumed=4750 issues POST that succeeds (boundary OK — 5000 is allowed)', async () => {
      authPost.mockResolvedValueOnce({ row: { id: 'w-1' }, totalMl: 5000 });
      render(
        <WaterTracker initial={{ consumedMl: 4750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // POST fired — boundary write allowed.
      expect(authPost).toHaveBeenCalledTimes(1);
      // Server-authoritative total propagated to chip.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('5000');
    });

    it('GLASS chip at consumed=5000 does NOT issue POST and shows cap-reached toast (pre-emptive guard)', async () => {
      render(
        <WaterTracker initial={{ consumedMl: 5000, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // No network call — pre-emptive guard short-circuited.
      expect(authPost).not.toHaveBeenCalled();
      // Cap toast surfaced via the canonical undo queue store.
      const stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.kind).toBe('delete-failed');
      expect(stack[0]?.description).toMatch(/limit reached/i);
    });

    it('BOTTLE chip at consumed=4600 does NOT issue POST and shows cap toast (4600+500=5100 > 5000)', async () => {
      render(
        <WaterTracker initial={{ consumedMl: 4600, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 500 millilitres of water/i }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(authPost).not.toHaveBeenCalled();
      const stack = useUndoQueueStore.getState().stack;
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toMatch(/limit reached/i);
    });

    it('toast dedupe: rapid double-tap at cap shows ONLY ONE cap toast within 1.5 s window', async () => {
      render(
        <WaterTracker initial={{ consumedMl: 5000, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      const glassBtn = screen.getByRole('button', { name: /Add 250 millilitres of water/i });
      await user.click(glassBtn);
      await user.click(glassBtn);
      await user.click(glassBtn);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const stack = useUndoQueueStore.getState().stack;
      // Three rapid taps → exactly ONE cap toast (dedupe holds).
      expect(stack).toHaveLength(1);
      expect(stack[0]?.description).toMatch(/limit reached/i);
      expect(authPost).not.toHaveBeenCalled();
    });

    it('on server 409 OVER_DAILY_LIMIT, chip retracts optimistic delta + commits server total + shows cap toast', async () => {
      // Simulate server returning 409 (e.g. multi-tab race that bypassed
      // the chip's pre-emptive guard).
      const overLimit = new Error('OVER_DAILY_LIMIT') as Error & {
        status?: number;
        body?: { error: string; currentTotalMl: number; limitMl: number };
      };
      overLimit.status = 409;
      overLimit.body = { error: 'OVER_DAILY_LIMIT', currentTotalMl: 5000, limitMl: 5000 };
      authPost.mockRejectedValueOnce(overLimit);
      render(
        <WaterTracker initial={{ consumedMl: 4750, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      // Drain the rejected microtask cycle.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      // Chip falls back to server-truth = currentTotalMl from the 409 body.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('5000');
      // Cap toast (NOT the generic error toast).
      const capEntry = useUndoQueueStore
        .getState()
        .stack.find((e) => /limit reached/i.test(e.description));
      expect(capEntry).toBeDefined();
      // No generic error toast pushed.
      const errorEntry = useUndoQueueStore
        .getState()
        .stack.find((e) => /try again/i.test(e.description));
      expect(errorEntry).toBeUndefined();
    });
  });

  // F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — the chip used to receive
  // a precomputed `loggedOn` prop captured at server render time. A
  // long-lived dashboard tab that crosses local midnight then logs
  // water via the chip would write to YESTERDAY's date. Fix mirrors
  // the C2 nav-shell pattern: receive `timezone` and call
  // `userTzToday(timezone)` AT TAP TIME inside the handler.
  describe('logged_on derivation at tap time (F-WATER-CHIP-STALE-LOGGEDON-2026-05-09)', () => {
    it('computes loggedOn at tap time using the current device timezone', async () => {
      // Render-time return: yesterday-in-user-TZ.
      userTzTodayMock.mockReturnValue('2026-05-08');
      getDeviceTimeZoneMock.mockReturnValue('America/Los_Angeles');
      render(
        <WaterTracker
          initial={{ consumedMl: 0, targetMl: 2000, entries: [] }}
          timezone="Asia/Ho_Chi_Minh"
        />,
      );
      // Simulate the long-lived session crossing local midnight: between
      // render and tap, the calendar date advances. The handler MUST
      // re-call `userTzToday` and pick up the new value.
      userTzTodayMock.mockReturnValue('2026-05-09');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Add 250 millilitres of water/i }));
      await act(async () => {
        await Promise.resolve();
      });

      expect(authPost).toHaveBeenCalledTimes(1);
      const [, body] = authPost.mock.calls[0] ?? [];
      // The POST body uses TODAY (post-midnight), not the render-time
      // YESTERDAY value. Stale-prop bug would emit '2026-05-08' here.
      expect(body).toMatchObject({ logged_on: '2026-05-09' });
      expect(getDeviceTimeZoneMock).toHaveBeenCalledWith('Asia/Ho_Chi_Minh');
      expect(userTzTodayMock).toHaveBeenCalledWith('America/Los_Angeles');
    });
  });

  // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — EDIT surface.
  // The third chip is now an editor: desktop = Radix popover with a
  // numeric input; mobile = `MobileWheelSheet` + `MobileWheelPicker`.
  // SET semantics with Phase-2 Option A constraint (only INCREASING
  // the daily total is allowed in this batch). Range is
  // [round-up-to-50(currentTotalMl), 5000] step 50.
  describe('Bug-2 — EDIT surface (desktop popover + mobile wheel)', () => {
    beforeEach(() => {
      isMobileMock.mockReset();
      isMobileMock.mockReturnValue(false);
      reducedMotionMock.mockReset();
      reducedMotionMock.mockReturnValue(false);
    });

    it('desktop: clicking EDIT opens popover with input prefilled at currentTotalMl rounded UP to next 50ml', async () => {
      isMobileMock.mockReturnValue(false);
      render(
        <WaterTracker initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      // 4775 rounds to the nearest 50ml display step.
      expect(input.value).toBe('4800');
      expect(input.min).toBe('0');
      expect(input.max).toBe('5000');
      expect(input.step).toBe('50');
    });

    it('desktop: Save submits POST { unit:"ml", count: delta } where delta = entered − currentTotalMl', async () => {
      isMobileMock.mockReturnValue(false);
      authPost.mockResolvedValueOnce({ row: { id: 'w-edit-1' }, totalMl: 3000 });
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      // Triple-click to select then type new value.
      await user.tripleClick(input);
      await user.keyboard('3000');
      await user.click(screen.getByTestId('water-edit-save'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(authPost).toHaveBeenCalledTimes(1);
      const [url, body] = authPost.mock.calls[0] ?? [];
      expect(url).toBe('/api/water/log');
      expect(body).toMatchObject({ unit: 'ml', count: 1500, logged_on: '2026-04-22' });
      // After resolving with totalMl=3000 the readout should match.
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('3000');
    });

    it('desktop: Save at the cap (5000) succeeds with delta = 5000 − currentTotalMl', async () => {
      isMobileMock.mockReturnValue(false);
      authPost.mockResolvedValueOnce({ row: { id: 'w-edit-2' }, totalMl: 5000 });
      render(
        <WaterTracker initial={{ consumedMl: 4500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      await user.tripleClick(input);
      await user.keyboard('5000');
      await user.click(screen.getByTestId('water-edit-save'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      const [, body] = authPost.mock.calls[0] ?? [];
      expect(body).toMatchObject({ unit: 'ml', count: 500 });
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('5000');
    });

    it('desktop: Save can lower the total with a negative ml delta', async () => {
      isMobileMock.mockReturnValue(false);
      authPost.mockResolvedValueOnce({ row: { id: 'w-edit-lower-1' }, totalMl: 500 });
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      await user.tripleClick(input);
      await user.keyboard('500');
      await user.click(screen.getByTestId('water-edit-save'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(authPost).toHaveBeenCalledTimes(1);
      const [, lowerBody] = authPost.mock.calls[0] ?? [];
      expect(lowerBody).toMatchObject({ unit: 'ml', count: -1000 });
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('500');
    });

    it('desktop: when committedConsumedMl == 5000 the EDIT button remains enabled', async () => {
      isMobileMock.mockReturnValue(false);
      render(
        <WaterTracker initial={{ consumedMl: 5000, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const editBtn = screen.getByTestId('water-edit-button') as HTMLButtonElement;
      expect(editBtn.disabled).toBe(false);
      // Aria-label switches to the at-cap message for SR users.
      expect(editBtn.getAttribute('aria-label')).toMatch(/edit total water amount/i);
      // Clicking the button opens the popover even at the cap.
      const user = userEvent.setup();
      await user.click(editBtn);
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      expect(input.value).toBe('5000');
      expect(input.min).toBe('0');
    });

    it('desktop: Cancel closes popover and does NOT issue POST', async () => {
      isMobileMock.mockReturnValue(false);
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      await screen.findByTestId('water-edit-input');
      await user.click(screen.getByTestId('water-edit-cancel'));
      // Popover closed.
      expect(screen.queryByTestId('water-edit-input')).not.toBeInTheDocument();
      // No network call.
      expect(authPost).not.toHaveBeenCalled();
    });

    it('desktop: server 409 OVER_DAILY_LIMIT path syncs total + shows cap toast (reuses chip i18n keys)', async () => {
      isMobileMock.mockReturnValue(false);
      const overLimit = new Error('OVER_DAILY_LIMIT') as Error & {
        status?: number;
        body?: { error: string; currentTotalMl: number; limitMl: number };
      };
      overLimit.status = 409;
      overLimit.body = { error: 'OVER_DAILY_LIMIT', currentTotalMl: 5000, limitMl: 5000 };
      authPost.mockRejectedValueOnce(overLimit);
      render(
        <WaterTracker initial={{ consumedMl: 4500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
      await user.tripleClick(input);
      await user.keyboard('5000');
      await user.click(screen.getByTestId('water-edit-save'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      // Cap toast surfaced — reuses chip's `capReachedToast` i18n key.
      const stack = useUndoQueueStore.getState().stack;
      const capEntry = stack.find((e) => /limit reached/i.test(e.description));
      expect(capEntry).toBeDefined();
      // Server-truth committed: 5000 (the route's currentTotalMl).
      expect(screen.getByTestId('water-consumed-ml').textContent).toContain('5000');
    });

    it('mobile: clicking EDIT opens MobileWheelSheet with wheel options [0..5000] step 50', async () => {
      isMobileMock.mockReturnValue(true);
      render(
        <WaterTracker initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      // Sheet renders into a portal — query the entire document.
      const sheet = await screen.findByTestId('water-edit-wheel-sheet');
      expect(sheet).toBeInTheDocument();
      // Wheel listbox renders with the rounded-up active option (4800).
      const wheel = await screen.findByTestId('water-edit-wheel');
      expect(wheel).toBeInTheDocument();
      // Active option is the first reachable step >= currentTotalMl.
      const activeRow = wheel.querySelector('[aria-selected="true"]');
      expect(activeRow?.textContent).toContain('4800');
    });

    it('mobile: Save commits the wheel value via POST { unit:"ml", count: delta }', async () => {
      isMobileMock.mockReturnValue(true);
      authPost.mockResolvedValueOnce({ row: { id: 'w-edit-3' }, totalMl: 2000 });
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      // Find the Save button in the sheet footer (uses doneLabel="Save").
      const saveBtn = await screen.findByRole('button', { name: /^Save$/i });
      // Default draft = 1500 (rounded-up of 1500). Save commits delta=0 → no-op
      // (close without POST). Skip wheel keyboard for jsdom and instead
      // exercise the path where the user explicitly raised the value:
      // we fire a synthetic onChange via clicking a non-active row.
      const wheel = screen.getByTestId('water-edit-wheel');
      // Find the row labelled "2000 ml" and click it.
      const row2000 = Array.from(wheel.querySelectorAll('[role="option"]')).find(
        (el) => el.textContent?.trim() === '2000 ml',
      );
      expect(row2000).toBeDefined();
      await user.click(row2000 as Element);
      await user.click(saveBtn);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(authPost).toHaveBeenCalledTimes(1);
      const [, body] = authPost.mock.calls[0] ?? [];
      expect(body).toMatchObject({ unit: 'ml', count: 500 });
    });

    it('mobile: Save can lower the total to 0', async () => {
      isMobileMock.mockReturnValue(true);
      authPost.mockResolvedValueOnce({ row: { id: 'w-edit-lower-2' }, totalMl: 0 });
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const saveBtn = await screen.findByRole('button', { name: /^Save$/i });
      const wheel = screen.getByTestId('water-edit-wheel');
      const row0 = Array.from(wheel.querySelectorAll('[role="option"]')).find(
        (el) => el.textContent?.trim() === '0 ml',
      );
      expect(row0).toBeDefined();
      await user.click(row0 as Element);
      await user.click(saveBtn);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(authPost).toHaveBeenCalledTimes(1);
      const [, body] = authPost.mock.calls[0] ?? [];
      expect(body).toMatchObject({ unit: 'ml', count: -1500 });
    });

    it('mobile: Cancel closes sheet without POST', async () => {
      isMobileMock.mockReturnValue(true);
      render(
        <WaterTracker initial={{ consumedMl: 1500, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const cancelBtn = await screen.findByRole('button', { name: /^Cancel$/i });
      await user.click(cancelBtn);
      expect(screen.queryByTestId('water-edit-wheel-sheet')).not.toBeInTheDocument();
      expect(authPost).not.toHaveBeenCalled();
    });

    it('reduced-motion: mobile wheel listbox carries data-reduced-motion when reducedMotion is true', async () => {
      isMobileMock.mockReturnValue(true);
      reducedMotionMock.mockReturnValue(true);
      render(
        <WaterTracker initial={{ consumedMl: 0, targetMl: 2000, entries: [] }} timezone="UTC" />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('water-edit-button'));
      const wheel = await screen.findByTestId('water-edit-wheel');
      const listbox = wheel.querySelector('[role="listbox"]');
      expect(listbox?.getAttribute('data-reduced-motion')).toBe('true');
    });

    // Codex round 1 I2 — silent off-step write. The EDIT default at off-step
    // totals (e.g. current=4775) auto-rounds to 4800 and Save WITHOUT
    // interaction silently posts a +25ml delta. The fix disables Save until
    // the user has interacted with the wheel/input so a stray click can't
    // write the rounded prefill on its own.
    describe('Codex round 1 I2 — Save disabled until user interaction', () => {
      it('desktop: opening EDIT at off-step total (4775) disables Save until input is changed (no silent +25 delta)', async () => {
        isMobileMock.mockReturnValue(false);
        render(
          <WaterTracker
            initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }}
            timezone="UTC"
          />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByTestId('water-edit-button'));
        const saveBtn = (await screen.findByTestId('water-edit-save')) as HTMLButtonElement;
        // Pre-interaction: Save MUST be disabled even though the prefill
        // (4800) is a valid commit target. Without the guard, clicking
        // Save here silently writes a +25ml delta the user never typed.
        expect(saveBtn.disabled).toBe(true);
        expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
        await user.click(saveBtn);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        // No POST issued.
        expect(authPost).not.toHaveBeenCalled();
      });

      it('desktop: changing the input value enables Save and a subsequent click POSTs the correct delta', async () => {
        isMobileMock.mockReturnValue(false);
        authPost.mockResolvedValueOnce({ row: { id: 'w-edit-i2-1' }, totalMl: 4800 });
        render(
          <WaterTracker
            initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }}
            timezone="UTC"
          />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByTestId('water-edit-button'));
        const input = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
        const saveBtn = (await screen.findByTestId('water-edit-save')) as HTMLButtonElement;
        // Move to 5000 then back to 4800 — any input edit counts as
        // interaction (even returning to the prefill).
        await user.tripleClick(input);
        await user.keyboard('5000');
        await user.tripleClick(input);
        await user.keyboard('4800');
        // Now Save is enabled.
        expect(saveBtn.disabled).toBe(false);
        expect(saveBtn.getAttribute('aria-disabled')).toBe('false');
        await user.click(saveBtn);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(authPost).toHaveBeenCalledTimes(1);
        const [, body] = authPost.mock.calls[0] ?? [];
        // delta = 4800 (entered) − 4775 (current) = 25.
        expect(body).toMatchObject({ unit: 'ml', count: 25 });
      });

      it('desktop: opening EDIT at on-step total (4800) ALSO disables Save until interaction (consistent semantic)', async () => {
        isMobileMock.mockReturnValue(false);
        render(
          <WaterTracker
            initial={{ consumedMl: 4800, targetMl: 2000, entries: [] }}
            timezone="UTC"
          />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByTestId('water-edit-button'));
        const saveBtn = (await screen.findByTestId('water-edit-save')) as HTMLButtonElement;
        // Even when the prefill exactly equals the current total, no
        // interaction == no commit.
        expect(saveBtn.disabled).toBe(true);
        expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
        await user.click(saveBtn);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(authPost).not.toHaveBeenCalled();
      });

      it('desktop: closing and re-opening the popover resets the interaction flag (Save disabled again)', async () => {
        isMobileMock.mockReturnValue(false);
        render(
          <WaterTracker
            initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }}
            timezone="UTC"
          />,
        );
        const user = userEvent.setup();
        // Open, interact, close.
        await user.click(screen.getByTestId('water-edit-button'));
        const input1 = (await screen.findByTestId('water-edit-input')) as HTMLInputElement;
        await user.tripleClick(input1);
        await user.keyboard('5000');
        const saveBtn1 = screen.getByTestId('water-edit-save') as HTMLButtonElement;
        expect(saveBtn1.disabled).toBe(false);
        await user.click(screen.getByTestId('water-edit-cancel'));
        // Re-open. Save must be disabled again until next interaction.
        await user.click(screen.getByTestId('water-edit-button'));
        const saveBtn2 = (await screen.findByTestId('water-edit-save')) as HTMLButtonElement;
        expect(saveBtn2.disabled).toBe(true);
        expect(saveBtn2.getAttribute('aria-disabled')).toBe('true');
      });

      it('mobile: opening EDIT at off-step total (4775) disables Save in the wheel sheet until the wheel changes', async () => {
        isMobileMock.mockReturnValue(true);
        render(
          <WaterTracker
            initial={{ consumedMl: 4775, targetMl: 2000, entries: [] }}
            timezone="UTC"
          />,
        );
        const user = userEvent.setup();
        await user.click(screen.getByTestId('water-edit-button'));
        const saveBtn = (await screen.findByRole('button', {
          name: /^Save$/i,
        })) as HTMLButtonElement;
        // Pre-interaction: Save disabled.
        expect(saveBtn.disabled).toBe(true);
        expect(saveBtn.getAttribute('aria-disabled')).toBe('true');
        await user.click(saveBtn);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(authPost).not.toHaveBeenCalled();

        // Click a non-active row to register interaction (jsdom can't
        // simulate touch/scroll).
        const wheel = screen.getByTestId('water-edit-wheel');
        const row5000 = Array.from(wheel.querySelectorAll('[role="option"]')).find(
          (el) => el.textContent?.trim() === '5000 ml',
        );
        expect(row5000).toBeDefined();
        await user.click(row5000 as Element);
        // Now Save is enabled.
        const saveBtn2 = (await screen.findByRole('button', {
          name: /^Save$/i,
        })) as HTMLButtonElement;
        expect(saveBtn2.disabled).toBe(false);
        expect(saveBtn2.getAttribute('aria-disabled')).toBe('false');
      });
    });
  });
});
