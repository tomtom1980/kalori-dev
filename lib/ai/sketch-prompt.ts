/**
 * Gemini image-generation prompt factory — Bug 5 (library overhaul
 * 2026-05-16). Preamble updated in-place 2026-05-16 — user-directed
 * override toward a realistic, full-color food illustration style
 * (previously read as monochrome pencil sketches). Pre-existing
 * sketches are NOT regenerated (idempotency gate at
 * `sketch-pipeline.ts:232` short-circuits regeneration); only library
 * items inserted AFTER this change emit the new realistic style.
 *
 * Builds the sketch prompt for a single library item. Style preamble is
 * verbatim across every call so cross-batch sketches read as a coherent
 * set (consistency is the hard problem with non-deterministic image
 * models).
 *
 * Versioned as `v1_` so a later style refresh can ship as `v2_` without
 * cache-busting existing sketches. The current edit is treated as an
 * in-place preamble swap (no callers affected), so the export name
 * stays `v1_sketchPrompt`.
 *
 * Output spec: PNG via `inlineData.data` (base64) per the Gemini 2.5
 * Flash Image REST contract. The pipeline re-encodes to WEBP via sharp
 * before upload to fit the <50 KB thumbnail budget.
 */
export interface SketchPromptInputs {
  readonly displayName: string;
  /** Optional regional context to nudge style (e.g. Vietnamese vs Western). */
  readonly region?: 'vn' | 'western' | 'other';
  /**
   * Optional free-text description of the dish — either the user's
   * original input (text-log path) or the AI's parsing reasoning
   * (photo path). Gives Gemini concrete cues about ingredients,
   * portion size, and presentation beyond the bare display name.
   * Trimmed and capped to 500 chars before embedding into the prompt.
   */
  readonly description?: string | undefined;
}

export interface SketchPromptPayload {
  readonly contents: readonly {
    readonly role: 'user';
    readonly parts: readonly { readonly text: string }[];
  }[];
}

const STYLE_PREAMBLE =
  'A realistic, full-color illustration of the named food or drink. ' +
  'Naturalistic, lifelike colors that match the real-world appearance of the dish. ' +
  'Render in enough detail that the specific item is immediately recognizable — ' +
  'true-to-life shapes, textures, ingredients, and presentation. ' +
  'High-fidelity painterly illustration: close to a polished food-magazine rendering, ' +
  'not a sketch and not a photograph. ' +
  'Clean light background.';

function regionHint(region: SketchPromptInputs['region']): string {
  if (region === 'vn') return ' Regional context: Vietnamese cuisine.';
  if (region === 'western') return ' Regional context: Western cuisine.';
  return '';
}

const DESCRIPTION_CHAR_CAP = 500;

function descriptionHint(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const clipped =
    trimmed.length > DESCRIPTION_CHAR_CAP
      ? `${trimmed.slice(0, DESCRIPTION_CHAR_CAP).trimEnd()}…`
      : trimmed;
  // Quote the description so the model treats it as observational
  // context, not a fresh instruction overriding the style preamble.
  return ` Additional context about this dish: "${clipped}".`;
}

export function v1_sketchPrompt(input: SketchPromptInputs): SketchPromptPayload {
  const name = input.displayName.trim();
  const userText =
    `${STYLE_PREAMBLE} Subject: "${name}".` +
    `${descriptionHint(input.description)}${regionHint(input.region)}`;
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: userText }],
      },
    ],
  };
}
