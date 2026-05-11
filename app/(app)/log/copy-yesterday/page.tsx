/**
 * `/log/copy-yesterday` — Task 3.4 dedicated copy-yesterday route
 * (synthesis §2.10).
 *
 * Server RSC wrapper that resolves yesterday's date in the user's TZ and
 * fetches yesterday's `food_entries` rows via the user-scoped Supabase
 * client.
 *
 * Note on code-splitting: the modal is a small (~2 kB) client component
 * and the route itself is /log/copy-yesterday — the route boundary already
 * gives us code-splitting for any caller (e.g., dashboard in 3.5) that
 * doesn't navigate here. Wrapping in `next/dynamic({ ssr: false })` would
 * be redundant; we skip it (see react-perf I2 resolution).
 *
 * TZ math: delegated to `userTzYesterdayUtcRange` so the range is correct
 * for TZs east of UTC (skill G13 fix; naïve `UTC - 86_400_000` would
 * mis-bucket early-morning Asia/Ho_Chi_Minh entries).
 */
import { redirect } from 'next/navigation';

import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom, userTzToday, userTzYesterdayUtcRange } from '@/lib/time/day';

import { CopyYesterdayModal, type CopyYesterdayEntry } from './_components/CopyYesterdayModal';

export const dynamic = 'force-dynamic';

export default async function CopyYesterdayPage() {
  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect('/login');
  }
  const userId = userData.user.id;

  const { data: profile } = (await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()) as { data: { timezone?: string } | null };
  const tz = profile?.timezone ?? 'UTC';
  const today = userTzToday(tz);
  const { startUtc, endUtc, targetDay } = userTzYesterdayUtcRange(today, tz);

  const { data: rows } = (await supabase
    .from('food_entries')
    .select('id, meal_category, items, logged_at')
    .gte('logged_at', startUtc)
    .lt('logged_at', endUtc)
    .order('logged_at', { ascending: true })) as {
    data: Array<{
      id: string;
      meal_category: string;
      items: Array<{ name?: string; kcal?: number }>;
      logged_at: string;
    }> | null;
  };

  const entries: CopyYesterdayEntry[] = (rows ?? [])
    .filter((r) => userTzDayFrom(r.logged_at, tz) === targetDay)
    .map((r) => ({
      id: r.id,
      mealCategory: r.meal_category,
      label: r.items[0]?.name ?? '(unnamed)',
      kcal: r.items[0]?.kcal ?? 0,
    }));

  return <CopyYesterdayModal entries={entries} />;
}
