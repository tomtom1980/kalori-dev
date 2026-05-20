import { describe, expect, it } from 'vitest';

import { v1_foodParse, v1_visionFoodParse } from '@/lib/ai/prompts';

function promptText(payload: ReturnType<typeof v1_foodParse | typeof v1_visionFoodParse>) {
  const system = payload.systemInstruction.parts
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
  const contents = payload.contents
    .flatMap((content) => content.parts)
    .map((part) => ('text' in part ? part.text : ''))
    .join('\n');
  return `${system}\n${contents}`;
}

describe('AI prompts approxGrams contract', () => {
  it('text prompt asks for approxGrams on non-gram serving units', () => {
    const text = promptText(v1_foodParse({ userText: 'one bowl of pho' }));

    expect(text).toContain('"approxGrams"');
    expect(text).toMatch(/non-gram/i);
    expect(text).toMatch(/edible/i);
    expect(text).toMatch(/plausible/i);
    expect(text).toMatch(
      /low item confidence should lower "confidence", not suppress "approxGrams"/i,
    );
    expect(text).toMatch(/Do not include "approxGrams" for gram units/i);
  });

  it('vision prompt asks for approxGrams on non-gram serving units', () => {
    const text = promptText(v1_visionFoodParse({ userText: 'photo', imageBase64: 'AAAA' }));

    expect(text).toContain('"approxGrams"');
    expect(text).toMatch(/non-gram/i);
    expect(text).toMatch(/edible/i);
    expect(text).toMatch(/plausible/i);
    expect(text).toMatch(
      /low item confidence should lower "confidence", not suppress "approxGrams"/i,
    );
    expect(text).toMatch(/Do not include "approxGrams" for gram units/i);
  });

  it('text prompt requires English unit labels for localized inputs', () => {
    const text = promptText(v1_foodParse({ userText: '1 bát phở' }));

    expect(text).toMatch(/unit.*English/i);
    expect(text).toMatch(/never return localized unit words/i);
    expect(text).toMatch(/bowl/i);
    expect(text).toMatch(/glass/i);
    expect(text).toMatch(/slice/i);
  });
});
