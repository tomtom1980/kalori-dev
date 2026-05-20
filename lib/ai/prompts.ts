/**
 * Gemini prompt factories (Task 3.2 + Task C.1).
 *
 * Versioned pure-data factories that return the `contents` + `systemInstruction`
 * structure for `generateContent`. Named with a `v1_` prefix so a future prompt
 * revision can ship as `v2_foodParse` without breaking cached responses.
 *
 * F11 Layer 1: user text and profile context are SEPARATE parts in the
 * contents array; the system prompt is a distinct `systemInstruction`. NEVER
 * concatenate user text into the system prompt — any `` `${systemPrompt} ${userText}` ``
 * pattern is an F11 violation.
 *
 * Task C.1 — `FOOD_PARSE_SYSTEM` tightens the `micros` directive by
 * enumerating the canonical 30 keys from `DEFAULT_MICROS_LIST`. The list
 * is concatenated at module-load time (no per-call rebuild) and inherited
 * by VISION_SYSTEM via the shared MICROS_DIRECTIVE constant, so all four
 * payload factories (text + vision, primary + VN fallback) ship the same
 * single-source-of-truth contract to Gemini.
 */
import type { ParseResultT } from '@/lib/ai/schemas';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';
import { sanitizeStringArray } from '@/lib/ai/sanitize';
import type { NutritionSummaryContext } from '@/lib/aggregations/summary-context';

/**
 * Native Gemini prompt part. Either a text part OR an inlineData part per
 * the REST API contract (`contents[].parts[].text` or
 * `contents[].parts[].inlineData: {mimeType, data}`). The client wrapper
 * forwards either shape unchanged to the REST body — no flattening to
 * text — so vision calls land with a real image payload.
 */
export interface TextPart {
  readonly text: string;
}

export interface InlineDataPart {
  readonly inlineData: {
    readonly mimeType: string;
    readonly data: string;
  };
}

export type PromptPart = TextPart | InlineDataPart;

export interface PromptPayload {
  readonly systemInstruction: { readonly parts: readonly PromptPart[] };
  readonly contents: readonly {
    readonly role: 'user' | 'model';
    readonly parts: readonly PromptPart[];
  }[];
}

export interface FoodParseInputs {
  readonly userText: string;
  readonly region?: 'vn' | 'western' | 'other';
  readonly dietaryPrefs?: readonly string[];
  readonly allergens?: readonly string[];
}

export interface VisionFoodParseInputs extends FoodParseInputs {
  readonly imageBase64: string;
  readonly mimeType?: string;
}

const DEFAULT_VISION_MIME_TYPE = 'image/jpeg';

export interface WeeklyReviewDailyTotals {
  readonly date: string;
  readonly totals: {
    readonly kcal: number;
    readonly protein_g: number;
    readonly carbs_g: number;
    readonly fat_g: number;
    readonly fiber_g: number;
    // Cholesterol (mg/day). Optional for backward-compat with any callers
    // that pre-date the 5th-macro extension — formatter defaults to 0
    // when absent so the prompt line shape stays stable.
    readonly cholesterol_mg?: number;
  };
  readonly entryCount: number;
  readonly highlights: readonly string[];
}

export interface WeeklyReviewInputs {
  readonly weekStartOn: string;
  readonly recentEntries: readonly WeeklyReviewDailyTotals[];
}

export interface LibraryRecipeInputs {
  readonly item: {
    readonly displayName: string;
    readonly defaultPortion?: number | null;
    readonly defaultUnit?: string | null;
    readonly nutrition: unknown;
    readonly recipeEligibilityReason?: string | null;
  };
}

/**
 * Literary-editor tone (The Ledger voice) — appears across all three
 * system prompts. The editor NEVER acts as a coach or gives medical advice.
 */
const LEDGER_VOICE =
  'You are a literary editor, not a coach. Parse food inputs with the precision of an archival clerk. Never give medical or weight-loss advice. Respond only with structured JSON that matches the schema.';

/**
 * Task C.1 — canonical micronutrient enumeration. The Gemini food-parse
 * and vision prompts both require the model to return a `micros` object
 * keyed by every code in `DEFAULT_MICROS_LIST` (no extra keys, no missing
 * keys). The directive is built at module load so the runtime cost is one
 * string join per process boot. Single source of truth: changes to the
 * constant cascade automatically to every prompt variant.
 *
 * Codex R1 Finding 2 (HIGH) fix: the directive previously sat INSIDE the
 * JSON shape exemplar (between `macros` and `confidence`), which made the
 * exemplar malformed — no trailing comma, free prose mid-object. Under
 * Gemini drift the model could read the directive as a continuation of
 * the next field. Split: the JSON shape exemplar now shows `micros` as a
 * valid nested-object slot referencing the directive, and the directive
 * itself is rendered as separate guidance text BELOW the shape block.
 */
const MICROS_KEY_LIST = DEFAULT_MICROS_LIST.map((m) => `"${m.code}" (${m.unit})`).join(', ');
const MICROS_DIRECTIVE = `The "micros" field is REQUIRED on every item. Return EVERY one of these canonical keys as a nonnegative number in the declared unit; emit 0 (zero) when the food contributes none of that micronutrient: ${MICROS_KEY_LIST}. Do NOT add keys outside this set. Do NOT omit any key. Do NOT use unknown data as a reason to zero every micronutrient. For any substantial food or mixed food, an all-zero micros object is invalid unless the food truly contributes no micronutrients. When exact reference data is unavailable, estimate ingredient-based micronutrients from the visible or named components and portion size, then state the assumption briefly in reasoning.`;

/**
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — alcohol detection
 * contract. Replaces the previous manual AlcoholControls UI in the
 * confirmation flow: Gemini now detects whether each parsed item is an
 * alcoholic beverage and, if so, emits the canonical volume + ABV
 * needed for server-side `calculateAlcoholGrams` math at
 * `lib/alcohol/bac.ts:27`.
 *
 * Single-source-of-truth: the directive is inlined into both
 * FOOD_PARSE_SYSTEM and VISION_SYSTEM (mirroring MICROS_DIRECTIVE), so
 * any future tweak (canonical-ABV adjustment, new beverage class,
 * tightened bound) cascades to every prompt variant automatically.
 *
 * Output shape per item:
 *   { is_alcoholic: boolean, volume_ml?: number, abv_percent?: number }
 *
 * Bounds (also enforced by the Zod schema at lib/ai/schemas.ts and the
 * save-route Zod schema at app/api/entries/save/route.ts — three-layer
 * defense): volume_ml in (0, 5000], abv_percent in (0, 100].
 *
 * False-positive guard: kombucha, near-beer, alcohol-free wine,
 * mocktails, and other near-zero-ABV drinks are explicitly forbidden
 * from is_alcoholic=true, because tagging them would push spurious
 * grams into the BAC tracker.
 */
const ALCOHOL_DETECTION_DIRECTIVE = `Alcohol detection contract: for every item, set "is_alcoholic" (boolean). When "is_alcoholic": true, also emit "volume_ml" (positive number, max 5000) and "abv_percent" (positive number, max 100). Omit "volume_ml" and "abv_percent" when "is_alcoholic": false. PER-SERVING SEMANTICS: "volume_ml" is the volume of a SINGLE serving / single unit (one can, one bottle, one glass, one shot) — it is NOT the total volume consumed. The server multiplies "volume_ml" by "portion" downstream. Example: for "two beers" emit portion=2, unit="can", volume_ml=355 (NOT 710). For "three shots of whisky" emit portion=3, unit="shot", volume_ml=44 (NOT 132). Extract volume_ml from explicit user wording when present (e.g. "330 ml beer" → 330, "a pint of lager" → 473, "glass of wine" → 150, "shot of whisky" → 44). When the user does not state a volume, use canonical serving sizes (beer can ≈ 355, beer pint ≈ 473, wine glass ≈ 150, spirits shot ≈ 44). Extract abv_percent from the user when explicit (e.g. "11% IPA" → 11); otherwise use canonical defaults by beverage type (lager / pale ale ≈ 5, IPA ≈ 6.5, white wine ≈ 12, red wine ≈ 13.5, fortified wine ≈ 17, sake ≈ 15, soju ≈ 17, spirits / whisky / vodka / gin / rum / tequila ≈ 40). NEVER set "is_alcoholic": true for kombucha, near-beer / 0.5% beer (unless the user explicitly says so), non-alcoholic / NA beer, alcohol-free wine, mocktails, kvass, root beer, or any "alcohol-free" beverage. Only set "is_alcoholic": true when the beverage is unambiguously alcoholic. Hard bounds — volume_ml must be in the range (0, 5000] and abv_percent must be in the range (0, 100]; clamp to the bound and note the assumption in reasoning if the user describes an impossible combo.`;
const UNIT_LANGUAGE_DIRECTIVE = `Unit language contract: every "unit" value must be an English serving, mass, or container label such as "g", "ml", "piece", "slice", "bowl", "cup", "glass", "serving", "can", "bottle", "scoop", or "plate". Food names may stay cuisine-appropriate, but never return localized unit words from the source text.`;

/**
 * Food-parse (text) system prompt. Output shape is strictly enforced by the
 * Zod `ParseResult` schema at the caller — this text just tells the model
 * which fields it must produce.
 *
 * The JSON exemplar inside the prompt is kept syntactically valid (every
 * field comma-terminated, micros rendered as a real nested object). The
 * canonical micros key enumeration lives in `MICROS_DIRECTIVE` immediately
 * below the shape block, so the model sees both pieces but they're not
 * tangled together.
 *
 * Codex R2 MEDIUM 3 fix: the previous revision used a JS-style block
 * comment inside the exemplar as a placeholder. JSON does not allow
 * comments — under Gemini drift the model might propagate the
 * pseudo-comment verbatim, producing an unparseable response. The
 * exemplar now ships a small valid-JSON sample (2-3 canonical keys with
 * representative numeric values) so the model sees a real, parseable
 * shape, and the full 30-key contract is enforced by the directive
 * paragraph below the shape block.
 */
const FOOD_PARSE_SYSTEM = `${LEDGER_VOICE}

Return a JSON object with this shape:
{
  "items": [
    {
      "name": string (max 200 chars),
      "portion": positive number,
      "unit": string (max 32 chars),
      "approxGrams": positive number when unit is non-gram; omit when unit is grams,
      "kcal": nonnegative number,
      "macros": {
        "protein_g": nonnegative number,
        "carbs_g": nonnegative number,
        "fat_g": nonnegative number,
        "fiber_g": nonnegative number,
        "cholesterol_mg": nonnegative number
      },
      "micros": { "vitamin_c": 80, "calcium": 1000, "iron": 18 },
      "recipeEligible": boolean (true only for mixed dishes or foods where a useful home recipe can be generated),
      "recipeEligibilityReason": string (max 240 chars; short reason such as "mixed_dish", "single_ingredient", "packaged_food", or "unclear"),
      "confidence": number in [0, 1],
      "is_alcoholic": boolean (true ONLY for unambiguously alcoholic beverages; see Alcohol detection contract below),
      "volume_ml": positive number when is_alcoholic=true; omit otherwise,
      "abv_percent": positive number when is_alcoholic=true; omit otherwise
    }
  ],
  "reasoning": string (max 500 chars — keep terse and factual)
}

The "micros" field above shows three illustrative keys; the full contract requires every canonical code listed in the next paragraph.

Macros unit contract: protein_g, carbs_g, fat_g, fiber_g are in grams. cholesterol_mg is dietary cholesterol in milligrams (mg), 0 if absent or unknown.

${UNIT_LANGUAGE_DIRECTIVE}

Approximate gram contract: when an item's serving unit is non-gram (piece, serving, cup, bowl, scoop, etc.), include "approxGrams" whenever you can give a plausible edible food weight for the returned portion and named food. Do not include "approxGrams" for gram units. Low item confidence should lower "confidence", not suppress "approxGrams"; omit "approxGrams" only when the edible weight is genuinely unknowable.

Recipe eligibility contract: return "recipeEligible": true for mixed dishes, prepared meals, or recognizable foods where a useful home recipe can be generated. Return false for raw single ingredients, branded packaged foods, drinks, supplements, unclear items, or items that should not be reconstructed as recipes. Always include a terse "recipeEligibilityReason" when confidence allows.

Micros contract: ${MICROS_DIRECTIVE}

${ALCOHOL_DETECTION_DIRECTIVE}

Before returning, run a portion sanity check for each item:
- Countable whole foods (sandwich, burger, taco, wrap, bánh mì, muffin, etc.) should use pieces/items/servings, not tiny gram amounts.
- Foods commonly weighed by mass (meat, fish, tofu, rice, pasta, cheese, etc.) may use grams, but the gram amount must be a plausible edible serving.
- Ice cream and similar foods may use scoops or grams; choose the unit that best matches the user wording.
- Never return impossible portions such as "1 g sandwich" or "1 g burger"; correct the unit/amount and mention the assumption in reasoning.

Do not wrap the JSON in markdown. Do not add commentary. Items MUST be an array (possibly empty). For ambiguous inputs, choose the most common Vietnamese or Western interpretation consistent with the caller's region hint.`;

const VISION_SYSTEM = `${LEDGER_VOICE}

You will receive a single food image. Identify each distinct dish or item.

Macros unit contract: every item's "macros" object MUST include protein_g, carbs_g, fat_g, fiber_g (all in grams) and cholesterol_mg (dietary cholesterol in milligrams (mg), 0 if absent or unknown).

Micros contract: ${MICROS_DIRECTIVE}

${UNIT_LANGUAGE_DIRECTIVE}

Approximate gram contract: for every item whose serving unit is non-gram (piece, serving, cup, bowl, scoop, etc.), include "approxGrams" whenever you can give a plausible edible food weight for the returned portion and named food. Do not include "approxGrams" for gram units. Low item confidence should lower "confidence", not suppress "approxGrams"; omit "approxGrams" only when the edible weight is genuinely unknowable.

Return a JSON object with this shape:
{
  "items": [
    {
      "name": string (max 200 chars),
      "portion": positive number,
      "unit": string (max 32 chars),
      "approxGrams": positive number when unit is non-gram; omit when unit is grams,
      "kcal": nonnegative number,
      "macros": {
        "protein_g": nonnegative number,
        "carbs_g": nonnegative number,
        "fat_g": nonnegative number,
        "fiber_g": nonnegative number,
        "cholesterol_mg": nonnegative number
      },
      "micros": { "vitamin_c": 80, "calcium": 1000, "iron": 18 },
      "recipeEligible": boolean (true only for mixed dishes or foods where a useful home recipe can be generated),
      "recipeEligibilityReason": string (max 240 chars; short reason such as "mixed_dish", "single_ingredient", "packaged_food", or "unclear"),
      "confidence": number in [0, 1],
      "is_alcoholic": boolean (true ONLY for unambiguously alcoholic beverages; see Alcohol detection contract below),
      "volume_ml": positive number when is_alcoholic=true; omit otherwise,
      "abv_percent": positive number when is_alcoholic=true; omit otherwise
    }
  ],
  "reasoning": string (max 500 chars — keep terse and factual)
}

The "micros" field above shows three illustrative values; emit every canonical key listed in the Micros contract above.

Recipe eligibility contract: return "recipeEligible": true for mixed dishes, prepared meals, or recognizable foods where a useful home recipe can be generated. Return false for raw single ingredients, branded packaged foods, drinks, supplements, unclear items, or items that should not be reconstructed as recipes. Always include a terse "recipeEligibilityReason" when confidence allows.

${ALCOHOL_DETECTION_DIRECTIVE}

Run the same portion sanity check as text-parse before returning: countable foods should not come back as tiny gram portions, weighed foods need plausible gram servings, and any assumption should be mentioned in reasoning.
If the photo is unclear, set confidence low and keep the items array short.

Do not wrap the JSON in markdown code fences. Do not add commentary or explanations outside the JSON. Items MUST be a (possibly empty) array. Field names are literal — use exactly "name", "portion", "unit", "kcal", "macros", "micros", "confidence" for items and "reasoning" at the top level. Do not substitute alternates like "food_name", "food", "dish", "quantity", "calories", or "analysis".`;

/**
 * F-UI-3.6-A-4 (Task 4.7.6) — VN-tuned fallback prompt prelude. Appended to
 * the food-parse and vision system prompts when `callGeminiWithFallback`
 * fires the secondary call. Output shape unchanged so `ParseResult` Zod
 * parse is reused — only the model's interpretive bias shifts toward
 * Vietnamese cuisine recognition.
 */
const VN_FALLBACK_PRELUDE = `

The user input may contain Vietnamese diacritics or Vietnamese dish names. If you see Vietnamese characters, dish names from the Vietnamese culinary tradition (phở, bún, bánh mì, cơm tấm, chả giò, gỏi cuốn, cá kho, bún chả, hủ tiếu, mì quảng, etc.), or Vietnamese cooking terms, recognize them as Vietnamese cuisine and use common Vietnamese nutrition references for portion + macro estimates. Prefer the Vietnamese interpretation over the English homonym when ambiguous (e.g., "pho" defaults to Vietnamese phở, not a Western "faux" reading). Mixed Vietnamese + English inputs should still parse the English items correctly — VN-preference is for ambiguous tokens only.`;

const FOOD_PARSE_VN_FALLBACK_SYSTEM = `${FOOD_PARSE_SYSTEM}${VN_FALLBACK_PRELUDE}`;
const VISION_VN_FALLBACK_SYSTEM = `${VISION_SYSTEM}${VN_FALLBACK_PRELUDE}`;

const FOOD_PARSE_MICROS_REPAIR_SYSTEM = `${LEDGER_VOICE}

Repair only the micronutrient estimates in a previously parsed food JSON result.

Micros contract: ${MICROS_DIRECTIVE}

The prior result returned all-zero micros for at least one substantial or mixed food. Keep the same items, names, portions, units, calories, macros, and confidence unless a field is impossible. Replace all-zero micros with plausible ingredient-based estimates when exact data is unavailable. Return the complete JSON object in the same shape as text-parse. Do not wrap the JSON in markdown.`;

const WEEKLY_REVIEW_SYSTEM = `${LEDGER_VOICE}

You will receive a 7-day food-log aggregate (one entry per logged day, each
carrying daily totals and a short list of highlighted items). Produce a
weekly editorial review.

Return a JSON object with exactly this shape (no extra keys, no markdown
fences):
{
  "body_markdown": string (<=8000 chars; literary editorial prose in Markdown;
    one or two paragraphs; reference Vietnamese or Western patterns observed),
  "sparse_data": boolean (true only if the aggregate reflects so few logged
    days that a faithful review is impossible)
}

Never fabricate days that are not present in the input. Never give medical
or weight-loss advice. Do not wrap the JSON in markdown.`;

const NUTRITION_SUMMARY_SYSTEM = `${LEDGER_VOICE}

You will receive a structured nutrition summary context for either one
dashboard day or a selected progress range. Analyze the logged data against
the user's goals and return useful, specific feedback.

Return a JSON object with exactly this shape (no extra keys, no markdown
fences):
{
  "body_markdown": string (<=8000 chars; 3-5 concrete paragraphs in Markdown),
  "bullets": string[] (4-6 short next actions),
  "caveats": string[] (0-6 missing-data caveats)
}

Sparse but nonempty data is valid input. Never say "not enough items logged"
when any food, water, or weight data exists. Use only supplied data: do not
invent meals, foods, weights, targets, or days. For dashboard-day requests,
analyze the selected date exactly as shown by the date picker. For progress
ranges, handle last_7, last_30, and custom ranges by comparing logged-day
averages, missing-day count, strongest logged day, weakest logged day, and the
supplied target gaps. When present, explicitly compare calories, protein,
fiber, cholesterol, water, and weight context against the supplied targets or
recent values.

Every paragraph and bullet must be data-based: include at least one number,
date, logged food name, target gap, or missing category from the context.
Each next-action bullet must include a concrete food or meal example anchored
to the observed gap, such as a protein breakfast, fiber side, lower-cholesterol
swap, or water timing. Prefer examples that fit the logged foods when possible
(for example, build around a logged chicken rice lunch rather than saying
"eat healthier"). Explicitly avoid generic advice such as "make better choices" or
"log more" unless you name the exact missing day, meal, or category. Empty
ranges are handled by the application before this prompt, so do not invent
data. Never give medical advice.`;

const LIBRARY_RECIPE_SYSTEM = `${LEDGER_VOICE}

Generate a practical home-cooking recipe for a saved food-library item.

Return a JSON object with exactly this shape (no extra keys, no markdown fences):
{
  "title": string (<=120 chars),
  "servings": integer from 1 to 24,
  "total_time_minutes": integer from 1 to 480, or null when unknown,
  "ingredients": string[] (1-40 concise ingredient lines),
  "steps": string[] (1-20 concise cooking steps),
  "nutrition_note": string or null (<=500 chars; brief note about how nutrition may vary),
  "confidence": number in [0, 1]
}

Keep the recipe UI-friendly: clear ingredient quantities when possible, imperative steps, no medical advice, no markdown, no commentary outside JSON. Use the saved serving and nutrition only as context; do not claim exact nutrition.`;

/**
 * Format the user-context parts array for the parse prompts. Region +
 * dietary preferences + allergens are SEPARATE parts (not concatenated
 * into the system prompt). If none are provided, the parts array is
 * just the user text.
 */
function buildUserParts(
  userText: string,
  region: FoodParseInputs['region'],
  dietaryPrefs: readonly string[] | undefined,
  allergens: readonly string[] | undefined,
): readonly TextPart[] {
  const parts: TextPart[] = [{ text: userText }];
  if (region) parts.push({ text: `region: ${region}` });
  if (dietaryPrefs && dietaryPrefs.length > 0) {
    parts.push({ text: `dietary_prefs: ${dietaryPrefs.join(', ')}` });
  }
  if (allergens && allergens.length > 0) {
    parts.push({ text: `allergens: ${allergens.join(', ')}` });
  }
  return parts;
}

/**
 * Split a base64 image payload into mimeType + data. Handles both raw base64
 * and `data:<mime>;base64,<data>` URI forms; client should send raw, this is
 * defence-in-depth so the Gemini REST body always has a proper mimeType.
 */
function splitBase64(base64: string, fallbackMime: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(base64);
  if (match) {
    return { mimeType: match[1] ?? fallbackMime, data: match[2] ?? '' };
  }
  return { mimeType: fallbackMime, data: base64 };
}

export function v1_foodParse(inputs: FoodParseInputs): PromptPayload {
  return {
    systemInstruction: { parts: [{ text: FOOD_PARSE_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: buildUserParts(
          inputs.userText,
          inputs.region,
          inputs.dietaryPrefs,
          inputs.allergens,
        ),
      },
    ],
  };
}

/**
 * F-UI-3.6-A-4 (Task 4.7.6) — VN-tuned text fallback prompt. Same shape
 * as `v1_foodParse` but with the Vietnamese-recognition prelude appended
 * to the system instruction. Used by `callGeminiWithFallback` when the
 * primary `gemini-flash-latest` call throws.
 */
export function v1_foodParseVnFallback(inputs: FoodParseInputs): PromptPayload {
  return {
    systemInstruction: { parts: [{ text: FOOD_PARSE_VN_FALLBACK_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: buildUserParts(
          inputs.userText,
          inputs.region,
          inputs.dietaryPrefs,
          inputs.allergens,
        ),
      },
    ],
  };
}

export function v1_foodParseMicrosRepair(inputs: {
  readonly userText: string;
  readonly priorResult: ParseResultT;
  readonly region?: FoodParseInputs['region'];
}): PromptPayload {
  const parts: TextPart[] = [
    { text: `original_user_text: ${inputs.userText}` },
    { text: `prior_json: ${JSON.stringify(inputs.priorResult)}` },
  ];
  if (inputs.region) parts.push({ text: `region: ${inputs.region}` });

  return {
    systemInstruction: { parts: [{ text: FOOD_PARSE_MICROS_REPAIR_SYSTEM }] },
    contents: [{ role: 'user', parts }],
  };
}

export function v1_visionFoodParse(inputs: VisionFoodParseInputs): PromptPayload {
  // F11 Layer 1 compliance: the image rides in a DEDICATED `inlineData` part
  // alongside the (optional) text descriptor + region/dietary/allergen hints.
  // NEVER concatenated into the text; this is how real Gemini Vision accepts
  // payloads, and it keeps user image + user text as distinct roles that the
  // model can reason about without prompt-injection surface on the image.
  const descriptorParts = buildUserParts(
    inputs.userText.length > 0 ? inputs.userText : 'photo of food',
    inputs.region,
    inputs.dietaryPrefs,
    inputs.allergens,
  );
  const { mimeType, data } = splitBase64(
    inputs.imageBase64,
    inputs.mimeType ?? DEFAULT_VISION_MIME_TYPE,
  );
  const imagePart: InlineDataPart = {
    inlineData: { mimeType, data },
  };
  return {
    systemInstruction: { parts: [{ text: VISION_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [...descriptorParts, imagePart],
      },
    ],
  };
}

/**
 * F-UI-3.6-A-4 (Task 4.7.6) — VN-tuned vision fallback prompt. Same shape
 * as `v1_visionFoodParse` (image inlineData + descriptor parts) but with
 * the Vietnamese-recognition prelude appended to the system instruction.
 */
export function v1_visionFoodParseVnFallback(inputs: VisionFoodParseInputs): PromptPayload {
  const descriptorParts = buildUserParts(
    inputs.userText.length > 0 ? inputs.userText : 'photo of food',
    inputs.region,
    inputs.dietaryPrefs,
    inputs.allergens,
  );
  const { mimeType, data } = splitBase64(
    inputs.imageBase64,
    inputs.mimeType ?? DEFAULT_VISION_MIME_TYPE,
  );
  const imagePart: InlineDataPart = {
    inlineData: { mimeType, data },
  };
  return {
    systemInstruction: { parts: [{ text: VISION_VN_FALLBACK_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [...descriptorParts, imagePart],
      },
    ],
  };
}

export function v1_weeklyReview(inputs: WeeklyReviewInputs): PromptPayload {
  // Each daily entry is attached as a distinct part — keeps the structured
  // shape visible to Gemini and avoids any single-string concatenation that
  // would blunt F11 Layer 1.
  const dailyParts: PromptPart[] = inputs.recentEntries.map((e) => ({
    text: [
      `date: ${e.date}`,
      `entries_count: ${e.entryCount}`,
      `totals: kcal=${e.totals.kcal} protein_g=${e.totals.protein_g} carbs_g=${e.totals.carbs_g} fat_g=${e.totals.fat_g} fiber_g=${e.totals.fiber_g} cholesterol_mg=${e.totals.cholesterol_mg ?? 0}`,
      e.highlights.length > 0 ? `highlights: ${e.highlights.join('; ')}` : 'highlights: none',
    ].join('\n'),
  }));
  return {
    systemInstruction: { parts: [{ text: WEEKLY_REVIEW_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: `week_start_on: ${inputs.weekStartOn}` },
          { text: `logged_days: ${inputs.recentEntries.length}` },
          ...dailyParts,
        ],
      },
    ],
  };
}

export function v1_libraryRecipe(inputs: LibraryRecipeInputs): PromptPayload {
  const item = inputs.item;
  return {
    systemInstruction: { parts: [{ text: LIBRARY_RECIPE_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: `display_name: ${item.displayName}` },
          {
            text: `default_serving: ${JSON.stringify({
              portion: item.defaultPortion ?? null,
              unit: item.defaultUnit ?? null,
            })}`,
          },
          { text: `nutrition_context: ${JSON.stringify(item.nutrition)}` },
          { text: `recipe_eligibility_reason: ${item.recipeEligibilityReason ?? 'eligible'}` },
        ],
      },
    ],
  };
}

function sanitizeSummaryContext(input: NutritionSummaryContext): NutritionSummaryContext {
  return {
    ...input,
    food: {
      ...input.food,
      highlights: sanitizeStringArray(input.food.highlights),
      daily: input.food.daily.map((day) => ({
        ...day,
        highlights: sanitizeStringArray(day.highlights),
      })),
    },
    caveats: sanitizeStringArray(input.caveats),
  };
}

function summaryDayCount(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function summaryRound(value: number): number {
  return Math.round(value * 10) / 10;
}

function gap(target: number | null, actual: number): number | null {
  return target !== null && target > 0 ? summaryRound(target - actual) : null;
}

function deriveNutritionSummaryMetrics(context: NutritionSummaryContext) {
  const totalDays = summaryDayCount(context.range.start_on, context.range.end_on);
  const loggedDays = Math.max(context.food.logged_days, 1);
  const daily = context.food.daily;
  const byKcal = [...daily].sort((a, b) => b.totals.kcal - a.totals.kcal);
  const strongest = byKcal[0] ?? null;
  const weakest = byKcal.length > 0 ? byKcal[byKcal.length - 1] : null;
  const avgKcal = context.food.totals.kcal / loggedDays;
  const avgProtein = context.food.totals.protein_g / loggedDays;
  const avgFiber = context.food.totals.fiber_g / loggedDays;
  const avgCholesterol = context.food.totals.cholesterol_mg / loggedDays;

  return {
    total_days: totalDays,
    logged_food_days: context.food.logged_days,
    missing_day_count: context.food.missing_days.length,
    avg_kcal_per_logged_day: summaryRound(avgKcal),
    avg_protein_g_per_logged_day: summaryRound(avgProtein),
    avg_fiber_g_per_logged_day: summaryRound(avgFiber),
    avg_cholesterol_mg_per_logged_day: summaryRound(avgCholesterol),
    calorie_gap_per_logged_day: gap(context.profile.calorie_target, avgKcal),
    protein_gap_g_per_logged_day: gap(context.profile.protein_target_g, avgProtein),
    fiber_gap_g_per_logged_day: gap(context.profile.fiber_target_g, avgFiber),
    cholesterol_gap_mg_per_logged_day: gap(context.profile.cholesterol_target_mg, avgCholesterol),
    water_gap_ml_for_range: gap(
      context.water.target_ml * Math.max(totalDays, 1),
      context.water.total_ml,
    ),
    strongest_logged_day_by_kcal: strongest
      ? {
          date: strongest.date,
          kcal: strongest.totals.kcal,
          highlights: strongest.highlights,
        }
      : null,
    weakest_logged_day_by_kcal: weakest
      ? {
          date: weakest.date,
          kcal: weakest.totals.kcal,
          highlights: weakest.highlights,
        }
      : null,
  };
}

export function v1_nutritionSummary(input: NutritionSummaryContext): PromptPayload {
  const context = sanitizeSummaryContext(input);
  return {
    systemInstruction: { parts: [{ text: NUTRITION_SUMMARY_SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `range: ${JSON.stringify({
              scope: context.scope,
              range: context.range,
              timezone: context.timezone,
            })}`,
          },
          { text: `profile_and_goals: ${JSON.stringify(context.profile)}` },
          {
            text: `food_totals_and_days: ${JSON.stringify({
              entry_count: context.food.entry_count,
              logged_days: context.food.logged_days,
              missing_days: context.food.missing_days,
              totals: context.food.totals,
              highlights: context.food.highlights,
              daily: context.food.daily,
            })}`,
          },
          { text: `derived_metrics: ${JSON.stringify(deriveNutritionSummaryMetrics(context))}` },
          { text: `water_totals: ${JSON.stringify(context.water)}` },
          { text: `weight_trend: ${JSON.stringify(context.weight)}` },
          {
            text: `caveats: ${JSON.stringify([
              ...context.caveats,
              'summarize available data; mention missing days/meals; compare available data to goals; recommend next logs/actions',
            ])}`,
          },
        ],
      },
    ],
  };
}
