/**
 * `/progress` — Task 4.3a Progress page (D/W/M + 5 charts + weekly AI review).
 *
 * Server-component shell. Reads `?range=D|W|M` from searchParams (defaults
 * to W per briefing §0 #6). Auth via middleware (I6) + onboarding guard
 * mirrors the dashboard's pattern.
 *
 * 6 Suspense boundaries stream independently:
 *   1-5 chart sections (calorie adherence, macro distribution, heatmap,
 *       trend summary, logging consistency)
 *   6   weekly-review island (own cache tag / 7d staleness)
 *
 * PPR-ready topology: no `experimental.ppr` flag (Task 3.5 deferral). Each
 * chart RSC calls `fetchProgressSnapshot` which is wrapped in React.cache
 * for per-request dedup. When `cacheComponents` flips on later, lift these
 * readers into `'use cache'` + `cacheTag([TAGS.userProgress(...)]).
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { Suspense } from 'react';

import { CalorieAdherenceBar } from '@/components/charts/CalorieAdherenceBar';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { LoggingConsistencyCalendar } from '@/components/charts/LoggingConsistencyCalendar';
import { MacroDistributionStackedArea } from '@/components/charts/MacroDistributionStackedArea';
import { MicronutrientHeatmap } from '@/components/charts/MicronutrientHeatmap';
import { TrendSummary } from '@/components/charts/TrendSummary';
import { WeeklyReviewSkeleton } from '@/components/charts/WeeklyReviewSkeleton';
import { WeightTrajectoryLine } from '@/components/charts/WeightTrajectoryLine';
import { fetchProgressSnapshot, type ProgressRange } from '@/lib/aggregations/progress-fetch';
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import { t } from '@/lib/i18n/en';
import { getServerSupabase } from '@/lib/supabase/server';

import { ProgressRangeToolbar } from './_components/ProgressRangeToolbar';
import { ProgressWeightQuickAdd } from './_components/weight-quick-add';
import { WeeklyReviewIsland } from './_components/weekly-review-island';

// NOTE: `force-dynamic` REMOVED in Task 4.3a R1 (2026-04-24) per perf-spec
// §1.4 anti-pattern list. The route is inherently dynamic because
// `supabase.auth.getUser()` reads cookies in the page body — Next.js
// marks it `ƒ` dynamic regardless. Removing the explicit directive
// clears the spec-conformance gate for the `experimental.ppr` flip that
// ships later in Phase 5; Suspense + React.cache provides streaming
// semantics today.

interface ProgressPageProps {
  searchParams: Promise<{ range?: string }>;
}

function normalizeRange(raw: string | undefined): ProgressRange {
  if (raw === 'D' || raw === 'W' || raw === 'M') return raw;
  return 'W';
}

export default async function ProgressPage(props: ProgressPageProps) {
  // Task A.3 — orphan-profile fence (US-STAB-A3) — single-pass profile
  // lookup. Widened SELECT collapses the two prior reads (auth-guard and
  // profile-fields) into one round trip.
  const { user, profile: profileRow } = await requireProfileOrRedirect({
    route: '/progress',
    loginRedirectTo: '/progress',
    // Task B.4 — `unit_pref` widened in for the inline weight quick-add
    // (`<ProgressWeightQuickAdd />`). Trivially-small column; same query.
    selectExtras: 'calorie_target, bmr, tdee, timezone, unit_pref',
  });
  if (!profileRow.onboarding_completed_at) {
    redirect('/onboarding');
  }

  const { range: rawRange } = await props.searchParams;
  const range = normalizeRange(rawRange);
  const tz: string = (profileRow.timezone as string) ?? 'UTC';
  const nowIso = new Date().toISOString();
  // Task 4.3b — weight trajectory window start (30 days back). Derive from
  // `nowIso` instead of `Date.now()` for React Compiler purity (single
  // impurity source, resolved earlier, then reused).
  const nowMs = Date.parse(nowIso);
  const weightSinceDate = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Task B.4 — inline weight quick-add user-timezone date props. PRD §3.5
  // backfill window is 30 days; minDate = today - 30d. Reuse the same
  // Intl.DateTimeFormat pattern used by the trajectory window so test
  // fixtures exercising the timezone are consistent.
  const tzDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  const todayUserTz = tzDateFormatter.format(new Date(nowMs));
  const minDateUserTz = tzDateFormatter.format(new Date(nowMs - 30 * 24 * 60 * 60 * 1000));
  const unitPref: 'metric' | 'imperial' =
    (profileRow.unit_pref as 'metric' | 'imperial') ?? 'metric';

  // Profiles do not (yet) carry explicit macro targets; derive from
  // calorie_target via the 25/45/30 split (same defaults as the dashboard
  // macro bars per `lib/dashboard/aggregate.ts`).
  const calorieTarget = Number(profileRow.calorie_target ?? 2000);
  const profile = {
    calorie_target: calorieTarget,
    protein_target_g: Math.round((calorieTarget * 0.25) / 4),
    carbs_target_g: Math.round((calorieTarget * 0.45) / 4),
    fat_target_g: Math.round((calorieTarget * 0.3) / 9),
    fiber_target_g: 30,
  };

  // client_id for the weekly-review route handler — deterministic per
  // page render (server-rendered UUID is acceptable since the route is
  // idempotent via the client_id replay guard).
  const weeklyReviewClientId = randomUUID();

  // Codex R1 I-1 fix: resolve request origin + cookie header HERE (parent
  // page RSC) so the weekly-review island never calls `headers()` inside
  // its Suspense boundary. Keeps the PPR-ready topology intact — when
  // `experimental.ppr` flips on later, the island renders with these
  // already-resolved values without re-reading request-scoped storage.
  const h = await headers();
  const host = h.get('host');
  const protocol =
    process.env.NODE_ENV === 'production' && !host?.startsWith('localhost') ? 'https' : 'http';
  const requestOrigin = host ? `${protocol}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? '');
  const cookieHeader = h.get('cookie') ?? '';

  return (
    <main
      data-testid="page-progress"
      aria-labelledby="progress-masthead-heading"
      className="kalori-progress-main"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-12)',
      }}
    >
      <Masthead />

      <ProgressRangeToolbar active={range} windowLabel={computeWindowLabel(range, nowIso)} />

      <section
        aria-label={t.progress.footer.chartsSectionLabel}
        className="kalori-progress-charts-grid"
      >
        {/* Section header — Adherence */}
        <SectionHeader
          kicker={t.progress.sections.adherence.kicker}
          title={t.progress.sections.adherence.title}
          subtitle={t.progress.sections.adherence.subtitle}
        />

        <div style={{ gridColumn: 'span 12' }}>
          <div className="kalori-progress-charts-row">
            <Suspense fallback={<ChartSkeleton kind="calorie-adherence" />}>
              <CalorieAdherenceSection
                userId={user.id}
                profile={profile}
                range={range}
                tz={tz}
                nowIso={nowIso}
              />
            </Suspense>
            <Suspense fallback={<ChartSkeleton kind="macro-distribution" />}>
              <MacroDistributionSection
                userId={user.id}
                profile={profile}
                range={range}
                tz={tz}
                nowIso={nowIso}
              />
            </Suspense>
          </div>
        </div>

        <SectionRule />

        <SectionHeader
          kicker={t.progress.sections.minorElements.kicker}
          title={t.progress.sections.minorElements.title}
          subtitle={t.progress.sections.minorElements.subtitle}
        />
        <Suspense fallback={<ChartSkeleton kind="heatmap" fullWidth />}>
          <HeatmapSection
            userId={user.id}
            profile={profile}
            range={range}
            tz={tz}
            nowIso={nowIso}
          />
        </Suspense>

        <SectionRule />

        <SectionHeader
          kicker={t.progress.sections.trends.kicker}
          title={t.progress.sections.trends.title}
          subtitle={t.progress.sections.trends.subtitle}
        />

        <div style={{ gridColumn: 'span 12' }}>
          <div className="kalori-progress-charts-row">
            <Suspense fallback={<ChartSkeleton kind="trend-summary" />}>
              <TrendSummarySection
                userId={user.id}
                profile={profile}
                range={range}
                tz={tz}
                nowIso={nowIso}
              />
            </Suspense>
            <Suspense fallback={<ChartSkeleton kind="logging-consistency" />}>
              <LoggingConsistencySection
                userId={user.id}
                profile={profile}
                range={range}
                tz={tz}
                nowIso={nowIso}
              />
            </Suspense>
          </div>
        </div>

        <SectionRule />

        {/* Task 4.3b — Weight trajectory section. */}
        <SectionHeader
          kicker={t.weight.progressSectionKicker}
          title={t.weight.progressSectionTitle}
          subtitle={t.weight.progressSectionSubtitle}
        />
        <div style={{ gridColumn: 'span 12' }}>
          {/* Task B.4 (US-STAB-B4) — inline quick-add affordance above the
              chart. `mode='inline'` is borderless / chrome-less by design
              (matches The Ledger hairline aesthetic — see Phase 1 UX memo).
              `initialWeightKg={null}` keeps blast radius small for B.4; the
              optimistic-store mirror (`store.lastCommittedWeightKg`)
              populates after the first successful save. Hoisting the
              latest weight-log row to the parent is parked as
              F-B4-INITIAL-WEIGHT-HOIST (post-MVP). */}
          <div style={{ marginBottom: 'var(--spacing-6)' }}>
            <ProgressWeightQuickAdd
              unitPref={unitPref}
              todayUserTz={todayUserTz}
              minDateUserTz={minDateUserTz}
              initialWeightKg={null}
            />
          </div>
          <Suspense fallback={<ChartSkeleton kind="trend-summary" />}>
            <WeightTrajectorySection userId={user.id} sinceDate={weightSinceDate} />
          </Suspense>
        </div>

        <SectionRule />

        <SectionHeader
          kicker={t.progress.sections.fromEditor.kicker}
          title={t.progress.sections.fromEditor.title}
          subtitle={t.progress.sections.fromEditor.subtitle}
        />
        <Suspense fallback={<WeeklyReviewSkeleton />}>
          <WeeklyReviewIsland
            userId={user.id}
            tz={tz}
            clientId={weeklyReviewClientId}
            nowIso={nowIso}
            requestOrigin={requestOrigin}
            cookieHeader={cookieHeader}
          />
        </Suspense>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Section RSCs — one per chart; each has own Suspense boundary at parent.
// ---------------------------------------------------------------------------

interface SectionProps {
  userId: string;
  profile: {
    calorie_target: number;
    protein_target_g: number;
    carbs_target_g: number;
    fat_target_g: number;
    fiber_target_g: number;
  };
  range: ProgressRange;
  tz: string;
  nowIso: string;
}

async function CalorieAdherenceSection({ userId, profile, range, tz, nowIso }: SectionProps) {
  const snapshot = await fetchProgressSnapshot(userId, range, profile, tz, nowIso);
  return <CalorieAdherenceBar data={snapshot.calorie} />;
}

async function MacroDistributionSection({ userId, profile, range, tz, nowIso }: SectionProps) {
  const snapshot = await fetchProgressSnapshot(userId, range, profile, tz, nowIso);
  return <MacroDistributionStackedArea data={snapshot.macro} />;
}

async function HeatmapSection({ userId, profile, range, tz, nowIso }: SectionProps) {
  const snapshot = await fetchProgressSnapshot(userId, range, profile, tz, nowIso);
  return <MicronutrientHeatmap data={snapshot.heatmap} />;
}

async function TrendSummarySection({ userId, profile, range, tz, nowIso }: SectionProps) {
  const snapshot = await fetchProgressSnapshot(userId, range, profile, tz, nowIso);
  return <TrendSummary data={snapshot.trend} />;
}

async function LoggingConsistencySection({ userId, profile, range, tz, nowIso }: SectionProps) {
  const snapshot = await fetchProgressSnapshot(userId, range, profile, tz, nowIso);
  return <LoggingConsistencyCalendar data={snapshot.logging} />;
}

async function WeightTrajectorySection({
  userId,
  sinceDate,
}: {
  userId: string;
  sinceDate: string;
}) {
  const supabase = await getServerSupabase();
  const [{ data: entries }, { data: profileRow }] = await Promise.all([
    supabase
      .from('weight_log')
      .select('date, weight_kg')
      .eq('user_id', userId)
      .gte('date', sinceDate)
      .order('date', { ascending: true }),
    supabase.from('profiles').select('goal_weight_kg').eq('id', userId).maybeSingle(),
  ]);
  const normalized = (entries ?? []).map((row) => ({
    date: row.date as string,
    weightKg: Number(row.weight_kg),
  }));
  const goalWeightKg =
    profileRow?.goal_weight_kg === null || profileRow?.goal_weight_kg === undefined
      ? null
      : Number(profileRow.goal_weight_kg);
  return <WeightTrajectoryLine entries={normalized} goalWeightKg={goalWeightKg} range="30d" />;
}

// ---------------------------------------------------------------------------
// Shell pieces — static, server-rendered.
// ---------------------------------------------------------------------------

function Masthead() {
  return (
    <header
      data-testid="progress-masthead"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottom: '1px solid var(--color-rule-strong)',
        paddingBottom: 'var(--spacing-4)',
        gap: 'var(--spacing-6)',
      }}
    >
      <h1
        id="progress-masthead-heading"
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 32,
          letterSpacing: '-0.02em',
          color: 'var(--color-ivory)',
          margin: 0,
          lineHeight: 1.1,
        }}
      >
        {t.progress.masthead.title}{' '}
        <em style={{ fontStyle: 'italic', color: 'var(--color-sand)', fontWeight: 400 }}>
          — {t.progress.masthead.titleEm}
        </em>
      </h1>
      <p
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
        }}
      >
        {t.progress.masthead.issuePrefix}
      </p>
    </header>
  );
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--spacing-6)',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-oxblood-soft)',
            margin: 0,
            marginBottom: 4,
          }}
        >
          {kicker}
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 22,
            letterSpacing: '-0.01em',
            color: 'var(--color-ivory)',
            margin: 0,
          }}
        >
          · {title}
        </h2>
      </div>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--color-sand)',
          margin: 0,
          textAlign: 'right',
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function SectionRule() {
  return (
    <hr
      aria-hidden="true"
      style={{
        gridColumn: '1 / -1',
        border: 'none',
        borderTop: '1px solid color-mix(in srgb, var(--color-ivory) 12%, transparent)',
        margin: 0,
      }}
    />
  );
}

function computeWindowLabel(range: ProgressRange, nowIso: string): string {
  const end = nowIso.slice(0, 10);
  if (range === 'D') return `WINDOW · TODAY · ROLLING 24 H.`;
  if (range === 'W') return `WINDOW · ROLLING 7 D. ENDING ${end}`;
  return `WINDOW · ROLLING 30 D. ENDING ${end}`;
}
