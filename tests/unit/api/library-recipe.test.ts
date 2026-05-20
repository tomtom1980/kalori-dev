/**
 * @vitest-environment node
 */
import { http, HttpResponse } from 'msw';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../mocks/server';

type Row = Record<string, unknown>;

const UID = 'u-1';
const ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const eligibleItem: Row = {
  id: ITEM_ID,
  user_id: UID,
  display_name: 'Pho Bo',
  default_portion: 1,
  default_unit: 'bowl',
  nutrition: { kcal: 520, macros: { protein_g: 32, carbs_g: 65, fat_g: 14, fiber_g: 3 } },
  recipe_eligibility: 'eligible',
  recipe_eligibility_reason: 'mixed_dish',
  deleted_at: null,
};

function recipePayload() {
  return {
    title: 'Pho Bo',
    servings: 2,
    total_time_minutes: 45,
    ingredients: ['rice noodles', 'beef', 'herbs'],
    steps: ['Simmer broth.', 'Cook noodles.', 'Assemble bowls.'],
    nutrition_note: 'Approximate nutrition varies by broth.',
    confidence: 0.84,
  };
}

function inputHashFor(item: Row = eligibleItem): string {
  const normalizedInput = JSON.stringify({
    id: item.id,
    display_name: item.display_name,
    default_portion: item.default_portion,
    default_unit: item.default_unit,
    nutrition: item.nutrition,
    recipe_eligibility_reason: item.recipe_eligibility_reason,
  });
  return createHash('sha256')
    .update(`library-recipe:${UID}:v3_recipe_eligibility:${normalizedInput}`)
    .digest('hex');
}

function setupMocks(
  opts: {
    item?: Row | null;
    savedRecipe?: Row | null;
    cacheHit?: Row | null;
    insertRecipeError?: { code?: string; message?: string } | null;
  } = {},
) {
  const item = opts.item === undefined ? eligibleItem : opts.item;
  const savedRecipe = opts.savedRecipe ?? null;
  const cacheHit = opts.cacheHit ?? null;
  const upsertRecipe = vi.fn(async () => ({ data: null, error: opts.insertRecipeError ?? null }));
  const aiLogInsert = vi.fn(async () => ({ data: null, error: null }));
  const cacheUpsert = vi.fn(async () => ({ data: null, error: null }));

  vi.doMock('server-only', () => ({}));
  vi.doMock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
  }));
  vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
    requireProfileOrJson401: async () => ({ user: { id: UID }, profile: { id: UID } }),
  }));
  vi.doMock('@/lib/account/deleting-fence', () => ({
    rejectIfDeletingOrUnavailable: async () => null,
  }));
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({
      from: (table: string) => {
        if (table === 'food_library_items') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: item, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'food_library_recipes') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: savedRecipe, error: null }),
                }),
              }),
            }),
            upsert: upsertRecipe,
          };
        }
        throw new Error(`unknown server table: ${table}`);
      },
    }),
  }));
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({
      from: (table: string) => {
        if (table === 'ai_response_cache') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: cacheHit,
                    error: cacheHit ? null : { code: 'PGRST116', message: 'none' },
                  }),
                }),
              }),
            }),
            upsert: cacheUpsert,
          };
        }
        if (table === 'ai_call_log') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: aiLogInsert,
          };
        }
        throw new Error(`unknown admin table: ${table}`);
      },
    }),
  }));

  return { upsertRecipe, aiLogInsert, cacheUpsert };
}

async function postRecipe(
  id = ITEM_ID,
  body: unknown = { client_id: CLIENT_ID },
): Promise<Response> {
  const { POST } = await import('@/app/api/library/[id]/recipe/route');
  return POST(
    new Request(`http://kalori.test/api/library/${id}/recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe('POST /api/library/[id]/recipe', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('server-only');
    vi.doUnmock('@sentry/nextjs');
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/account/deleting-fence');
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  it('returns saved recipe without logging or calling Gemini', async () => {
    const saved = {
      recipe: recipePayload(),
      model: 'gemini-2.5-flash',
      prompt_version: 'v1_library_recipe',
      input_hash: inputHashFor(),
    };
    const { aiLogInsert } = setupMocks({ savedRecipe: saved });
    let geminiCalls = 0;
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        return HttpResponse.json(recipePayload());
      }),
    );

    const res = await postRecipe();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; persisted: boolean; recipe: Row };
    expect(body.source).toBe('saved');
    expect(body.persisted).toBe(true);
    expect(body.recipe.title).toBe('Pho Bo');
    expect(geminiCalls).toBe(0);
    expect(aiLogInsert).not.toHaveBeenCalled();
  });

  it('regenerates and overwrites a saved recipe when the current input hash changed', async () => {
    const saved = {
      recipe: { ...recipePayload(), title: 'Old Pho' },
      model: 'gemini-2.5-flash',
      prompt_version: 'v1_library_recipe',
      input_hash: 'stale-input-hash',
    };
    const { upsertRecipe } = setupMocks({ savedRecipe: saved });
    let geminiCalls = 0;
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        return HttpResponse.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify(recipePayload()) }] } }],
          usageMetadata: { totalTokenCount: 123 },
        });
      }),
    );

    const res = await postRecipe();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; recipe: Row };
    expect(body.source).toBe('generated');
    expect(body.recipe.title).toBe('Pho Bo');
    expect(geminiCalls).toBe(1);
    expect(upsertRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        input_hash: inputHashFor(),
        recipe: expect.objectContaining({ title: 'Pho Bo' }),
      }),
      { onConflict: 'user_id,library_item_id' },
    );
  });

  it('rejects ineligible library items before cache or Gemini', async () => {
    const { aiLogInsert } = setupMocks({
      item: {
        ...eligibleItem,
        recipe_eligibility: 'ineligible',
        recipe_eligibility_reason: 'single_ingredient',
      },
    });
    const res = await postRecipe();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('recipe_ineligible');
    expect(aiLogInsert).not.toHaveBeenCalled();
  });

  it('uses cache hit, logs cached=true, persists the recipe, and avoids Gemini', async () => {
    const { upsertRecipe, aiLogInsert } = setupMocks({
      cacheHit: {
        parsed_payload: recipePayload(),
        expires_at: '2999-01-01T00:00:00.000Z',
        user_id: UID,
      },
    });
    let geminiCalls = 0;
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () => {
        geminiCalls += 1;
        return HttpResponse.json(recipePayload());
      }),
    );

    const res = await postRecipe();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; persisted: boolean };
    expect(body.source).toBe('cache');
    expect(body.persisted).toBe(true);
    expect(upsertRecipe).toHaveBeenCalledTimes(1);
    expect(geminiCalls).toBe(0);
    expect(aiLogInsert).toHaveBeenCalledWith(expect.objectContaining({ cached_flag: true }));
  });

  it('calls Gemini on miss, validates recipe, writes cache/log, persists recipe', async () => {
    const { upsertRecipe, aiLogInsert, cacheUpsert } = setupMocks();
    server.use(
      http.post('*generativelanguage.googleapis.com/*', async () =>
        HttpResponse.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify(recipePayload()) }] } }],
          usageMetadata: { totalTokenCount: 123 },
        }),
      ),
    );

    const res = await postRecipe();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; persisted: boolean; recipe: Row };
    expect(body.source).toBe('generated');
    expect(body.persisted).toBe(true);
    expect(body.recipe.steps).toHaveLength(3);
    expect(upsertRecipe).toHaveBeenCalledTimes(1);
    expect(cacheUpsert).toHaveBeenCalledTimes(1);
    expect(aiLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({ call_type: 'library-recipe', cached_flag: false, tokens: 123 }),
    );
  });
});
