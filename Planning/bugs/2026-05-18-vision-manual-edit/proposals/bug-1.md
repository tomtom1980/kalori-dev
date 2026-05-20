# Bug 1: Vision recognition falls back instead of parsing food photos
## Classification
needs_debug_shallow

## Root Cause
The camera/upload client path is sending a proper image payload: `SnapTab` compresses the selected image, strips the data-URL prefix, sends `imageBase64` plus `mimeType`, and `v1_visionFoodParse` forwards it to Gemini as a native `inlineData` part. The weak point is server-side model/output configuration: `app/api/ai/vision/route.ts` still defaults the primary model to the older `gemini-flash-latest` alias, while the current Google AI docs context for this batch identifies stable `gemini-2.5-flash` as image-input capable with structured output support. The route also requests JSON MIME only, without a `responseSchema`; if Gemini returns prose, partial JSON, or fields that drift from `ParseResult`, Zod throws and the user sees the generic manual-entry fallback.

## Proposed Change (Diff Outline)
- `app/api/ai/vision/route.ts`
  - Change the vision primary default to stable `gemini-2.5-flash`.
  - Prefer a vision-specific override such as `GEMINI_VISION_MODEL`, falling back to `gemini-2.5-flash` rather than the shared `GEMINI_MODEL` alias, so production text model settings cannot accidentally break photo recognition.
  - Pass a structured-output `generationConfig` into `callGeminiWithFallback` for the vision route: `responseMimeType: 'application/json'`, reasonable `maxOutputTokens`, and a `responseSchema` matching the existing `ParseResult` contract.
  - Keep the existing `inlineData`, size gate, cache, idempotency, thumbnail, and manual fallback behavior unchanged.
- `lib/ai/client.ts`
  - Extend the `GeminiCallInput.generationConfig` type so REST requests can include `responseSchema`.
  - Continue forwarding `generationConfig` unchanged to `generateContent`.
- `lib/ai/fallback.ts`
  - Extend the fallback wrapper's `generationConfig` type to accept the same `responseSchema` and pass it to both primary and secondary calls.
- `tests/integration/ai-vision.test.ts`
  - Add a regression test that captures the outbound Gemini request and asserts the URL targets `models/gemini-2.5-flash:generateContent` by default.
  - Add/extend a request-body test to assert the image still travels as `inlineData` and the vision call includes `generationConfig.responseMimeType === 'application/json'` plus a structured `responseSchema`.
  - Add a successful food-photo mock returning a Gemini envelope with `candidates[0].content.parts[0].text` JSON, not just the direct parsed test shortcut, to prove real Gemini-style responses reach `{ result.items }`.
- `tests/integration/ai-vn-fallback-runtime.test.ts`
  - Update the vision-specific fallback test to stub the new primary model (`gemini-2.5-flash`) while leaving text-parse coverage for `gemini-flash-latest` unchanged if text parsing is not part of this bug.

## Files Affected
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/app/api/ai/vision/route.ts`
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/lib/ai/client.ts`
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/lib/ai/fallback.ts`
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/tests/integration/ai-vision.test.ts`
- `C:/Users/tamas/Documents/AI projects/Calorie tracker webapp/tests/integration/ai-vn-fallback-runtime.test.ts`

## TDD Required
yes - this is production AI control flow and model/request configuration. The red tests should prove the current route uses the wrong default model and lacks structured-output schema before implementation changes it.

## Test Approach
- Start with failing tests in `tests/integration/ai-vision.test.ts` that capture the outbound request for a successful photo parse.
- Assert the request URL contains `models/gemini-2.5-flash:generateContent`.
- Assert `contents[0].parts` still includes exactly one `inlineData` image part with the submitted MIME type and base64 data.
- Assert the request includes JSON structured-output config with a schema for `items` and `reasoning`.
- Add a Gemini-envelope success case whose `text` contains valid food JSON, confirming the production extraction path works and returns editable parsed items.
- Update only the vision assertion in `ai-vn-fallback-runtime.test.ts` so fallback-chain coverage stays aligned with the new vision primary model.

## Risk Assessment
medium - changing the model default and structured-output config affects all photo recognition calls, but the change is isolated to `/api/ai/vision` and leaves text parsing untouched.

## Regression Sweep Needed
- `/api/ai/vision` happy path, cache path, size gate, idempotency replay, and fallback envelope.
- `SnapTab` upload/camera flow to confirmation after a successful mocked vision parse.
- AI accuracy photo fixtures that route through `/api/ai/vision`.
- Runtime fallback chain tests, especially primary-fails-secondary-succeeds behavior.

## UI Touching
false - this proposal fixes the server-side recognition model and structured response contract only. The broken manual-edit phone UI should be handled as a separate UI-touching bug in the same batch.

## Open Questions
- Should production expose `GEMINI_VISION_MODEL` in Vercel for emergency rollback, or should the code hard-pin `gemini-2.5-flash` for vision until a later model-management cleanup?
- Should text parsing remain on the existing `GEMINI_MODEL`/`gemini-flash-latest` path for this bug, or should a later follow-up migrate text parsing to the same stable model family after separate testing?
