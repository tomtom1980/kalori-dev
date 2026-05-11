/**
 * `/dashboard` — Task 3.5 full dashboard shell + Task 3.7 F-UI-3.7-C guard.
 *
 * Replaces the Task 1.2 stub. RSC with auth gate (existing C1-B hybrid auth
 * pattern preserved — middleware does cookie-shape; this page does
 * crypto-verified auth.getUser()). Streams 6 islands:
 *   1. Masthead           (RSC)
 *   2. ChronometerRing    (RSC shell + ChronometerArcDraw client leaf)
 *   3. MacroBars          (RSC)
 *   4. MealsBulletin      (RSC shell + 5 MealColumn + EntryRowActions client)
 *   5. WaterTracker       (client island with useOptimistic)
 *   6. MicronutrientPanel (RSC shell + MicrosOverflowToggle client)
 *
 * WeeklyInsight is wrapped in a single <Suspense> boundary per ui-design
 * §5.2 "exactly ONE Suspense boundary"; Task 4.3a replaces the skeleton
 * with real content.
 *
 * Data layer: lib/dashboard/fetch.ts helpers wrapped in React cache() for
 * per-request dedupe. Write path (entries/save, entries/delete, water/log)
 * revalidates via TAGS.* so subsequent navigations see fresh data. The
 * full cacheComponents + PPR flip is deferred per M1.6.
 *
 * Onboarding guard (F-UI-3.7-C, mirror of `/onboarding` Phase 2 F2 fix):
 * after auth succeeds, SELECT `onboarding_completed_at` from profiles. If
 * NULL, `redirect('/onboarding')` — otherwise the downstream
 * `fetchProfile()` / `fetchDaySnapshot()` readers see NULL fields like
 * `calorie_target` and `timezone` and produce NaN/crash downstream. Profile
 * lookup error fails closed (throws → Next error boundary) rather than
 * rendering to an incomplete profile.
 */
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { ChronometerRing } from '@/components/charts/ChronometerRing';
import { DashboardDateControl } from '@/components/dashboard/DashboardDateControl';
import { DashboardInteractionLock } from '@/components/dashboard/DashboardInteractionLock';
import { MacroBars } from '@/components/dashboard/MacroBars';
import { Masthead } from '@/components/dashboard/Masthead';
import { MealsBulletin } from '@/components/dashboard/MealsBulletin';
import { MicronutrientPanel } from '@/components/dashboard/MicronutrientPanel';
import { TargetUpdatedNudgeWrapper } from '@/components/dashboard/TargetUpdatedNudgeWrapper';
import { WaterTracker } from '@/components/dashboard/WaterTracker';
import { WeeklyInsightCard } from '@/components/dashboard/WeeklyInsightCard';
import { WeeklyInsightSkeleton } from '@/components/dashboard/WeeklyInsightSkeleton';
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { fetchDaySnapshot, fetchProfile } from '@/lib/dashboard/fetch';
import { userTzNowIso, userTzToday } from '@/lib/time/day';

export const dynamic = 'force-dynamic';

const DESKTOP_MICRO_VISIBLE = 10;

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isIsoDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === day
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps = {}) {
  // Task A.3 — orphan-profile fence (US-STAB-A3) — replaces the previous
  // inline `profiles.maybeSingle()` + Sentry.captureException + redirect
  // path. The fence issues exactly ONE supabase round trip against
  // `profiles` (TOCTOU-safe per P-2), redirects 302 to /onboarding on
  // orphan state, and emits a `dashboard.orphan-profile-fenced` Sentry
  // breadcrumb with SHA-256 anonymized user_id (never the raw UUID).
  //
  // The fence widens the SELECT with the Task 4.3b nudge-card columns so
  // both reads collapse into a single round trip — no second profiles
  // query downstream.
  const { user, profile: guardRow } = await requireProfileOrRedirect({
    route: '/dashboard',
    loginRedirectTo: '/dashboard',
    selectExtras:
      'target_mode, calorie_target, last_target_recalc_at, last_dashboard_visit_at, bio_sex, age, height_cm, current_weight_kg, goal_weight_kg, goal_pace, activity_level',
  });
  if (!guardRow.onboarding_completed_at) {
    redirect('/onboarding');
  }

  const profile = await fetchProfile(user.id);
  const tz = profile.timezone;
  const now = userTzNowIso(tz);
  const today = userTzToday(tz);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedDay = firstSearchParam(resolvedSearchParams.day);
  if (isIsoDay(requestedDay) && requestedDay > today) {
    redirect('/dashboard');
  }
  const viewedDay = isIsoDay(requestedDay) ? requestedDay : today;
  const snapshot = await fetchDaySnapshot(user.id, profile, viewedDay, tz, now);
  const firstVisit = profile.last_dashboard_visit_at === null;

  // Task 4.3b — decide whether the nudge card should render. Gate:
  //   - target_mode === 'auto' (manual-mode users never see the nudge)
  //   - last_target_recalc_at > last_dashboard_visit_at
  // Task 4.3b Phase 3 Round 1 C1 fix: also pull the onboarding inputs
  // that `<HowWeCalculated />` needs so the "see why" disclosure has
  // real content when the user clicks it.
  // Task A.3 — fence already SELECTed these columns; reuse `guardRow`.
  const nudgeRow = guardRow as typeof guardRow & {
    target_mode?: string | null;
    calorie_target?: number | null;
    last_target_recalc_at?: string | null;
    last_dashboard_visit_at?: string | null;
    bio_sex?: string | null;
    age?: number | null;
    height_cm?: number | null;
    current_weight_kg?: number | null;
    goal_weight_kg?: number | null;
    goal_pace?: string | null;
    activity_level?: string | null;
  };
  const nudgeShouldRender =
    !!nudgeRow &&
    nudgeRow.target_mode === 'auto' &&
    !!nudgeRow.last_target_recalc_at &&
    (nudgeRow.last_dashboard_visit_at === null ||
      new Date(nudgeRow.last_target_recalc_at as string).getTime() >
        new Date(nudgeRow.last_dashboard_visit_at as string).getTime());

  return (
    <section
      data-testid="page-dashboard"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-12)',
      }}
    >
      <Masthead edition={snapshot.edition} firstVisit={firstVisit} />
      <DashboardDateControl viewedDay={viewedDay} today={today} />
      <DashboardInteractionLock viewedDay={viewedDay}>
        {/* Task 4.3b — TargetUpdatedNudge (F9 mitigation). Renders above the
         macro bars when an auto-recalc has landed since the last dashboard
         visit. Manual-mode + sub-threshold paths skip this render entirely. */}
        {nudgeShouldRender && nudgeRow ? (
          <TargetUpdatedNudgeWrapper
            calorieTarget={Number(nudgeRow.calorie_target ?? 0)}
            lastTargetRecalcAt={nudgeRow.last_target_recalc_at as string}
            lastDashboardVisitAt={(nudgeRow.last_dashboard_visit_at as string) ?? null}
            howWeCalculatedInputs={
              nudgeRow.bio_sex != null &&
              nudgeRow.age != null &&
              nudgeRow.height_cm != null &&
              nudgeRow.current_weight_kg != null &&
              nudgeRow.goal_weight_kg != null &&
              nudgeRow.goal_pace != null &&
              nudgeRow.activity_level != null
                ? {
                    bio_sex: nudgeRow.bio_sex as never,
                    age: Number(nudgeRow.age),
                    height_cm: Number(nudgeRow.height_cm),
                    current_weight_kg: Number(nudgeRow.current_weight_kg),
                    goal_weight_kg: Number(nudgeRow.goal_weight_kg),
                    goal_pace: nudgeRow.goal_pace as never,
                    activity_level: nudgeRow.activity_level as never,
                  }
                : null
            }
          />
        ) : null}

        {/* Hero row — chronometer + macros. Mobile: stacked single column;
         tablet/desktop (>=768px): two equal columns. Driven by
         `.kalori-dashboard-hero-row` in app/globals.css (Bug #1). */}
        <div className="kalori-dashboard-hero-row">
          <div>
            <ChronometerRing data={snapshot.chronometer} timezone={tz} />
          </div>
          <div>
            <MacroBars macros={snapshot.macros} />
          </div>
        </div>

        <MealsBulletin meals={snapshot.meals} timezone={tz} viewedDay={viewedDay} />

        <div className="kalori-dashboard-hero-row">
          {/*
          F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — drill `timezone` (IANA
          zone) instead of a precomputed `loggedOn` date string. The chip
          calls `userTzToday(timezone)` at tap time so a long-lived
          dashboard tab that crosses local midnight cannot durably write
          to yesterday's `logged_on`. Mirrors the C2 nav-shell pattern.
        */}
          <WaterTracker
            initial={{
              consumedMl: snapshot.water.consumedMl,
              targetMl: snapshot.water.targetMl,
              entries: snapshot.water.entries,
            }}
            timezone={tz}
            viewedDay={viewedDay}
          />
          <MicronutrientPanel rows={snapshot.micros} visibleCount={DESKTOP_MICRO_VISIBLE} />
        </div>

        <Suspense fallback={<WeeklyInsightSkeleton />}>
          <WeeklyInsightCard userId={user.id} tz={tz} nowIso={now} />
        </Suspense>
      </DashboardInteractionLock>
    </section>
  );
}
