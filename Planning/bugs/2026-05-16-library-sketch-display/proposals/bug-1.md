# Bug 1: Verify nano-banana model is the cheap flash variant

## Classification
known_fix — **but the "fix" is a no-op verification**. The cheap flash variant is already wired in. No code change is required; only a test-pin to lock it.

## Root Cause
**Not a defect — verification reveals the correct model is already in use.**

The single source of truth for the image-generation model lives at:
- `lib/ai/image-client.ts:42` — `const DEFAULT_MODEL = 'gemini-2.5-flash-image';`

This is the **CHEAP flash variant** ("Nano Banana") that the user wants. The expensive Pro variant (`gemini-3-pro-image-preview`, a.k.a. "Nano Banana Pro") is **NOT** referenced anywhere in the codebase.

### Call-site analysis
- `callGeminiImage` has exactly ONE production call site: `lib/library/sketch-pipeline.ts:269` — `await callGeminiImage({ payload })`.
- The call passes only `{ payload }` — no `model:` override. The pipeline therefore uses the `DEFAULT_MODEL` constant verbatim.
- The model URL is constructed at `image-client.ts:141-143`: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=...`
- The Gemini SDK is NOT used — this is a raw REST call via `fetch`. SDK version is therefore irrelevant to model availability.

### Environment-variable analysis
- `.env.example` and `.env.local` define `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-flash-latest` — but `GEMINI_MODEL` governs the **text** client (`lib/ai/client.ts`), NOT the image client. The image client's model name is hardcoded.
- Zero matches across the entire codebase for: `GEMINI_IMAGE_MODEL`, `SKETCH_MODEL`, `IMAGE_MODEL`, or any env-var name that could redirect the image client to a different model.
- Zero matches anywhere in the repo for `gemini-3-pro-image-preview`. Grepped case-insensitive against `nano-banana`, `imagen`, `gemini.*image` — only the flash variant appears.

### Why the skill metadata is misleading
The `nano-banana` skill description in this project's Claude Code environment says "Nano Banana Pro (Gemini 3 Pro)". That description is incorrect labeling within Claude's skill catalog — it did NOT propagate into the codebase because the developer (during Bug 5 / library overhaul, see commit history and `lib/ai/image-client.ts:36` doc comment) referenced "the brainstorm Open Decision #1" which fixed the choice on `gemini-2.5-flash-image`. The skill name is misleading, but the implementation is correct.

### Pre-existing test coverage
`tests/unit/lib/ai/image-client.test.ts:77` already asserts:
```ts
expect(calledUrl).toContain('gemini-2.5-flash-image:generateContent');
```
So the cheap-variant URL is already pinned by a passing test. The "verify" objective of this bug is therefore satisfied by existing coverage.

## Proposed Change (Diff Outline)
**Recommended: no code change. Add one defensive lock-in test that pins the DEFAULT_MODEL constant by name (one-line guard against future drift to the Pro variant).**

- `lib/ai/image-client.ts` — **NO CHANGE**. The `DEFAULT_MODEL` constant is already `'gemini-2.5-flash-image'`.
- `tests/unit/lib/ai/image-client.test.ts` — add ONE new test case that asserts the URL contains `gemini-2.5-flash-image` AND does NOT contain `gemini-3-pro-image-preview`. Belt-and-suspenders on top of the existing line-77 assertion; the negative-match catches the specific drift mode this bug ticket is guarding against.
- Optional doc-only: add a one-line comment near `DEFAULT_MODEL` reaffirming the cost rationale (e.g. `// DO NOT change to gemini-3-pro-image-preview without explicit user approval — cost differential is ~10-20x.`). Borderline; omit if surgical-change principle is preferred.

## Files Affected
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\image-client.test.ts` (test addition)
- (optional) `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\image-client.ts` (comment-only)

## TDD Required
**no** — but a defensive lock-in test is recommended. The pre-existing test at `image-client.test.ts:77` already asserts the model identifier is the flash variant; this bug is fundamentally a verification ticket, not a code change. If the user wants the lock-in test, it's pure test-only addition with no production code change, so the "failing test first" cycle doesn't apply (there's nothing to make pass — the assertion is true today).

## Test Approach
1. **Existing coverage (already passing):** `tests/unit/lib/ai/image-client.test.ts:77` asserts the constructed URL contains `gemini-2.5-flash-image:generateContent`.
2. **New negative-match guard (recommended):** Add an assertion in the same test (or a sibling test) that the URL does NOT contain `gemini-3-pro-image-preview`. Catches the specific failure mode of this bug.
3. **Run:** `pnpm vitest run tests/unit/lib/ai/image-client.test.ts` — should pass without code changes.

## Risk Assessment
**low** — no production code changes; test-only addition. Zero behavioral risk.

## Regression Sweep Needed
**none** — verification-only. The existing image-client unit tests already cover this path. No need to re-run the sketch-pipeline integration tests, the route tests, or the library smoke tests.

## UI Touching
false

## Open Questions
1. Does the user want the optional doc-comment on `DEFAULT_MODEL` (cost-warning), or is the negative-match test alone sufficient? My recommendation: test alone is sufficient (surgical-change principle). The constant name + existing positive assertion + new negative assertion together pin the model adequately.
2. Should this bug be marked `verified — not actually a bug` in the batch tracking, or routed as a "trivial test-only improvement"? Recommendation: keep `known_fix` classification with the diff-outline above; close as "verified correct, lock-in test added".

## Current Model Identifier (verbatim)
- Constant: `const DEFAULT_MODEL = 'gemini-2.5-flash-image';` at `lib/ai/image-client.ts:42`.
- Constructed URL fragment: `gemini-2.5-flash-image:generateContent` (verified by existing test at `image-client.test.ts:77`).
- Interface default annotation: `lib/ai/image-client.ts:35-39` — "Override model — defaults to `gemini-2.5-flash-image` per the brainstorm Open Decision #1."

## Cost Implication
**Zero unexpected exposure.** The cheap flash variant is wired in, which is what the user wants.

For context (if the wrong model HAD been wired):
- `gemini-2.5-flash-image` (Nano Banana, current) — pricing ~$0.039 per image (Google cited rates, Nov 2025).
- `gemini-3-pro-image-preview` (Nano Banana Pro, NOT wired) — substantially more expensive, typically 5-15× the flash rate depending on the specific quote.
- At Kalori's expected single-user MVP volume (~10-100 sketches/day per the brainstorm baseline), the differential would be small in absolute dollars but proportionally large; more importantly, it sets a poor cost-scaling precedent if the user later expands.

The user's cost exposure today is correctly bounded to the flash rate. No mitigation required.
