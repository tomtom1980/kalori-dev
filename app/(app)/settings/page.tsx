/**
 * `/settings` — Task 1.2 placeholder + Task 5.1.6 Reduce Motion toggle +
 * Task 5.2 §DATA + §ACCOUNT (synthesis §2.3).
 *
 * RSC. Pre-fetches the current user's email + counts of records per
 * domain so the Settings page renders all derived strings server-side
 * (no client-side initial fetches). Counts feed into the ExportModal
 * "{N} entries…" body line.
 */
import { requireProfileOrRedirect } from '@/lib/auth/orphan-profile-fence';
import type { CSSProperties } from 'react';
import { t } from '@/lib/i18n/en';
import { calculateAgeOnDate, isAgeInSupportedRange, isIsoDay } from '@/lib/profile/age';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';

import { AccountSubsection } from './_components/AccountSubsection';
import { AiSummaryConsentToggle } from './_components/AiSummaryConsentToggle';
import { DataSubsection } from './_components/DataSubsection';
import { ReduceMotionToggle } from './_components/ReduceMotionToggle';

async function fetchCountsForUser(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  userId: string,
): Promise<{ entries: number; library: number; weight: number; water: number }> {
  // Counts are RLS-bound — `eq('user_id', userId)` is required even though
  // policies enforce it; the explicit filter saves a row scan when RLS
  // re-validates the predicate.
  const [entries, library, weight, water] = await Promise.all([
    supabase
      .from('food_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('food_library_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase.from('weight_log').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('water_log').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return {
    entries: entries.count ?? 0,
    library: library.count ?? 0,
    weight: weight.count ?? 0,
    water: water.count ?? 0,
  };
}

export default async function SettingsPage() {
  // Task A.3 — orphan-profile fence (US-STAB-A3). Single-pass profile
  // lookup co-located with the auth check; on orphan state redirects 302
  // to /onboarding before any count aggregate read.
  const { user, profile } = await requireProfileOrRedirect({
    route: '/settings',
    loginRedirectTo: '/settings',
    selectExtras: 'birthday, age, timezone, ai_summary_opt_in',
  });
  const supabase = await getServerSupabase();
  const userEmail = user.email ?? '';
  const userId = user.id;
  const userIdSlug = userId ? userId.slice(0, 8) : 'me';

  const counts = userId
    ? await fetchCountsForUser(supabase, userId)
    : { entries: 0, library: 0, weight: 0, water: 0 };
  const birthday = typeof profile.birthday === 'string' ? profile.birthday : null;
  const birthdayForDisplay = formatBirthdayForDisplay(birthday);
  const timezone = typeof profile.timezone === 'string' ? profile.timezone : 'UTC';
  const today = userTzDayFrom(new Date().toISOString(), timezone);
  const derivedAge = birthday ? calculateAgeOnDate(birthday, today) : null;
  const ageForDisplay = isAgeInSupportedRange(derivedAge)
    ? derivedAge
    : typeof profile.age === 'number'
      ? profile.age
      : null;

  return (
    <section data-testid="page-settings">
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 300,
          fontSize: 'var(--type-section-md)',
          letterSpacing: '-0.02em',
          margin: 0,
          marginBottom: 'var(--spacing-4)',
        }}
      >
        {t.settings.heading}
      </h1>
      <h2
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: 'var(--type-label)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-2)',
        }}
      >
        {t.settings.displayHeading}
      </h2>
      <ReduceMotionToggle />
      <AiSummaryConsentToggle enabled={profile.ai_summary_opt_in === true} />
      <section
        aria-labelledby="settings-profile-heading"
        style={{
          borderTop: '1px solid var(--color-rule-strong)',
          paddingTop: 'var(--spacing-6)',
          marginTop: 'var(--spacing-6)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <h2
          id="settings-profile-heading"
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 'var(--type-label)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
            margin: 0,
            marginBottom: 'var(--spacing-3)',
          }}
        >
          {t.settings.profileHeading}
        </h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, max-content) 1fr',
            gap: 'var(--spacing-2) var(--spacing-6)',
            margin: 0,
          }}
        >
          <dt style={settingsTermStyle}>{t.settings.birthdayLabel}</dt>
          <dd className="num" style={settingsValueStyle}>
            {birthdayForDisplay ?? t.settings.profileMissingValue}
          </dd>
          <dt style={settingsTermStyle}>{t.settings.ageLabel}</dt>
          <dd className="num" style={settingsValueStyle}>
            {ageForDisplay === null ? t.settings.profileMissingValue : ageForDisplay}
          </dd>
        </dl>
      </section>
      <DataSubsection counts={counts} userIdSlug={userIdSlug} />
      <AccountSubsection userEmail={userEmail} />
    </section>
  );
}

const settingsTermStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--type-label)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--color-dust)',
} satisfies CSSProperties;

const settingsValueStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  color: 'var(--color-ivory)',
  margin: 0,
} satisfies CSSProperties;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function formatBirthdayForDisplay(value: string | null): string | null {
  if (!isIsoDay(value)) return null;
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? [];
  const monthIndex = Number(month) - 1;
  return `${MONTH_NAMES[monthIndex]} ${Number(day)}, ${year}`;
}
