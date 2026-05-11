/**
 * Gemini prompt factories (Task 3.2).
 *
 * Versioned pure-data factories that return the `contents` + `systemInstruction`
 * structure for `generateContent`. Named with a `v1_` prefix so a future prompt
 * revision can ship as `v2_foodParse` without breaking cached responses.
 *
 * F11 Layer 1: user text and profile context are SEPARATE parts in the
 * contents array; the system prompt is a distinct `systemInstruction`. NEVER
 * concatenate user text into the system prompt — any `` `${systemPrompt} ${userText}` ``
 * pattern is an F11 violation.
 */

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
  };
  readonly entryCount: number;
  readonly highlights: readonly string[];
}

export interface WeeklyReviewInputs {
  readonly weekStartOn: string;
  readonly recentEntries: readonly WeeklyReviewDailyTotals[];
}

/**
 * Literary-editor tone (The Ledger voice) — appears across all three
 * system prompts. The editor NEVER acts as a coach or gives medical advice.
 */
const LEDGER_VOICE =
  'You are a literary editor, not a coach. Parse food inputs with the precision of an archival clerk. Never give medical or weight-loss advice. Respond only with structured JSON that matches the schema.';

/**
 * Food-parse (text) system prompt. Output shape is strictly enforced by the
 * Zod `ParseResult` schema at the caller — this text just tells the model
 * which fields it must produce.
 */
const FOOD_PARSE_SYSTEM = `${LEDGER_VOICE}

Return a JSON object with this shape:
{
  "items": [
    {
      "name": string (max 200 chars),
      "portion": positive number,
      "unit": string (max 32 chars),
      "kcal": nonnegative number,
      "macros": {
        "protein_g": nonnegative number,
        "carbs_g": nonnegative number,
        "fat_g": nonnegative number,
        "fiber_g": nonnegative number
      },
      "micros": object (string-to-number map; may be empty),
      "confidence": number in [0, 1]
    }
  ],
  "reasoning": string (max 500 chars — keep terse and factual)
}

Before returning, run a portion sanity check for each item:
- Countable whole foods (sandwich, burger, taco, wrap, bánh mì, muffin, etc.) should use pieces/items/servings, not tiny gram amounts.
- Foods commonly weighed by mass (meat, fish, tofu, rice, pasta, cheese, etc.) may use grams, but the gram amount must be a plausible edible serving.
- Ice cream and similar foods may use scoops or grams; choose the unit that best matches the user wording.
- Never return impossible portions such as "1 g sandwich" or "1 g burger"; correct the unit/amount and mention the assumption in reasoning.

Do not wrap the JSON in markdown. Do not add commentary. Items MUST be an array (possibly empty). For ambiguous inputs, choose the most common Vietnamese or Western interpretation consistent with the caller's region hint.`;

const VISION_SYSTEM = `${LEDGER_VOICE}

You will receive a single food image. Identify each distinct dish or item.
Return JSON in the same shape as text-parse: items[] + reasoning.
Run the same portion sanity check as text-parse before returning: countable foods should not come back as tiny gram portions, weighed foods need plausible gram servings, and any assumption should be mentioned in reasoning.
If the photo is unclear, set confidence low and keep the items array short.`;

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
      `totals: kcal=${e.totals.kcal} protein_g=${e.totals.protein_g} carbs_g=${e.totals.carbs_g} fat_g=${e.totals.fat_g} fiber_g=${e.totals.fiber_g}`,
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
