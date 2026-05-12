'use client';

/**
 * <NavShell /> — Client island that consumes `usePathname()` and hands the
 * pathname down to the three RSC-shaped nav components plus the FAB.
 *
 * Keeping pathname-derivation here (instead of in `(app)/layout.tsx`) avoids
 * turning the entire layout into a client boundary. Server Components remain
 * Server Components; only this 40-line island re-renders on route changes.
 *
 * Responsive strategy (ui-design.md §6.6): all three nav patterns render
 * unconditionally, and CSS media queries (via inline `@media` styles +
 * visibility helpers) pick the right one per viewport. This avoids
 * `useMediaQuery` hydration flashes.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { t } from '@/lib/i18n/en';

import type { DisplayIdentity } from '@/lib/auth/get-display-identity';
// Task 4.1 Phase 3 fix (C5): WCAG 2.1 SC 2.4.1 Bypass Blocks (Level A)
// requires a keyboard-reachable skip link that jumps over the nav shell
// to the page content. Rendered at the top of the DOM so a single Tab
// press from fresh load focuses it; `.kalori-skip-link` is visually
// hidden until `:focus-visible` applies. Not route-specific — the nav
// shell wraps every `(app)` surface, so one skip link serves dashboard,
// library, progress, settings, log. The target is `<main id="app-main"
// tabindex="-1">` below.
// I6 fix (Codex round 1): import the store at module scope so the FAB
// click is a synchronous `getState().openModal()` call — no `import()`
// promise hop on every tap, no perceptible delay on low-end devices.
// The chrome-level <LogFlowKeybinding /> + <LogFlowModalMount /> already
// drag this module into the chrome bundle, so no bundle delta.
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';
// Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — water FAB now
// POSTs `/api/water/log` directly via `authPost` (R1 refresh-interceptor
// path) and surfaces a 2 s non-undoable confirmation toast through the
// canonical `useUndoQueueStore`. Replaces the previous Path A
// `router.push('/dashboard')` which was a same-route no-op when the
// user was already on the dashboard.
import { announcePolite } from '@/lib/a11y/announce';
import { authFetch } from '@/lib/auth/refresh-interceptor';
import { m, motion, useReducedMotion } from '@/lib/motion/defaults';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { useWaterMutationStore } from '@/lib/stores/useWaterMutationStore';
import { getDeviceTimeZone } from '@/lib/time/device-timezone';
// C2 (Codex round 2, bugfix-tomi 2026-05-08-mobile-water-button) —
// `userTzToday(timezone)` is invoked at TAP TIME inside `handleLogWater`
// so a long-lived NavShell render that crosses local midnight cannot
// durably write yesterday's `logged_on`. Helper is client-safe — uses
// `Intl.DateTimeFormat` (lib/time/day.ts:33), no Node-only APIs.
import { userTzToday } from '@/lib/time/day';
import { mintClientId } from '@/lib/water/client-id';

import { SrLiveRegions } from '@/components/chrome/SrLiveRegions';
import { UndoCrossTabBridge } from '@/components/toast/UndoCrossTabBridge';
import { UndoToastMount } from '@/components/toast/UndoToastMount';

import { BottomTabBar } from './bottom-tab-bar';
import { LogFAB } from './log-fab';
import { LogFlowKeybinding } from './log-flow-keybinding';
import { LogFlowModalMount } from './log-flow-modal-mount';
import { LogFlowUserScopeSync } from './log-flow-user-scope-sync';
import { ShortcutsOverlay } from './shortcuts-overlay';
import { Sidebar } from './sidebar';
import { TopAppBar } from './top-app-bar';

// Section kicker map — maps the first path segment to the label in the top
// app bar. Covers the 4 primary destinations; anything else falls back to the
// brand name so the strip never shows an empty string.
//
// Task 1.3: strings route through `t.masthead.sectionKicker.*` + `t.masthead
// .brandFallback` (design-doc.md §12). The rule `no-inline-user-strings`
// doesn't lint module constants (JSX-only scope); we fix for consistency
// per briefing §4 Option A.
const SECTION_KICKERS: Record<string, string> = {
  dashboard: t.masthead.sectionKicker.dashboard,
  library: t.masthead.sectionKicker.library,
  progress: t.masthead.sectionKicker.progress,
  settings: t.masthead.sectionKicker.settings,
  log: t.masthead.sectionKicker.log,
};

function sectionKickerFor(pathname: string): string {
  const first = pathname.split('/')[1] ?? '';
  return SECTION_KICKERS[first] ?? t.masthead.brandFallback;
}

function isIsoDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Stub edition line — Task 2.x / 3.x replace with real masthead date.
const STUB_EDITION = t.masthead.editionStub;

export interface NavShellProps {
  children: React.ReactNode;
  /**
   * F-UI-3.6-B-2 — current session user id resolved server-side. Passed to
   * <LogFlowUserScopeSync /> so the log-flow draft store purges on user
   * change. Null = unauthenticated chrome render (shouldn't happen inside
   * `(app)` but kept optional so the type works for chrome-level tests).
   */
  userId?: string | null;
  /**
   * Task A.2 (US-STAB-A2) + Codex Round 1 #3 (DTO): server-resolved display
   * identity DTO, drilled to <Sidebar /> and used to feed the top-app-bar
   * monogram. Contains ONLY {name, handle, initials, isAnonymous} — never
   * the full Supabase `User`. Optional for chrome-level tests; default is
   * the anonymous identity (mirrors the resolver's `user == null` branch).
   */
  identity?: DisplayIdentity;
  /**
   * C2 (Codex round 2, bugfix-tomi 2026-05-08-mobile-water-button) —
   * the user's IANA timezone (e.g., `'Asia/Ho_Chi_Minh'`), drilled from
   * `(app)/layout.tsx`. Used by the mobile water FAB which calls
   * `userTzToday(timezone)` AT TAP TIME (not at render time) so a long-
   * lived NavShell that crosses local midnight cannot durably write
   * yesterday's `logged_on`. Optional with a UTC fallback so chrome-
   * level test renders don't crash.
   *
   * NOTE — `loggedOn` is NOT drilled here on purpose. A precomputed
   * date string would be captured as a stale prop in the persistent
   * client island (the `(app)` layout is mounted once and persists
   * across route changes). Computing the date at tap time using
   * `Intl.DateTimeFormat` via `userTzToday` is the correct pattern.
   */
  timezone?: string;
}

const ANONYMOUS_IDENTITY: DisplayIdentity = {
  name: 'GUEST',
  handle: undefined,
  initials: '—',
  isAnonymous: true,
};

export function NavShell({
  children,
  userId = null,
  identity = ANONYMOUS_IDENTITY,
  timezone = 'UTC',
}: NavShellProps) {
  const pathname = usePathname() ?? '/dashboard';
  const searchParams = useSearchParams();
  const dashboardDateLoadingDay = useDashboardDateTransitionStore((state) => state.loadingDay);
  const clearDashboardDateLoading = useDashboardDateTransitionStore(
    (state) => state.clearLoadingDay,
  );
  const reducedMotion = useReducedMotion();
  // Task A.2 + Codex Round 1 #3 — top-app-bar monogram comes from the
  // server-resolved DTO. Null/unauthenticated chrome mounts use the
  // ANONYMOUS_IDENTITY default → em-dash monogram.
  const topBarInitials = identity.initials;

  // I1 (Codex round 1, bugfix-tomi 2026-05-08-mobile-water-button) —
  // after a successful water POST we call `router.refresh()` so the
  // dashboard RSC (`/app/(app)/dashboard/page.tsx` runs with
  // `dynamic = 'force-dynamic'` and reads `snapshot.water.consumedMl`
  // via `fetchDaySnapshot()`) re-fetches and re-renders, which feeds
  // the updated `initial.consumedMl` into `<WaterTracker />`. Without
  // this, the FAB toast confirms success while the visible bullets
  // and ml total remain stale until the next navigation — exactly the
  // duplicate-tap regression Codex flagged. Cheap path was chosen
  // over routing through a shared client store because no such store
  // exists today (`useWaterTrackerStore` is not present in the repo).
  const router = useRouter();
  const dashboardDateTransitionPending =
    pathname.startsWith('/dashboard') && dashboardDateLoadingDay !== null;

  useEffect(() => {
    if (!pathname.startsWith('/dashboard') && dashboardDateLoadingDay !== null) {
      clearDashboardDateLoading();
    }
  }, [clearDashboardDateLoading, dashboardDateLoadingDay, pathname]);

  // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — synchronous
  // re-entrancy gate. `useState(true)` does NOT commit before the next
  // event loop tick, so a fast double-tap on mobile bypasses a state-
  // based guard. The ref-latch is the correct synchronous gate per
  // lessons-relevant line 14 (mobile-ui-overhaul lessons). Cleared in
  // the finally block so a failed POST does not lock the FAB.
  const isFiringRef = useRef(false);

  // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — cap-toast
  // dedupe gate for the FAB surface. The FAB has no pre-emptive guard
  // (it does not know the daily total) so cap rejection is purely
  // server-driven via 409 OVER_DAILY_LIMIT. A burst of taps near the
  // cap could produce a burst of 409s; gate cap-toast emission to one
  // per 1.5 s window.
  const capToastLastShownRef = useRef<number>(0);

  function dashboardViewedDayAtTap(): string | null {
    if (!pathname.startsWith('/dashboard')) return null;
    const day = searchParams.get('day');
    if (!isIsoDay(day)) return null;
    const today = userTzToday(getDeviceTimeZone(timezone));
    return day <= today ? day : null;
  }

  // Bug-1 (bugfix-tomi 2026-05-09-water-fab-ux) — instant-feedback
  // restructure. The previous implementation pushed the success toast
  // INSIDE the try block AFTER `await authPost(...)`, so on real
  // mobile networks (Vercel iad1 ↔ Supabase ap-southeast-1 ≈ 150–
  // 200 ms one-way + server processing + DB insert) the FAB had a
  // 500 ms–2 s perceived dead zone, prompting users to re-tap. The
  // ref-latch protected the network from duplicate writes but left
  // the human without a "your tap was received" signal.
  //
  // The fix is a fire-and-forget pattern: push the success toast
  // SYNCHRONOUSLY in the click handler before the network round-trip,
  // then POST in the background. On failure, dismiss the optimistic
  // toast and replace it with an error toast (kalori-canonical
  // UndoToast surface — only invocation order changes; ttlMs=2000
  // remains, kind='delete-failed' (non-undoable) remains).
  //
  // Returning `void` (not Promise<void>) so the JSX `onClick` does NOT
  // await the handler — the click event resolves on the synchronous
  // tick and the network promise rides on its own microtask queue.
  function handleLogWater(): void {
    if (dashboardDateTransitionPending) return;
    if (useWaterMutationStore.getState().inFlight > 0) return;
    if (isFiringRef.current) return;
    isFiringRef.current = true;
    useWaterMutationStore.getState().begin();

    const clientId = mintClientId();
    // C2 (Codex round 2) — compute today-in-user-TZ AT TAP TIME, not
    // at render time. `userTzToday` uses `Intl.DateTimeFormat`
    // (client-safe) and runs synchronously on the tap event tick.
    const today = dashboardViewedDayAtTap() ?? userTzToday(getDeviceTimeZone(timezone));

    // OPTIMISTIC — push the success toast synchronously so the user
    // gets visual + a11y feedback in the same tick as the click. The
    // POST has not started yet at this point; the toast represents
    // the user's INTENT. If the POST fails, the catch branch below
    // retracts this toast and pushes an error toast.
    useUndoQueueStore.getState().pushToast({
      clientId,
      kind: 'delete-failed',
      description: t.fab.waterLoggedToast,
      serverRowId: null,
      commit: async () => {
        /* nothing to commit — POST resolution is the persistence path. */
      },
      revert: async () => {
        /* non-undoable: kind:'delete-failed' renders no UNDO button. */
      },
      ttlMs: 2000,
    });
    announcePolite(t.fab.waterLoggedAnnounce);

    // Fire-and-forget the network round trip. `void` makes the lint
    // rule happy and signals intent; the click handler returns
    // synchronously after the optimistic UI work above.
    void (async () => {
      let waitingForDashboardRefresh = false;
      try {
        // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — switched
        // from `authPost` to `authFetch` so the 409 OVER_DAILY_LIMIT
        // response can be inspected by status code. `authPost` throws a
        // generic Error on non-2xx that does NOT expose the status —
        // and the R1 firewall forbids editing the refresh-interceptor
        // module. Direct `authFetch` is the existing pattern for
        // status-code-sensitive consumers (e.g. ConfirmationScreen).
        const res = await authFetch('/api/water/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            unit: 'glass',
            count: 1,
            logged_on: today,
          }),
        });
        if (res.status === 409) {
          // I1 (Codex round 1, bugfix-tomi 2026-05-09-water-custom-button) —
          // 409 resync contract. The chip's 409 handler parses the body
          // and commits `currentTotalMl` directly to its local committed
          // state (WaterTracker.tsx:292-307), so the visible chip
          // reconciles to the server's authoritative total. The FAB has
          // NO local water-total state — the dashboard `<WaterTracker />`
          // owns the visible count via its `initial.consumedMl` prop
          // derived from the RSC snapshot. The FAB-side analog of
          // "commit currentTotalMl locally" is therefore
          // `router.refresh()`, which causes the dashboard RSC to
          // re-fetch `snapshot.water.consumedMl` and feed the fresh
          // value into the WaterTracker. Without this refresh, a user
          // who taps the FAB at-cap sees the cap toast but the
          // dashboard bullets/ml total stay stuck at the pre-cap value
          // (e.g., visually 4750 ml when the server is at 5000 — the
          // multi-tab race the contract is designed to handle). We
          // parse the body for forward-compat / observability even
          // though the FAB does not consume `currentTotalMl` directly
          // (the refresh path delivers the authoritative number). Fire-
          // and-forget so the visible UI updates (dismiss + cap toast +
          // refresh) run in the same microtask as the 409 detection,
          // not delayed behind the body-stream consumption.
          const body = (await res.json().catch(() => ({}))) as { currentTotalMl?: unknown };
          const currentTotalMl =
            typeof body.currentTotalMl === 'number' ? body.currentTotalMl : null;
          // Retract the optimistic success toast and surface the cap
          // toast in its place. Dedupe gate suppresses a burst of cap
          // toasts when the user mashes the FAB after hitting the cap.
          useUndoQueueStore.getState().dismiss(clientId);
          const now = Date.now();
          if (now - capToastLastShownRef.current >= 1500) {
            capToastLastShownRef.current = now;
            useUndoQueueStore.getState().pushToast({
              clientId,
              kind: 'delete-failed',
              description: t.fab.waterCapReached,
              serverRowId: null,
              commit: async () => {},
              revert: async () => {},
              ttlMs: 2000,
            });
            announcePolite(t.fab.waterCapReachedAnnounce);
          }
          // Reconcile the dashboard to the server's authoritative total.
          // Cheap no-op on non-dashboard routes (Next dedupes RSC refresh
          // for the current segment). Mirrors the chip's local re-sync;
          // see comment block above.
          if (pathname.startsWith('/dashboard') && currentTotalMl !== null) {
            waitingForDashboardRefresh = true;
            useWaterMutationStore.getState().waitForServerTotal(currentTotalMl);
          }
          router.refresh();
          return;
        }
        if (!res.ok) {
          // Treat any non-2xx (other than the handled 409) as a generic
          // error — fall through to the catch branch by throwing.
          throw new Error(`POST /api/water/log failed: ${res.status}`);
        }
        const body = (await res.json().catch(() => ({}))) as { totalMl?: unknown };
        const totalMl = typeof body.totalMl === 'number' ? body.totalMl : null;
        if (pathname.startsWith('/dashboard') && totalMl !== null) {
          waitingForDashboardRefresh = true;
          useWaterMutationStore.getState().waitForServerTotal(totalMl);
        }
        // I1 (Codex round 1) — invalidate the RSC cache for the
        // current route so the dashboard `<WaterTracker />` re-renders
        // with the fresh `consumedMl` total. On non-dashboard routes
        // this is a cheap no-op (Next refreshes the current segment
        // and dedupes).
        router.refresh();
      } catch {
        // C2 (Codex round 1, bugfix-tomi 2026-05-09-water-fab-ux) —
        // truthful-feedback contract. Previously the SessionExpired-
        // Error branch `return`ed without dismissing the optimistic
        // success toast, on the theory that the redirect to /login
        // would displace it. But on slow mobile networks the
        // forceSignOut() roundtrip + window.location navigation can
        // take 100s of ms during which the user sees "250 ml logged"
        // (with a polite SR announcement) for a write that 401'd and
        // never persisted — falsifying the batch's truthful-feedback
        // premise. Treating SessionExpiredError the same as a generic
        // error here is safe because forceSignOut() inside authFetch
        // already initiated the redirect BEFORE throwing — the
        // SessionExpiredError instance carries no recovery semantics
        // that need preserving in this fire-and-forget IIFE (no
        // upstream consumer can act on a rethrow; it would become an
        // unhandledrejection).
        //
        // Retract the optimistic success toast (clears its timer too)
        // and replace with the error toast so the user does not see
        // "logged" on screen while the request actually failed, and
        // so `selectLiveTop` cannot re-surface the success after the
        // error TTLs out.
        useUndoQueueStore.getState().dismiss(clientId);
        useUndoQueueStore.getState().pushToast({
          clientId,
          kind: 'delete-failed',
          description: t.fab.waterLoggedFailed,
          serverRowId: null,
          commit: async () => {},
          revert: async () => {},
          ttlMs: 2000,
        });
      } finally {
        isFiringRef.current = false;
        if (!waitingForDashboardRefresh) {
          useWaterMutationStore.getState().end();
        }
      }
    })();
  }

  return (
    <div
      className="kalori-app-shell"
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <a href="#app-main" className="kalori-skip-link" data-testid="skip-to-main">
        {t.nav.skipToMain}
      </a>
      <div className="nav-shell-grid" style={{ display: 'flex', flex: 1 }}>
        <div className="nav-shell-sidebar" data-testid="nav-shell-sidebar">
          <Sidebar pathname={pathname} identity={identity} />
        </div>
        {/*
          Phase 7 regression fix (REG-1): the flex column that hosts the top
          app bar + main content defaults to `min-width: auto` (= min-content),
          which let descendants with intrinsic widths greater than the
          viewport-minus-sidebar budget (heatmap table, dashboard hero pair)
          push this column wider than the viewport. `minWidth: 0` lets the
          column shrink to its allocated flex track and forces inner
          `overflow-x: auto` containers to engage instead of expanding the
          page.
        */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="nav-shell-top" data-testid="nav-shell-top">
            <TopAppBar
              sectionKicker={sectionKickerFor(pathname)}
              editionLine={STUB_EDITION}
              userInitials={topBarInitials}
            />
          </div>
          <m.main
            key={pathname}
            id="app-main"
            tabIndex={-1}
            className="kalori-page-main"
            style={{
              flex: 1,
              // .kalori-page-main owns `padding` (escalates 16/32/48 at
              // 768/1280 — Bug #1). The override below preserves the
              // safe-area + bottom-tab clearance the FAB needs at mobile
              // widths only — re-applied as a media query in globals.css
              // would be redundant since the rule has no effect once the
              // bottom tab bar hides at >=768.
              paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + var(--spacing-16))',
            }}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : motion.expressive}
          >
            {children}
          </m.main>
        </div>
      </div>

      <div className="nav-shell-mobile" data-testid="nav-shell-mobile">
        {/*
          Bug #5 (bugfix-tomi 2026-05-08-mobile-ui-overhaul, tiebreaker
          #24): the single 56-square FAB grew into a SIDE-BY-SIDE PAIR
          — food primary (oxblood) + water secondary (bg-1 + ivory
          border). Total wrapper width is 56 + 8 gutter + 56 = 120px,
          so the centred offset shifts from `calc(50% - 28px)` (single
          FAB) to `calc(50% - 60px)` (pair).

          The bottom tab bar's `gridTemplateColumns: 'repeat(4, 1fr)'`
          already distributes the four destinations evenly across the
          full viewport width — there is no fixed "middle gap" to widen.
          The FAB pair simply floats at z-index 41 on top of the bar
          (positioned via `bottom:` calc so the food-FAB centre
          coincides with the geometric centre between Library and
          Progress at 375 / 414 / 768px viewports).

          Water FAB onClick (Bug-1, bugfix-tomi 2026-05-08-mobile-water-
          button — supersedes the prior Phase 2 Path A decision): the
          previous `router.push('/dashboard')` was a same-route no-op
          when the user was already on the dashboard (their default
          landing page), so the button felt dead on mobile. The new
          handler POSTs `/api/water/log` directly with `{ unit:'glass',
          count:1 }` (== 250 ml), pushes a 2 s non-undoable confirmation
          toast through the canonical `useUndoQueueStore`, and announces
          a polite SR message. No navigation — the user stays on
          whatever route they tapped from.
        */}
        <div
          className="kalori-fab-pair"
          style={{
            position: 'fixed',
            left: 'calc(50% - 60px)',
            bottom: 'calc(56px + env(safe-area-inset-bottom) + var(--spacing-2))',
            zIndex: 41,
            display: 'flex',
            gap: '8px',
          }}
        >
          <LogFAB
            variant="food"
            disabled={dashboardDateTransitionPending}
            onClick={() => {
              if (dashboardDateTransitionPending) return;
              const viewedDay = dashboardViewedDayAtTap();
              useLogFlowStore.getState().openModal('type', {
                ...(viewedDay ? { logDate: viewedDay, timezone } : {}),
              });
            }}
          />
          <LogFAB
            variant="water"
            disabled={dashboardDateTransitionPending}
            onClick={() => {
              handleLogWater();
            }}
          />
        </div>
        <BottomTabBar pathname={pathname} />
      </div>

      <ShortcutsOverlay />
      <LogFlowKeybinding />
      <LogFlowModalMount />
      {/* F-UI-3.6-B-2 — reconcile persisted log-flow draft against the
          current session user so drafts don't leak across logout → login
          on a shared device. */}
      <LogFlowUserScopeSync userId={userId} />
      {/* Task 3.4 — chrome-level toast + sr-only regions; mounted once
          so the undo toast survives route changes (F6 3 AM scenario). */}
      <UndoToastMount />
      {/* Task 5.2 — F6 cross-tab undo listener. Receives `kalori-undo`
          broadcasts from sibling tabs and routes them through the local
          store so the toast appears in the receiving tab. Receive-only
          MVP per Conflict #9b. */}
      <UndoCrossTabBridge />
      <SrLiveRegions />
    </div>
  );
}

export default NavShell;
