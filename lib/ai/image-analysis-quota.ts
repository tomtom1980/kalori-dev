import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
// The `ai_call_log` table is service-role-only; quota checks must use the
// admin client server-side so authenticated users cannot bypass RLS.
// eslint-disable-next-line kalori/no-admin-in-app
import { getAdminSupabase } from '@/lib/supabase/admin';
import { userTzDayFrom, userTzDayUtcRange } from '@/lib/time/day';

export const IMAGE_ANALYSIS_DAILY_LIMIT = 20;
export const IMAGE_ANALYSIS_MONTHLY_LIMIT = 100;
export const IMAGE_ANALYSIS_LIMIT_MESSAGE = 'AI image analysis limit';

export const IMAGE_ANALYSIS_QUOTA_CALL_TYPES = ['vision', 'image-analysis-sketch'] as const;

export interface ImageAnalysisQuota {
  dailyCount: number;
  monthlyCount: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyRemaining: number;
  monthlyRemaining: number;
  exceeded: boolean;
  reason: 'daily' | 'monthly' | null;
}

function monthStartDay(day: string): string {
  const [year, month] = day.split('-');
  if (!year || !month) return day;
  return `${year}-${month}-01`;
}

function nextMonthStartDay(day: string): string {
  const [yearRaw, monthRaw] = day.split('-').map((part) => parseInt(part, 10));
  if (!yearRaw || !monthRaw) return day;
  const next = new Date(Date.UTC(yearRaw, monthRaw, 1, 12, 0, 0, 0));
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function imageAnalysisQuotaWindows(
  nowIso: string,
  tz: string,
): {
  dayStartUtc: string;
  dayEndUtc: string;
  monthStartUtc: string;
  monthEndUtc: string;
} {
  const today = userTzDayFrom(nowIso, tz);
  const dayRange = userTzDayUtcRange(today, tz);
  const monthStart = monthStartDay(today);
  const nextMonthStart = nextMonthStartDay(today);
  return {
    dayStartUtc: dayRange.startUtc,
    dayEndUtc: dayRange.endUtc,
    monthStartUtc: userTzDayUtcRange(monthStart, tz).startUtc,
    monthEndUtc: userTzDayUtcRange(nextMonthStart, tz).startUtc,
  };
}

async function countImageAnalysisCalls({
  supabase,
  userId,
  startUtc,
  endUtc,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  startUtc: string;
  endUtc: string;
}): Promise<number> {
  const { count, error } = await supabase
    .from('ai_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('call_type', [...IMAGE_ANALYSIS_QUOTA_CALL_TYPES])
    .eq('cached_flag', false)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc);

  if (error) throw error;
  return count ?? 0;
}

export async function getImageAnalysisQuota({
  userId,
  tz,
  nowIso = new Date().toISOString(),
  supabase = getAdminSupabase(),
}: {
  userId: string;
  tz: string;
  nowIso?: string;
  supabase?: SupabaseClient<Database>;
}): Promise<ImageAnalysisQuota> {
  const windows = imageAnalysisQuotaWindows(nowIso, tz);
  const [dailyCount, monthlyCount] = await Promise.all([
    countImageAnalysisCalls({
      supabase,
      userId,
      startUtc: windows.dayStartUtc,
      endUtc: windows.dayEndUtc,
    }),
    countImageAnalysisCalls({
      supabase,
      userId,
      startUtc: windows.monthStartUtc,
      endUtc: windows.monthEndUtc,
    }),
  ]);
  const dailyRemaining = Math.max(0, IMAGE_ANALYSIS_DAILY_LIMIT - dailyCount);
  const monthlyRemaining = Math.max(0, IMAGE_ANALYSIS_MONTHLY_LIMIT - monthlyCount);
  const reason =
    dailyCount >= IMAGE_ANALYSIS_DAILY_LIMIT
      ? 'daily'
      : monthlyCount >= IMAGE_ANALYSIS_MONTHLY_LIMIT
        ? 'monthly'
        : null;

  return {
    dailyCount,
    monthlyCount,
    dailyLimit: IMAGE_ANALYSIS_DAILY_LIMIT,
    monthlyLimit: IMAGE_ANALYSIS_MONTHLY_LIMIT,
    dailyRemaining,
    monthlyRemaining,
    exceeded: reason !== null,
    reason,
  };
}
