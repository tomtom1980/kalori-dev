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
import { t } from '@/lib/i18n/en';
import { getServerSupabase } from '@/lib/supabase/server';

import { AccountSubsection } from './_components/AccountSubsection';
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
  const { user } = await requireProfileOrRedirect({
    route: '/settings',
    loginRedirectTo: '/settings',
  });
  const supabase = await getServerSupabase();
  const userEmail = user.email ?? '';
  const userId = user.id;
  const userIdSlug = userId ? userId.slice(0, 8) : 'me';

  const counts = userId
    ? await fetchCountsForUser(supabase, userId)
    : { entries: 0, library: 0, weight: 0, water: 0 };

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
      <DataSubsection counts={counts} userIdSlug={userIdSlug} />
      <AccountSubsection userEmail={userEmail} />
    </section>
  );
}
