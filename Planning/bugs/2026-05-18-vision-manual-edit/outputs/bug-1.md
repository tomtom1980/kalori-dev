# Bug 1 Output: Gemini vision recognition/model/schema

## Changed Files
- `app/api/ai/vision/route.ts`
- `lib/ai/client.ts`
- `lib/ai/fallback.ts`
- `tests/integration/ai-vision.test.ts`
- `tests/integration/ai-vn-fallback-runtime.test.ts`

## Implementation Summary
- Changed the vision route primary model selection to default to stable `gemini-2.5-flash`.
- Preserved explicit rollback overrides: `GEMINI_VISION_MODEL` wins when set, and `GEMINI_MODEL` is honored when it is explicitly set to a non-legacy model. The legacy shared alias `gemini-flash-latest` no longer keeps vision on the old default.
- Added a structured `generationConfig` for vision calls with `responseMimeType: application/json`, `maxOutputTokens`, and a `responseSchema` matching the existing `ParseResult` item/nutrition shape.
- Extended the Gemini client and fallback wrapper generation config types so schema config is forwarded through primary and fallback calls.
- Kept image payload handling intact: the request still sends the photo as a native Gemini `inlineData` part with MIME type and base64 data.
- Hardened the route so malformed Gemini parse output, empty recognition, or all very-low-confidence recognition returns the existing manual-entry fallback envelope instead of surfacing an opaque failure.

## Tests Added/Updated
- `tests/integration/ai-vision.test.ts`
  - Added default model regression coverage for `gemini-2.5-flash`.
  - Added explicit model override coverage.
  - Added Gemini-envelope success coverage proving `candidates[0].content.parts[0].text` JSON reaches parsed confirmation data.
  - Extended the inlineData request test to assert structured JSON schema config.
- `tests/integration/ai-vn-fallback-runtime.test.ts`
  - Updated the vision fallback runtime test to expect the new vision primary model.
  - Tightened the MSW primary matcher so `gemini-2.5-flash` does not accidentally catch the `gemini-2.5-flash-lite` fallback URL.

## Commands and Results
- RED: `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts`
  - Failed as expected before implementation: old `gemini-flash-latest` URL, missing structured schema/max tokens, and old fallback primary expectation.
- GREEN: `pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts`
  - Passed: 2 files, 20 tests.
- `pnpm exec prettier --check app/api/ai/vision/route.ts lib/ai/client.ts lib/ai/fallback.ts tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts`
  - Passed.
- `pnpm exec eslint app/api/ai/vision/route.ts lib/ai/client.ts lib/ai/fallback.ts tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts`
  - Passed.
- `pnpm typecheck`
  - Blocked by out-of-scope Bug 2/manual fallback workspace state: `ManualEntryFallback.tsx` is currently missing and imports from SnapTab/AddFoodTab/LogFlowTabs/tests fail. I did not touch or restore that file because it is owned by the other worker.

## Official Docs Context Used
- Google AI structured output docs/API reference: structured JSON output uses `responseMimeType: application/json` with a schema (`responseSchema`/JSON-schema variants depending on API surface).
- Google GenAI docs: Gemini `gemini-2.5-flash` is used for `generateContent`; image inputs are represented as image/inline data content parts.

## Risks
- The new schema asks Gemini for the full micronutrient key set. Runtime parsing was already prepared to fill missing micros with zero, but the model may spend more tokens producing the full object.
- Very-low-confidence threshold is intentionally conservative (`< 0.2`) to avoid discarding useful editable recognition. Borderline recognitions still reach confirmation data.
- Project-wide typecheck still needs Bug 2/manual fallback state resolved before a full clean verification sweep can pass.
