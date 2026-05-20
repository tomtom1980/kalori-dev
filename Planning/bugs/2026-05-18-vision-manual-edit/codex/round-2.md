# Round 2 Adversarial Review

Batch: `2026-05-18-vision-manual-edit`
Reviewer: local/manual adversarial review
Date: 2026-05-18

## Scope

Reviewed the current uncommitted diff after Round 1 manual fallback fixes and the nav full-suite test isolation fix.

Targeted files:
- `app/api/ai/vision/route.ts`
- `lib/ai/client.ts`
- `lib/ai/fallback.ts`
- `app/(app)/log/_components/ManualEntryFallback.tsx`
- `app/(app)/log/_components/LogFlowErrorBanner.tsx`
- `app/(app)/log/_components/LogFlowTabs.tsx`
- `app/globals.css`
- `lib/i18n/en.ts`
- focused tests under `tests/integration/ai-*`, `tests/components/log-flow/*`, and `tests/components/nav/nav-shell.test.tsx`

CodeRabbit CLI status: not installed, so no CodeRabbit review was run.

Configured `C:/Users/tamas/.codex/rules/codex-review.md` was not present; this review follows the existing batch report format.

## Verification Run

Commands run by this reviewer:

```text
pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts tests/components/log-flow/ManualEntryFallback.test.tsx tests/components/log-flow/LogFlowErrorBanner.test.tsx tests/components/nav/nav-shell.test.tsx
```

Result: passed, 5 files / 69 tests.

```text
pnpm typecheck
```

Result: failed.

Blocking error:

```text
tests/components/nav/nav-shell.test.tsx(356,14): error TS2488:
Type '[url: string, body: unknown] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.
```

## Round 1 Improvements

1. Mobile quantity wheel stale unit values: resolved.
   - Unit change now resets `portion` and `wheelDraft` to the next unit default.
   - `onDone` normalizes `wheelDraft` against the current unit before committing.
   - Regression test covers `250 g` switching to `piece` and submitting `1 piece`.

2. Retry copy says `TRY PHOTO AGAIN` outside snap/photo flows: resolved.
   - `LogFlowErrorBanner` and `ManualEntryFallback` now choose photo-specific copy only for `snap`.
   - Type/library paths use neutral `TRY AGAIN`.
   - Tests cover both snap and non-snap retry copy.

3. Optional macro validation lacks visible field errors/focus: resolved.
   - Invalid optional macros render per-field error spans.
   - Inputs wire `aria-invalid` and `aria-errormessage`.
   - Submit focuses the first invalid macro input.
   - Regression test covers invalid protein input, visible error, and focus movement.

## Gemini Model And Schema Path

Model choice is sound.
- `gemini-2.5-flash` is listed as stable and supports image input plus structured outputs in the official model page:
  - https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash

Inline image path is sound.
- The image understanding guide documents passing Base64 image bytes with `inlineData` to `generateContent`:
  - https://ai.google.dev/gemini-api/docs/image-understanding

Structured output path is sound for the REST endpoint currently used by `lib/ai/client.ts`.
- The generateContent API reference documents `generationConfig.responseMimeType`, `generationConfig.responseSchema`, and `maxOutputTokens`:
  - https://ai.google.dev/api/generate-content

The route now defaults only vision calls to `gemini-2.5-flash`, leaves `GEMINI_VISION_MODEL` as an explicit rollback override, and avoids inheriting the legacy `gemini-flash-latest` alias from `GEMINI_MODEL`. That is the right production direction for this bug.

## Tests / Overfit Review

The vision tests are reasonably behavioral:
- They assert the default model URL, override behavior, real Gemini envelope parsing, `inlineData`, and schema-bearing generation config.
- They do not require exact prompt text.

The manual fallback tests are reasonably behavioral:
- They assert user-visible controls, submitted payloads, mobile unit reset behavior, retry copy, and accessibility attributes.
- They do not depend on CSS internals.

The nav test change is directionally reasonable but currently does not typecheck.
- Clearing local mock call history immediately before the water FAB action is a fair way to isolate full-suite mock leakage while preserving queued one-shot implementations.
- The helper type needs to guarantee a tuple is present before destructuring, or the assertions need a non-undefined tuple extraction.

## Findings

### Critical

1. `tests/components/nav/nav-shell.test.tsx:356` - TypeScript fails on tuple destructuring from a possibly undefined array element.
   - `expectAuthPostCallsSince()` returns `Array<[url: string, body: unknown]>`.
   - `const [[url, body]] = ...` leaves the first tuple typed as `[url, body] | undefined` under `noUncheckedIndexedAccess`.
   - This blocks production push because `pnpm typecheck` fails.
   - Suggested fix: make the helper return a definite tuple for single-call cases, or destructure after an explicit non-null assertion/local guard.

### Improvement

None.

### Minor

1. Local artifacts remain dirty/untracked and should stay out of the commit.
   - `.codex/` is untracked.
   - `next-env.d.ts`, `public/sw.js`, and screenshot PNGs are still dirty generated/local artifacts.

## Conclusion

Round 1 product/UI improvements are resolved. Gemini model and structured schema direction is sound against the current official API docs. Focused behavior tests pass and are not obviously overfit.

The batch is blocked by a TypeScript failure introduced in the nav test helper change. Do not push/deploy until `pnpm typecheck` is green.
