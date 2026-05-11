/**
 * <WeeklyInsightCard /> — Task 4.3a dashboard compact variant (RSC).
 *
 * Shares the same cached `weekly_reviews` row as the progress page island
 * (no double-Gemini-call — DB-level UNIQUE on user_id+week_start_on +
 * same cache tag). Renders via <WeeklyReviewCore variant="compact">.
 *
 * Distinct from the progress island: NO 82px drop cap (T6 invariant).
 */
import { WeeklyReviewCore } from '@/components/charts/WeeklyReviewCore';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';

export interface WeeklyInsightCardProps {
  userId: string;
  tz: string;
  /** Request-time ISO instant; passed in to avoid impure-function lint error. */
  nowIso: string;
}

export async function WeeklyInsightCard({ userId, tz, nowIso }: WeeklyInsightCardProps) {
  const weekStartOn = isoMondayInUserTz(nowIso, tz);

  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from('weekly_reviews')
    .select('insights, generated_at, expires_at')
    .eq('user_id', userId)
    .eq('week_start_on', weekStartOn)
    .maybeSingle();

  if (!row?.insights) {
    // No row yet — render compact sparse-data placeholder. The progress
    // island (whenever user navigates there) will populate the row; this
    // card then reads the fresh row on next dashboard visit.
    return (
      <WeeklyReviewCore
        variant="compact"
        status="sparse-data"
        insights={{ sparse_data: true, logged_days: [] }}
        weekStartOn={weekStartOn}
      />
    );
  }

  const insights = row.insights as {
    body_markdown?: string | null;
    sparse_data?: boolean;
    logged_days?: Array<{ date: string; summary: string }>;
  };

  return (
    <WeeklyReviewCore
      variant="compact"
      status={insights.sparse_data ? 'sparse-data' : 'fresh'}
      insights={insights}
      generatedAt={(row.generated_at as string | null | undefined) ?? undefined}
      expiresAt={(row.expires_at as string | null | undefined) ?? undefined}
      weekStartOn={weekStartOn}
    />
  );
}

function isoMondayInUserTz(nowIso: string, tz: string): string {
  const today = userTzDayFrom(nowIso, tz);
  const [y, m, d] = today.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return today;
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  const dayNum = anchor.getUTCDay();
  const daysSinceMonday = dayNum === 0 ? 6 : dayNum - 1;
  const mondayMs = anchor.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000;
  const mondayDate = new Date(mondayMs);
  const yy = mondayDate.getUTCFullYear();
  const mm = String(mondayDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(mondayDate.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
