/**
 * <WeeklyReviewIsland /> now renders the shared nutrition-summary client
 * surface. The API route owns cache/fingerprint behavior for last-7,
 * last-30, and custom ranges, so this RSC only normalizes the current
 * progress range into an inclusive date window.
 */
import { NutritionSummaryReview } from '@/components/charts/NutritionSummaryReview';
import { computeWindow, type ProgressProfile } from '@/lib/aggregations/progress';
import type { ProgressRange } from '@/lib/aggregations/progress-fetch';

export interface WeeklyReviewIslandProps {
  userId: string;
  tz: string;
  clientId: string;
  nowIso: string;
  requestOrigin: string;
  cookieHeader: string;
  range?: ProgressRange | undefined;
  profile?: ProgressProfile | undefined;
  aiSummaryOptIn?: boolean | undefined;
}

export async function WeeklyReviewIsland({
  tz,
  nowIso,
  range = 'last_7',
  aiSummaryOptIn = false,
}: WeeklyReviewIslandProps) {
  const window = computeWindow(range, nowIso, tz);
  return (
    <NutritionSummaryReview
      range={{
        preset: rangePreset(range),
        start_on: window.userTzStartDay,
        end_on: window.userTzEndDay,
      }}
      aiSummaryOptIn={aiSummaryOptIn}
    />
  );
}

function rangePreset(range: ProgressRange): 'last_7' | 'last_30' | 'custom' {
  if (typeof range === 'object') return 'custom';
  if (range === 'last_30' || range === 'M') return 'last_30';
  return 'last_7';
}
