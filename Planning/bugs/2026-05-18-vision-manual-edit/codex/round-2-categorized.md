# Round 2 Categorized Findings

## Summary

- Critical: 1
- Improvement: 0
- Minor: 1

## Critical

1. `tests/components/nav/nav-shell.test.tsx:356` - `pnpm typecheck` fails because destructuring assumes a tuple exists when TypeScript sees `[url: string, body: unknown] | undefined`.
   - Blocking command: `pnpm typecheck`
   - Error: `TS2488: Type '[url: string, body: unknown] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.`
   - Fix by returning a definite tuple from the helper, adding an explicit guard, or using a justified non-null assertion before destructuring.

## Improvement

None.

Round 1 improvements verified resolved:
- Mobile wheel stale unit values are reset/normalized.
- Retry copy is snap-specific only when appropriate.
- Optional macro validation now has field errors, ARIA wiring, and focus movement.

Gemini path reviewed:
- `gemini-2.5-flash` is a stable model with image input and structured outputs.
- `generateContent` supports inline image data and `generationConfig.responseSchema`.
- No blocker found in the model/schema direction.

## Minor

1. Local artifacts should remain unstaged.
   - `.codex/`
   - `next-env.d.ts`
   - `public/sw.js`
   - screenshot PNG changes under `tests/screenshots/user-stories/`

## Verification Notes

Passed:

```text
pnpm vitest run --pool threads --maxWorkers 1 tests/integration/ai-vision.test.ts tests/integration/ai-vn-fallback-runtime.test.ts tests/components/log-flow/ManualEntryFallback.test.tsx tests/components/log-flow/LogFlowErrorBanner.test.tsx tests/components/nav/nav-shell.test.tsx
```

Result: 5 files / 69 tests passed.

Failed:

```text
pnpm typecheck
```

## Blockers

Production push is blocked until the Critical `pnpm typecheck` failure is fixed.
