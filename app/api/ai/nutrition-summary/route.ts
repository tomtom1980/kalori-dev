import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { callGemini } from '@/lib/ai/client';
import {
  computeCacheKey,
  lookup as cacheLookup,
  lookupLatestSuccessful,
  write as cacheWrite,
} from '@/lib/ai/cache';
import { fetchCacheByHash, findPriorCall, logAICall } from '@/lib/ai/cost-log';
import { v1_nutritionSummary } from '@/lib/ai/prompts';
import {
  NutritionSummaryModelResult,
  NutritionSummaryResult,
  type NutritionSummaryResultT,
} from '@/lib/ai/schemas';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import {
  buildNutritionSummaryContext,
  computeNutritionSummaryFingerprint,
  NutritionSummaryContextReadError,
  type NutritionSummaryContext,
  type NutritionSummaryRange,
  type NutritionSummaryScope,
} from '@/lib/aggregations/summary-context';
import { getServerSupabase } from '@/lib/supabase/server';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';
import { userTzToday } from '@/lib/time/day';

export const runtime = 'nodejs';

const FIRST_BYTE_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 30_000;

const IsoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
  }, 'must be a real YYYY-MM-DD date');

const RangeSchema = z
  .object({
    preset: z.enum(['last_7', 'last_30', 'custom']),
    start_on: IsoDay,
    end_on: IsoDay,
  })
  .strict()
  .refine((range) => range.start_on <= range.end_on, 'start_on must be before end_on')
  .refine((range) => dayCount(range.start_on, range.end_on) <= 365, 'range is too long');

const BodySchema = z
  .object({
    client_id: z.uuid(),
    scope: z.enum(['dashboard-day', 'progress-range']),
    day: IsoDay.optional(),
    range: RangeSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.scope === 'dashboard-day' ? !!body.day && !body.range : !!body.range && !body.day,
    {
      message: 'dashboard-day requires only day; progress-range requires only range',
    },
  );

type NutritionSummaryRequestContext = {
  readonly scope: NutritionSummaryScope;
  readonly range: NutritionSummaryRange;
};

type NutritionSummaryRequestBody = z.infer<typeof BodySchema>;

function dayCount(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return Number.POSITIVE_INFINITY;
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function normalizedInput(input: {
  readonly scope: string;
  readonly range: NutritionSummaryRange;
  readonly dataFingerprint: string;
}): string {
  return JSON.stringify({
    scope: input.scope,
    range: input.range,
    data_fingerprint: input.dataFingerprint,
  });
}

function requestContextFromBody(body: NutritionSummaryRequestBody): NutritionSummaryRequestContext {
  return body.scope === 'dashboard-day'
    ? {
        scope: body.scope,
        range: { preset: 'dashboard-day', start_on: body.day!, end_on: body.day! },
      }
    : { scope: body.scope, range: body.range as NutritionSummaryRange };
}

function requestContextFromContext(
  context: NutritionSummaryContext,
): NutritionSummaryRequestContext {
  return { scope: context.scope, range: context.range };
}

function fallbackSummary(input: {
  readonly context: NutritionSummaryContext;
  readonly dataFingerprint: string;
  readonly reason: 'empty' | 'error';
}): NutritionSummaryResultT {
  const now = new Date().toISOString();
  const context = input.context;
  if (input.reason === 'empty') {
    return {
      body_markdown:
        context.scope === 'dashboard-day'
          ? 'Nothing has been logged for this day yet. Add a meal, water, or weight entry and this note will summarize the record.'
          : 'Nothing has been logged in this selected range yet. Add a meal, water, or weight entry and this note will summarize the record.',
      bullets: ['Log the next meal or water entry to start the summary.'],
      caveats: [...context.caveats],
      generated_at: now,
      source: 'fallback',
      data_fingerprint: input.dataFingerprint,
    };
  }
  const dayTotal = dayCount(context.range.start_on, context.range.end_on);
  const missingPreview = context.food.missing_days.slice(0, 4).join(', ');
  const missingSuffix =
    context.food.missing_days.length > 4
      ? `, plus ${context.food.missing_days.length - 4} more`
      : '';
  const kcalTarget = context.profile.calorie_target;
  const proteinTarget = context.profile.protein_target_g;
  const fiberTarget = context.profile.fiber_target_g;
  const cholesterolTarget = context.profile.cholesterol_target_mg;
  const waterTarget = context.water.target_ml;
  const loggedPhrase = `${context.food.logged_days} of ${dayTotal} days`;
  const caloriePhrase =
    kcalTarget !== null && kcalTarget > 0
      ? `${roundForSummary(context.food.totals.kcal)} kcal logged against a ${kcalTarget} kcal daily target`
      : `${roundForSummary(context.food.totals.kcal)} kcal logged`;
  const proteinPhrase =
    proteinTarget !== null && proteinTarget > 0
      ? `${roundForSummary(context.food.totals.protein_g)} g protein against ${proteinTarget} g/day`
      : `${roundForSummary(context.food.totals.protein_g)} g protein`;
  const fiberPhrase =
    fiberTarget !== null && fiberTarget > 0
      ? `${roundForSummary(context.food.totals.fiber_g)} g fiber against ${fiberTarget} g/day`
      : `${roundForSummary(context.food.totals.fiber_g)} g fiber`;
  const cholesterolPhrase =
    cholesterolTarget !== null && cholesterolTarget > 0
      ? `${roundForSummary(context.food.totals.cholesterol_mg)} mg cholesterol against ${cholesterolTarget} mg/day`
      : `${roundForSummary(context.food.totals.cholesterol_mg)} mg cholesterol`;
  const waterPhrase =
    context.water.log_count > 0
      ? `${Math.round(context.water.total_ml)} ml water logged against ${waterTarget} ml/day`
      : 'no water logs in this selection';
  const weightPhrase =
    context.weight.latest_kg !== null && context.weight.latest_on !== null
      ? `Latest weight is ${roundForSummary(context.weight.latest_kg)} kg on ${context.weight.latest_on}.`
      : 'No weight log is available for this selection.';
  const body = [
    `The AI summary could not refresh, so this fallback is using the available logged context. This ${context.scope === 'progress-range' ? 'range' : 'day'} has food on ${loggedPhrase}: ${caloriePhrase}, ${proteinPhrase}, ${fiberPhrase}, and ${cholesterolPhrase}.`,
    `${waterPhrase}. ${weightPhrase}${
      missingPreview
        ? ` Missing food days to close first: ${missingPreview}${missingSuffix}.`
        : ' Food logging is present for each day in this selection.'
    }`,
  ].join('\n\n');
  const bullets = [
    proteinTarget !== null && context.food.totals.protein_g < proteinTarget
      ? `Add a protein-forward meal next; current logged protein is ${roundForSummary(context.food.totals.protein_g)} g.`
      : 'Keep protein visible in the next meal so the range stays comparable.',
    context.water.log_count === 0
      ? 'Add a water log so hydration is represented in the recommendation.'
      : `Update water after the next drink; current logged water is ${Math.round(context.water.total_ml)} ml.`,
    missingPreview
      ? `Backfill ${context.food.missing_days[0]} first so the range stops being sparse.`
      : 'Log the next meal with a clear portion so the range can stay specific.',
    fiberTarget !== null && context.food.totals.fiber_g < fiberTarget
      ? `Add a fiber source next; current logged fiber is ${roundForSummary(context.food.totals.fiber_g)} g.`
      : 'Review cholesterol and fiber together on the next entry.',
  ];
  return {
    body_markdown: body,
    bullets,
    caveats: [...context.caveats],
    generated_at: now,
    source: 'fallback',
    data_fingerprint: input.dataFingerprint,
  };
}

function roundForSummary(value: number): number {
  return Math.round(value * 10) / 10;
}

async function latestSuccessfulSummary(input: {
  readonly userId: string;
  readonly requestContext: NutritionSummaryRequestContext;
}): Promise<NutritionSummaryResultT | null> {
  try {
    const payload = await lookupLatestSuccessful<NutritionSummaryResultT>({
      callType: 'nutrition-summary',
      userId: input.userId,
      requestContext: input.requestContext,
    });
    if (!payload) return null;
    return NutritionSummaryResult.parse({
      ...payload,
      source: 'cache',
      caveats: [
        ...(payload.caveats ?? []),
        'Last successful AI summary shown because the newest summary could not refresh.',
      ],
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'ai-nutrition-summary', phase: 'history-summary' },
    });
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const requestContext = requestContextFromBody(body);

  const fenced = await requireProfileOrJson401({
    route: '/api/ai/nutrition-summary',
    selectExtras:
      'timezone, ai_summary_opt_in, calorie_target, current_weight_kg, goal_weight_kg, activity_level, goal_pace, target_mode, unit_pref',
  });
  if (fenced instanceof Response) return fenced;

  const userId = fenced.user.id;
  const timezone = normalizeProfileTimezone(fenced.profile.timezone, {
    sentryTag: 'nutrition-summary',
    userId,
  });
  if (fenced.profile.ai_summary_opt_in !== true) {
    return NextResponse.json({ error: 'ai_summary_consent_required' }, { status: 403 });
  }
  const today = userTzToday(timezone);
  if (body.scope === 'dashboard-day' && body.day! > today) {
    return NextResponse.json({ error: 'future_date_not_allowed' }, { status: 400 });
  }
  if (body.scope === 'progress-range' && body.range!.end_on > today) {
    return NextResponse.json({ error: 'future_date_not_allowed' }, { status: 400 });
  }

  const supabase = await getServerSupabase();
  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  let context: NutritionSummaryContext;
  try {
    context = await buildNutritionSummaryContext({
      supabase,
      userId,
      scope: body.scope,
      day: body.day,
      range: body.range as NutritionSummaryRange | undefined,
      timezone,
      profile: fenced.profile,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        component: 'ai-nutrition-summary',
        phase: err instanceof NutritionSummaryContextReadError ? 'context-read' : 'context-build',
      },
    });
    const history = await latestSuccessfulSummary({ userId, requestContext });
    if (history) return NextResponse.json(history, { status: 200 });
    return NextResponse.json({ error: 'summary_context_unavailable' }, { status: 503 });
  }
  const contextRequestContext = requestContextFromContext(context);
  const dataFingerprint = computeNutritionSummaryFingerprint(context);
  const normal = normalizedInput({
    scope: body.scope,
    range: context.range,
    dataFingerprint,
  });
  const inputHash = computeCacheKey({
    callType: 'nutrition-summary',
    userId,
    normalizedInput: normal,
  });
  const start = Date.now();
  let logged = false;
  async function logOnce(input: {
    readonly tokens: number;
    readonly costEstimate: number;
    readonly cachedFlag: boolean;
  }): Promise<void> {
    if (logged) return;
    logged = true;
    await logAICall({
      userId,
      callType: 'nutrition-summary',
      inputHash,
      tokens: input.tokens,
      costEstimate: input.costEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: input.cachedFlag,
      clientId: body.client_id,
    });
  }

  const prior = await findPriorCall({ userId, clientId: body.client_id });
  if (prior) {
    if (prior.callType !== 'nutrition-summary' || prior.inputHash !== inputHash) {
      return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 });
    }
    const replay = await fetchCacheByHash<NutritionSummaryResultT>({ userId, inputHash });
    if (replay) return NextResponse.json(replay, { status: 200 });
    const history = await latestSuccessfulSummary({
      userId,
      requestContext: contextRequestContext,
    });
    if (history) return NextResponse.json(history, { status: 200 });
    return NextResponse.json({ error: 'ai_summary_unavailable' }, { status: 503 });
  }

  if (context.is_empty) {
    const fallback = fallbackSummary({ context, dataFingerprint, reason: 'empty' });
    await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: true });
    return NextResponse.json(fallback, { status: 200 });
  }

  try {
    const hit = await cacheLookup<NutritionSummaryResultT>({
      callType: 'nutrition-summary',
      userId,
      normalizedInput: normal,
    });
    if (hit.hit && hit.payload) {
      const cached = NutritionSummaryResult.parse({
        ...hit.payload,
        source: 'cache',
        data_fingerprint: hit.payload.data_fingerprint ?? dataFingerprint,
      });
      await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: true });
      return NextResponse.json(cached, { status: 200 });
    }

    const controller = new AbortController();
    const firstByteTimer = setTimeout(
      () => controller.abort(new Error('first-byte timeout')),
      FIRST_BYTE_TIMEOUT_MS,
    );
    const totalTimer = setTimeout(
      () => controller.abort(new Error('total timeout')),
      TOTAL_TIMEOUT_MS,
    );
    let geminiResult;
    try {
      geminiResult = await callGemini({
        ...v1_nutritionSummary(context),
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(firstByteTimer);
      clearTimeout(totalTimer);
    }
    const modelPayload = NutritionSummaryModelResult.parse(geminiResult.raw);
    const result = NutritionSummaryResult.parse({
      ...modelPayload,
      generated_at: new Date().toISOString(),
      source: 'ai',
      data_fingerprint: dataFingerprint,
    });
    await cacheWrite({
      callType: 'nutrition-summary',
      userId,
      normalizedInput: normal,
      parsedPayload: { ...result, request_context: contextRequestContext },
    });
    await logOnce({
      tokens: geminiResult.tokens,
      costEstimate: geminiResult.costEstimate,
      cachedFlag: false,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'ai-nutrition-summary' } });
    await logOnce({ tokens: 0, costEstimate: 0, cachedFlag: false });
    const history = await latestSuccessfulSummary({
      userId,
      requestContext: contextRequestContext,
    });
    if (history) return NextResponse.json(history, { status: 200 });
    return NextResponse.json({ error: 'ai_summary_unavailable' }, { status: 503 });
  }
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
