/**
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — AI auto-detect alcohol
 * prompt contract.
 *
 * The text-parse and vision system prompts MUST instruct Gemini to set
 * `is_alcoholic` per item and, for alcoholic items, emit `volume_ml` and
 * `abv_percent`. The directive must include canonical-ABV / canonical-volume
 * defaults for common beverages (beer ~5%, wine ~12%, spirits ~40%), bounds
 * (`volume_ml` <= 5000, `abv_percent` <= 100), and an explicit prohibition on
 * tagging near-alcoholics (kombucha, near-beer, alcohol-free mocktails) as
 * alcoholic.
 *
 * Single-source-of-truth: the alcohol directive constant should be inlined
 * into both system prompts (mirroring `MICROS_DIRECTIVE`).
 */
import { describe, expect, it } from 'vitest';

import { v1_foodParse, v1_visionFoodParse } from '@/lib/ai/prompts';

function joinSystemText(payload: ReturnType<typeof v1_foodParse>): string {
  return payload.systemInstruction.parts.map((p) => ('text' in p ? p.text : '')).join('\n');
}

describe('AI alcohol-detection contract — food-parse system prompt', () => {
  const text = joinSystemText(v1_foodParse({ userText: 'beer' }));

  it('mentions is_alcoholic boolean per item', () => {
    expect(text).toMatch(/is_alcoholic/);
  });

  it('mentions volume_ml for alcoholic items', () => {
    expect(text).toMatch(/volume_ml/);
  });

  it('mentions abv_percent for alcoholic items', () => {
    expect(text).toMatch(/abv_percent/);
  });

  it('declares the upper bounds for volume_ml (<= 5000) and abv_percent (<= 100)', () => {
    expect(text).toMatch(/5000/);
    expect(text).toMatch(/100/);
  });

  it('provides canonical default ABVs for common beverages (beer ~5, wine ~12, spirits ~40)', () => {
    // The directive should give Gemini a fallback when the user says
    // "a beer" without specifying ABV.
    expect(text).toMatch(/beer/i);
    expect(text).toMatch(/wine/i);
    expect(text).toMatch(/spirit/i);
    expect(text).toMatch(/\b5\b/); // ~5% beer ABV
    expect(text).toMatch(/\b12\b/); // ~12% wine ABV
    expect(text).toMatch(/\b40\b/); // ~40% spirits ABV
  });

  it('prohibits flagging near-alcoholic drinks (kombucha, near-beer, mocktails) as alcoholic', () => {
    // The directive should explicitly call out at least one of these
    // false-positive guards so Gemini does not tag near-zero-ABV drinks
    // as alcoholic.
    expect(text).toMatch(/kombucha|near[-\s]?beer|mocktail|non[-\s]?alcoholic/i);
  });

  // Codex R1 I1 — `volume_ml` is per-serving, not total. The save route
  // multiplies by `item.portion` when aggregating into the alcohol_logs
  // row, so the prompt MUST instruct Gemini to emit a SINGLE-serving
  // volume (e.g. 355 for one beer can) rather than the total volume
  // ("two beers" = 710 ml). Without this clarification Gemini could
  // double-count by emitting 710 + portion=2 and silently multiply the
  // BAC math by 4×.
  it('clarifies that volume_ml is per single serving (not total volume consumed)', () => {
    expect(text).toMatch(/per[-\s]serving|per\s+single\s+serving|single\s+serving/i);
  });

  it('warns the model NOT to multiply volume_ml by portion (server does that)', () => {
    // The example "two beers → portion=2, volume_ml=355 (NOT 710)" is the
    // canonical disambiguator. Either the worded example or the "NOT"
    // phrasing should appear.
    expect(text).toMatch(/two\s+beers|three\s+shots|NOT\s+710|NOT\s+132/i);
  });
});

describe('AI alcohol-detection contract — vision system prompt', () => {
  const text = joinSystemText(
    v1_visionFoodParse({ userText: 'photo of beer', imageBase64: 'AAAA' }),
  );

  it('mentions is_alcoholic boolean per item', () => {
    expect(text).toMatch(/is_alcoholic/);
  });

  it('mentions volume_ml for alcoholic items', () => {
    expect(text).toMatch(/volume_ml/);
  });

  it('mentions abv_percent for alcoholic items', () => {
    expect(text).toMatch(/abv_percent/);
  });

  it('declares the upper bounds for volume_ml (<= 5000) and abv_percent (<= 100)', () => {
    expect(text).toMatch(/5000/);
    expect(text).toMatch(/100/);
  });

  it('provides canonical default ABVs for common beverages (beer ~5, wine ~12, spirits ~40)', () => {
    expect(text).toMatch(/beer/i);
    expect(text).toMatch(/wine/i);
    expect(text).toMatch(/spirit/i);
  });

  it('prohibits flagging near-alcoholic drinks as alcoholic', () => {
    expect(text).toMatch(/kombucha|near[-\s]?beer|mocktail|non[-\s]?alcoholic/i);
  });

  it('clarifies that volume_ml is per single serving (not total volume consumed)', () => {
    expect(text).toMatch(/per[-\s]serving|per\s+single\s+serving|single\s+serving/i);
  });

  it('warns the model NOT to multiply volume_ml by portion (server does that)', () => {
    expect(text).toMatch(/two\s+beers|three\s+shots|NOT\s+710|NOT\s+132/i);
  });
});
