import { t } from '@/lib/i18n/en';
import type {
  ChronometerData,
  DashboardSnapshot,
  MacroRow,
  MacrosByKey,
  MicroRow,
} from '@/lib/dashboard/types';

export interface DailyEditorsNoteContent {
  body: string;
  bullets: string[];
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return isoDay;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

function entryCount(snapshot: DashboardSnapshot): number {
  if ('entryCount' in snapshot.chronometer) return snapshot.chronometer.entryCount;
  return Object.values(snapshot.meals).reduce((sum, meal) => sum + meal.entries.length, 0);
}

function populatedChronometer(
  data: ChronometerData,
): Extract<ChronometerData, { consumed: number }> | null {
  return 'consumed' in data ? data : null;
}

function calorieOutcome(data: Extract<ChronometerData, { consumed: number }>): string {
  const delta = Math.round(data.target - data.consumed);
  if (delta > 0) {
    return t.dashboard.dailyEditorsNote.outcomeUnder.replace('{delta}', formatNumber(delta));
  }
  if (delta < 0) {
    return t.dashboard.dailyEditorsNote.outcomeOver.replace(
      '{delta}',
      formatNumber(Math.abs(delta)),
    );
  }
  return t.dashboard.dailyEditorsNote.outcomeOnTarget;
}

function calorieRecommendation(data: Extract<ChronometerData, { consumed: number }>): string {
  if (data.status === 'over-target' || data.status === 'way-over') {
    return t.dashboard.dailyEditorsNote.recommendOver;
  }
  if (data.status === 'approaching') return t.dashboard.dailyEditorsNote.recommendApproaching;
  if (data.status === 'on-target') return t.dashboard.dailyEditorsNote.recommendOnTarget;
  return t.dashboard.dailyEditorsNote.recommendUnder;
}

function macroName(row: MacroRow): string {
  return t.dashboard.macros[`${row.key}Title` as const];
}

function bestMacro(macros: MacrosByKey): MacroRow | null {
  return (
    Object.values(macros)
      .filter((row): row is MacroRow => !!row && row.status !== 'empty')
      .sort((a, b) => b.pct - a.pct)[0] ?? null
  );
}

function attentionMicro(micros: MicroRow[]): MicroRow | null {
  return micros.find((row) => row.status === 'low' || row.status === 'mid') ?? null;
}

function attentionSignal(snapshot: DashboardSnapshot): string | null {
  const waterTarget = snapshot.water.targetMl;
  if (waterTarget > 0 && snapshot.water.consumedMl < waterTarget * 0.5) {
    return t.dashboard.dailyEditorsNote.signalWater;
  }

  const fiber = snapshot.macros.fiber;
  if (fiber.status !== 'empty' && fiber.pct < 60) {
    return t.dashboard.dailyEditorsNote.signalFiber;
  }

  const micro = attentionMicro(snapshot.micros);
  if (micro) {
    return t.dashboard.dailyEditorsNote.signalMicro.replace('{name}', micro.name);
  }

  return null;
}

function goodSignal(snapshot: DashboardSnapshot): string {
  const best = bestMacro(snapshot.macros);
  if (best && best.pct >= 75) {
    return t.dashboard.dailyEditorsNote.signalGoodMacro.replace('{name}', macroName(best));
  }
  if (snapshot.water.targetMl > 0 && snapshot.water.consumedMl >= snapshot.water.targetMl) {
    return t.dashboard.dailyEditorsNote.signalGoodWater;
  }
  return t.dashboard.dailyEditorsNote.signalGoodLogged;
}

export function buildDailyEditorsNote(
  snapshot: DashboardSnapshot,
  viewedDay: string,
): DailyEditorsNoteContent {
  const day = formatDay(viewedDay);
  const count = entryCount(snapshot);
  const chronometer = populatedChronometer(snapshot.chronometer);

  if (!chronometer || count === 0) {
    return {
      body: t.dashboard.dailyEditorsNote.emptyBody.replace('{day}', day),
      bullets: [],
    };
  }

  const entryWord =
    count === 1
      ? t.dashboard.dailyEditorsNote.entrySingular
      : t.dashboard.dailyEditorsNote.entryPlural;
  const attention = attentionSignal(snapshot);
  const body = t.dashboard.dailyEditorsNote.body
    .replace('{day}', day)
    .replace('{entries}', String(count))
    .replace('{entryWord}', entryWord)
    .replace('{consumed}', formatNumber(Math.round(chronometer.consumed)))
    .replace('{target}', formatNumber(Math.round(chronometer.target)));

  return {
    body,
    bullets: [
      `${t.dashboard.dailyEditorsNote.outcomeLabel}: ${calorieOutcome(chronometer)}`,
      `${t.dashboard.dailyEditorsNote.recommendationLabel}: ${calorieRecommendation(chronometer)}`,
      attention
        ? `${t.dashboard.dailyEditorsNote.needsAttentionLabel}: ${attention}`
        : `${t.dashboard.dailyEditorsNote.goodLabel}: ${goodSignal(snapshot)}`,
    ],
  };
}
