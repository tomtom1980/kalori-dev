import type { SupabaseClient } from '@supabase/supabase-js';

import { userTzDayFrom, userTzDayUtcRange } from '@/lib/time/day';

export const LIBRARY_CREATE_DAILY_LIMIT = 20;
export const LIBRARY_CREATE_MONTHLY_LIMIT = 100;

export interface LibraryCreateQuota {
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

export function libraryCreateQuotaWindows(
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

async function countLibraryCreates({
  supabase,
  userId,
  startUtc,
  endUtc,
}: {
  supabase: SupabaseClient;
  userId: string;
  startUtc: string;
  endUtc: string;
}): Promise<number> {
  const { count, error } = await supabase
    .from('food_library_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc);

  if (error) {
    throw error;
  }
  return count ?? 0;
}

export async function getLibraryCreateQuota({
  supabase,
  userId,
  tz,
  nowIso = new Date().toISOString(),
}: {
  supabase: SupabaseClient;
  userId: string;
  tz: string;
  nowIso?: string;
}): Promise<LibraryCreateQuota> {
  const windows = libraryCreateQuotaWindows(nowIso, tz);
  const [dailyCount, monthlyCount] = await Promise.all([
    countLibraryCreates({
      supabase,
      userId,
      startUtc: windows.dayStartUtc,
      endUtc: windows.dayEndUtc,
    }),
    countLibraryCreates({
      supabase,
      userId,
      startUtc: windows.monthStartUtc,
      endUtc: windows.monthEndUtc,
    }),
  ]);
  const dailyRemaining = Math.max(0, LIBRARY_CREATE_DAILY_LIMIT - dailyCount);
  const monthlyRemaining = Math.max(0, LIBRARY_CREATE_MONTHLY_LIMIT - monthlyCount);
  const reason =
    dailyCount >= LIBRARY_CREATE_DAILY_LIMIT
      ? 'daily'
      : monthlyCount >= LIBRARY_CREATE_MONTHLY_LIMIT
        ? 'monthly'
        : null;

  return {
    dailyCount,
    monthlyCount,
    dailyLimit: LIBRARY_CREATE_DAILY_LIMIT,
    monthlyLimit: LIBRARY_CREATE_MONTHLY_LIMIT,
    dailyRemaining,
    monthlyRemaining,
    exceeded: reason !== null,
    reason,
  };
}
