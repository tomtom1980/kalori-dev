import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { computeCacheKey, lookup as cacheLookup, write as cacheWrite } from '@/lib/ai/cache';
import { logAICall } from '@/lib/ai/cost-log';
import { callGeminiWithFallback, getDefaultFallbackModel } from '@/lib/ai/fallback';
import { v1_libraryRecipe } from '@/lib/ai/prompts';
import { RecipeResult, type RecipeResultT } from '@/lib/ai/schemas';
import { rejectIfDeletingOrUnavailable } from '@/lib/account/deleting-fence';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const FIRST_BYTE_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 30_000;
const PRIMARY_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
const PROMPT_VERSION = 'v1_library_recipe';

const BodySchema = z
  .object({
    client_id: z.uuid(),
  })
  .strict();

interface LibraryRecipeItemRow {
  id: string;
  user_id: string;
  display_name: string;
  default_portion: number | null;
  default_unit: string | null;
  nutrition: unknown;
  recipe_eligibility: string | null;
  recipe_eligibility_reason: string | null;
  deleted_at?: string | null;
}

interface SavedRecipeRow {
  recipe: RecipeResultT;
  model?: string | null;
  prompt_version?: string | null;
  input_hash?: string | null;
}

function normalizeRecipeInput(item: LibraryRecipeItemRow): string {
  return JSON.stringify({
    id: item.id,
    display_name: item.display_name,
    default_portion: item.default_portion,
    default_unit: item.default_unit,
    nutrition: item.nutrition,
    recipe_eligibility_reason: item.recipe_eligibility_reason,
  });
}

async function persistRecipe(input: {
  supabase: Awaited<ReturnType<typeof getServerSupabase>>;
  userId: string;
  libraryItemId: string;
  recipe: RecipeResultT;
  model: string;
  inputHash: string;
}): Promise<boolean> {
  const { error } = (await input.supabase.from('food_library_recipes').upsert(
    {
      user_id: input.userId,
      library_item_id: input.libraryItemId,
      recipe: input.recipe,
      prompt_version: PROMPT_VERSION,
      model: input.model,
      input_hash: input.inputHash,
    },
    { onConflict: 'user_id,library_item_id' },
  )) as { error: { code?: string; message?: string } | null };

  if (!error) return true;

  Sentry.captureException(error, {
    tags: { component: 'library-recipe', scope: 'persist_recipe' },
    extra: { userId: input.userId, libraryItemId: input.libraryItemId, pgCode: error.code },
  });
  return false;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const idCheck = z.uuid().safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let parsed;
  try {
    parsed = BodySchema.safeParse((await request.json()) as unknown);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'ValidationError', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const fenced = await requireProfileOrJson401({ route: '/api/library/[id]/recipe' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  const fence = await rejectIfDeletingOrUnavailable(supabase, userId);
  if (fence) return fence;

  const { data: item, error: itemError } = (await supabase
    .from('food_library_items')
    .select(
      'id, user_id, display_name, default_portion, default_unit, nutrition, recipe_eligibility, recipe_eligibility_reason, deleted_at',
    )
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()) as {
    data: LibraryRecipeItemRow | null;
    error: { code?: string; message?: string } | null;
  };

  if (itemError) {
    Sentry.captureException(itemError, {
      tags: { component: 'library-recipe', scope: 'item_read' },
      extra: { userId, libraryItemId: id, pgCode: itemError.code },
    });
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: 'library_item_not_found' }, { status: 404 });
  }
  if (item.recipe_eligibility !== 'eligible') {
    return NextResponse.json(
      {
        error: 'recipe_ineligible',
        reason: item.recipe_eligibility_reason ?? item.recipe_eligibility ?? 'unknown',
      },
      { status: 409 },
    );
  }

  const normalizedInput = normalizeRecipeInput(item);
  const inputHash = computeCacheKey({
    callType: 'library-recipe',
    userId,
    normalizedInput,
  });

  const { data: saved, error: savedError } = (await supabase
    .from('food_library_recipes')
    .select('recipe, model, prompt_version, input_hash')
    .eq('user_id', userId)
    .eq('library_item_id', id)
    .maybeSingle()) as {
    data: SavedRecipeRow | null;
    error: { code?: string; message?: string } | null;
  };
  if (savedError) {
    Sentry.captureException(savedError, {
      tags: { component: 'library-recipe', scope: 'saved_read' },
      extra: { userId, libraryItemId: id, pgCode: savedError.code },
    });
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (saved?.recipe && saved.input_hash === inputHash && saved.prompt_version === PROMPT_VERSION) {
    return NextResponse.json(
      { recipe: saved.recipe, source: 'saved', persisted: true },
      { status: 200 },
    );
  }

  const start = Date.now();

  const hit = await cacheLookup<RecipeResultT>({
    callType: 'library-recipe',
    userId,
    normalizedInput,
  });
  if (hit.hit && hit.payload) {
    const recipe = RecipeResult.parse(hit.payload);
    await logAICall({
      userId,
      callType: 'library-recipe',
      inputHash,
      tokens: 0,
      costEstimate: 0,
      latencyMs: Date.now() - start,
      cachedFlag: true,
      clientId: parsed.data.client_id,
    });
    const persisted = await persistRecipe({
      supabase,
      userId,
      libraryItemId: id,
      recipe,
      model: 'cache',
      inputHash,
    });
    return NextResponse.json({ recipe, source: 'cache', persisted }, { status: 200 });
  }

  let billableTokens = 0;
  let billableCostEstimate = 0;
  try {
    const prompt = v1_libraryRecipe({
      item: {
        displayName: item.display_name,
        defaultPortion: item.default_portion,
        defaultUnit: item.default_unit,
        nutrition: item.nutrition,
        recipeEligibilityReason: item.recipe_eligibility_reason,
      },
    });
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
      geminiResult = await callGeminiWithFallback({
        prompt,
        fallbackPrompt: prompt,
        primaryModel: PRIMARY_MODEL,
        fallbackModel: getDefaultFallbackModel(),
        primaryAbortSignal: controller.signal,
        deadlineMs: start + TOTAL_TIMEOUT_MS,
      });
    } finally {
      clearTimeout(firstByteTimer);
      clearTimeout(totalTimer);
    }

    billableTokens = geminiResult.tokens;
    billableCostEstimate = geminiResult.costEstimate;
    const recipe = RecipeResult.parse(geminiResult.raw);

    await cacheWrite({
      callType: 'library-recipe',
      userId,
      normalizedInput,
      parsedPayload: recipe,
    });
    await logAICall({
      userId,
      callType: 'library-recipe',
      inputHash,
      tokens: billableTokens,
      costEstimate: billableCostEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });

    const persisted = await persistRecipe({
      supabase,
      userId,
      libraryItemId: id,
      recipe,
      model: geminiResult.usedFallback ? getDefaultFallbackModel() : PRIMARY_MODEL,
      inputHash,
    });

    return NextResponse.json({ recipe, source: 'generated', persisted }, { status: 200 });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'library-recipe' } });
    await logAICall({
      userId,
      callType: 'library-recipe',
      inputHash,
      tokens: billableTokens,
      costEstimate: billableCostEstimate,
      latencyMs: Date.now() - start,
      cachedFlag: false,
      clientId: parsed.data.client_id,
    });
    return NextResponse.json({ error: 'recipe_generation_failed' }, { status: 502 });
  }
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
