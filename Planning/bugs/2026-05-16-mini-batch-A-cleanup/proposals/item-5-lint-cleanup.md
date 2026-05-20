# Item 5 — Unused-var ESLint warnings cleanup

**Classification:** `known_fix` (trivial, ≤10 lines total change)
**File:** `tests/unit/lib/library/sketch-pipeline.test.ts` (single file)
**UI Touching:** NO
**TDD:** Re-run existing suite — no new tests required

## ESLint state (verified)

Resolved config at this path: `@typescript-eslint/no-unused-vars: [1]` (warn) with NO options object — the default `argsIgnorePattern: '^_'` is **NOT applied**. This explains why `_table` and `_bucket` (already underscore-prefixed) still warn. Renaming further won't silence; we must remove or use line-disable.

## The 3 warnings

### Warning 1 — line 91:12 — `_table` parameter

```ts
from: (_table: string) => ({
```

**Classification:** Truly unused. The mock's `from()` method ignores the table name (mock structural, single shared response shape).
**Fix:** Drop the parameter — `from: () => ({`. Verified: every other `from: () => ({...})` site in the same file (lines 564, 639) already uses zero-param form. Pattern consistency win.

### Warning 2 — line 117:15 — `isRecover` local variable

```ts
const isRecover = !isFinal && !isClaim;
```

**Classification:** Truly unused. The subsequent `tag` ternary derives directly from `isFinal`/`isClaim` (lines 119-123) — `isRecover` is computed but never read. Dead since the original Codex Round 1 refactor.
**Fix:** Delete the line entirely.

### Warning 3 — line 173:14 — `_bucket` parameter

```ts
from: (_bucket: string) => ({
```

**Classification:** Truly unused. Same shape as Warning 1 — `storage.from()` mock ignores the bucket name.
**Fix:** Drop the parameter — `from: () => ({`. Pattern matches lines 565 and 688 (both already zero-param storage `from`).

## Diff summary

3 edits, ~3 lines net removed:

```diff
- from: (_table: string) => ({
+ from: () => ({
```
```diff
-        const isRecover = !isFinal && !isClaim;
-
         const tag: 'claim' | 'final' | 'recover' = isFinal
```
```diff
-      from: (_bucket: string) => ({
+      from: () => ({
```

## Verification plan

1. Apply 3 edits via Edit tool.
2. Re-run `pnpm exec eslint tests/unit/lib/library/sketch-pipeline.test.ts` — expect 0 warnings, 0 errors.
3. Re-run `pnpm exec vitest run tests/unit/lib/library/sketch-pipeline.test.ts` — expect 10 tests pass (same count as before).
4. No other test/source file touched — surgical scope.

## Risk / regression notes

- `_table` and `_bucket` removal is type-safe: the call sites pass the argument, JS ignores extras at runtime, and the mock is `as unknown as ...` cast so TS won't complain about signature mismatch.
- `isRecover` removal: confirmed by grep — symbol referenced only on the declaration line.
- No stop-the-world triggers tripped: lint config unchanged, no indirect uses, no cross-warning interaction.
