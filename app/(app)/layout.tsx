/**
 * `(app)` route group layout — wraps every post-login surface with the nav
 * shell. Task 1.2 ships the placeholder stubs; Task 2.1 adds auth enforcement
 * in middleware and the real profile/settings wiring.
 *
 * Each direct child (`dashboard`, `log`, `library`, `progress`, `settings`)
 * is a thin placeholder today — they exist so the nav tabs have navigable
 * targets and the visual regression baselines can lock a real DOM tree.
 *
 * F-UI-3.6-B-2: resolve the session user id once here and forward it to
 * NavShell, which forwards to <LogFlowUserScopeSync /> to purge the
 * log-flow draft store when the user changes on a shared device. Missing
 * auth doesn't block rendering — middleware already guards `(app)` routes.
 *
 * Task 5.1.4: this is the canonical mount point for `<OfflineQueueProvider>`,
 * `<OfflineBar />`, and the lazy `<PWAInstallPromptHost />`. The provider is
 * intentionally NOT mounted at the root layout so auth/marketing/offline-
 * fallback routes stay bundle-thin and SSR-safe.
 */
import * as Sentry from '@sentry/nextjs';

import { CrossTabSignOutListener } from '@/components/auth/CrossTabSignOutListener';
import { NavShell } from '@/components/nav/nav-shell';
import { OfflineBar } from '@/components/offline/OfflineBar';
import { GoalWeightConflictModalHost } from '@/components/pwa/GoalWeightConflictModal';
import { PWAInstallPromptHost } from '@/components/pwa/pwa-install-prompt-host';
import { DeviceTimezoneSync } from '@/components/time/DeviceTimezoneSync';
import { getDisplayIdentity } from '@/lib/auth/get-display-identity';
import { OfflineQueueProvider } from '@/lib/offline/network-state';
import { getServerSupabase } from '@/lib/supabase/server';
// C2 (Codex round 2, bugfix-tomi 2026-05-08-mobile-water-button) — drill
// the user's IANA timezone (not a precomputed `loggedOn` date string)
// down to NavShell so the mobile water FAB can compute `logged_on` AT
// TAP TIME via `userTzToday(timezone)` inside the client handler. The
// `(app)` layout persists across route changes; a precomputed date
// string would silently capture yesterday's date once local midnight
// passes for a long-lived session. `WaterTracker` chip on the dashboard
// has the same stale-loggedOn shape and is logged separately as
// F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 (Planning/followups.md).

// F-UI-3.6-B-2 made this layout an async RSC that reads auth. The build
// step does NOT inject Supabase env vars (by design — prerendering auth-
// gated pages with test creds is architecturally wrong per Task 2.4). Mark
// the whole `(app)` group dynamic so Next never tries to static-render any
// of its children (/library, /progress, /settings, /log were previously
// static and broke the build on 2026-04-22). This also matches the App
// Router idiom for per-user cookie-reading server components.
export const dynamic = 'force-dynamic';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  const userId = user?.id ?? null;
  // Codex Round 1 #3 (DTO): resolve display identity SERVER-SIDE so the full
  // Supabase `User` payload (provider_metadata, identities[], phone, etc.)
  // never crosses the server→client boundary. NavShell + Sidebar +
  // IdentityRow consume only the four narrow display fields.
  const identity = getDisplayIdentity(user);

  // Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — fetch the user's
  // timezone so the nav-shell water FAB POSTs `/api/water/log` with the
  // correct `logged_on` (today in user's TZ). Falls back to UTC when the
  // profile row is missing — middleware already gates `(app)` so an
  // unauthenticated render here means the user is being redirected; the
  // fallback only matters in chrome-level test renders.
  //
  // Codex R1 C1 (2026-05-09): the original draft queried `.eq('user_id',
  // user.id)`, but the schema (Planning/architecture.md §2.2) declares
  // `profiles.id` as the FK to `auth.users.id` — there is no `user_id`
  // column. The query returned a Supabase error, the previous code
  // destructured only `data` and silently fell back to UTC, and the FAB
  // wrote `water_log.date` to the wrong calendar day for non-UTC users
  // near midnight. Fix: query by `id` (matches every other call site —
  // lib/auth/orphan-profile-fence.ts:156, app/(app)/onboarding/page.tsx:75)
  // AND surface the error via `Sentry.captureException` so future schema
  // drift is loud, not silent. We still fall back to UTC after capturing
  // because throwing here would 500 every post-login surface on a
  // transient blip — the visibility gain is in error reporting, not in
  // route-level failure mode.
  let timezone = 'UTC';
  let hasProfileRow = false;
  if (user) {
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      Sentry.captureException(profileError, {
        tags: {
          source: 'app-layout-timezone-lookup',
          op: 'profile-timezone-fetch',
        },
      });
    }
    hasProfileRow = profileRow !== null;
    timezone = (profileRow?.timezone as string | null) ?? 'UTC';
  }

  return (
    <OfflineQueueProvider>
      <OfflineBar />
      {hasProfileRow ? <DeviceTimezoneSync profileTimezone={timezone} /> : null}
      <NavShell userId={userId} identity={identity} timezone={timezone}>
        {children}
      </NavShell>
      <PWAInstallPromptHost />
      {/* Task 5.1.5 — F10 conflict host: silent-LWW side-effect for library
          kinds + AlertDialog mount for goal-weight-update prompts. Always
          mounted so conflicts surface immediately when replayStatus flips. */}
      <GoalWeightConflictModalHost />
      {/* Task 5.2 — F12 cross-tab sign-out listener. Mounts a 5s sticky
          banner on receive of a `kalori-auth` broadcast, then redirects
          to /login?reason=cross-tab. Chrome-level so it survives route
          changes. */}
      <CrossTabSignOutListener />
    </OfflineQueueProvider>
  );
}
