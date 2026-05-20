# Codex R3 Auto-fix — Server cluster (C2-R2-1, C2-R2-2)

## Findings addressed
- **C2-R2-1 (Critical)** — `app/api/entries/save/route.ts:56` "Save-to-library still bypasses the micro upper bound": the inline `ParsedItemSchema.micros = z.record(z.string(), z.number()).optional()` had no `.finite()` / `.nonnegative()` / `.max(MAX_MICRO_VALUE)`, so an authenticated direct POST to `/api/entries/save` with `save_to_library: true` could write `firstItem.micros` (with values >1e6 / NaN / negative) straight into `food_library_items.nutrition.micros` — defeating the C3 R1 integrity claim across the same JSONB column.
- **C2-R2-2 (Critical)** — `app/api/library/merge/route.ts:69` "Merge route can write unbounded micros": `NutritionSchema.micros = z.record(z.string(), z.number()).optional()` was strictly weaker than the pre-R1 update/create schemas (negatives, oversized values, NaN all accepted). The merge RPC `library_merge_atomic` then writes the winner's nutrition JSONB — third mutation surface, same vulnerability class.

## False-positive check
None — both findings reproduce by inspection of the pre-fix schemas. They are valid same-class vulnerabilities as R1's C3 (extending the cap to the two mutation surfaces R1 didn't cover). The Codex round-2 categorized report explicitly flags both as scope-expansion findings, not regressions.

## Approach — extracted constant to shared module

Per the auto-fix briefing's "rule of four+" prompt, the constant was **extracted** rather than duplicated a 4th time. The shared module is `lib/library/micros-bounds.ts`:

```ts
// lib/library/micros-bounds.ts
export const MAX_MICRO_VALUE = 1_000_000;
```

Five surfaces now import from it (4 server + 1 client):

| Surface | File | Import |
|---|---|---|
| Create body schema | `lib/library/create-schema.ts` | `import { MAX_MICRO_VALUE } from './micros-bounds';` |
| Update route schema | `app/api/library/[id]/update/route.ts` | `import { MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';` |
| Merge route schema | `app/api/library/merge/route.ts` (NEW) | `import { MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';` |
| Entries-save inline ParsedItemSchema | `app/api/entries/save/route.ts` (NEW) | `import { MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';` |
| Client edit-form clamp | `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` | `import { MAX_MICRO_VALUE as SHARED_MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';` |

The client-side `useFoodDetailEdit.ts` re-exports the imported constant under its original `MAX_MICRO_VALUE` name to preserve the existing test imports (back-compat).

Extraction was zero-risk: the constant module has no imports (pure literal export), so no circular-dependency risk and no server-only/client boundary issues. Import churn was 4 lines across 4 files.

## `ParsedItemSchema` impact analysis
The briefing flagged concern that adding the bound to the entries-save inline `ParsedItemSchema` might break legitimate Gemini outputs. Checked:
- The route's inline schema is **independent** of `lib/ai/schemas.ts → ParsedItem` (the Gemini parse schema). The Gemini schema already uses a stricter `Micros` shape with `.finite().nonnegative()` + a `.superRefine()` that rejects unknown canonical codes; it has no `.max()` but Gemini's nutrient values never approach 1e6 for any tracked micro (sodium ~1500mg ceiling; vitamins in mcg range). Adding the cap to the inline schema only affects how the entries-save body is validated, not the Gemini response parse path.
- No change to `lib/ai/schemas.ts` — out of scope and would have introduced risk to the parse-flow tests.

## Files modified
- `lib/library/micros-bounds.ts` (NEW) — shared constant module.
- `app/api/entries/save/route.ts` — added `MAX_MICRO_VALUE` import, applied `.finite().nonnegative().max(MAX_MICRO_VALUE)` to `ParsedItemSchema.micros` (line ~56).
- `app/api/library/merge/route.ts` — added `MAX_MICRO_VALUE` import, applied the same constraint to `NutritionSchema.micros` (line ~69).
- `app/api/library/[id]/update/route.ts` — replaced local constant with shared import (line ~85 region).
- `lib/library/create-schema.ts` — replaced local constant with shared import (line ~38 region).
- `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts` — replaced local literal with shared import + re-export under original name.
- `tests/unit/api/entries-save-micros-bound.test.ts` (NEW) — 4 RED→GREEN cases: 1.5e6 reject, multi-key overflow reject, 1e6 boundary accept, negative reject.
- `tests/unit/api/library-merge-micros-bound.test.ts` (NEW) — 4 RED→GREEN cases: same shape, mirrored against the merge body schema. RPC mock asserts no DB write fires on rejection.

## Test results
- **New RED→GREEN tests:** 8 added (4 entries-save, 4 library/merge). **8/8 GREEN** post-fix; 6/8 were RED pre-fix (the 2 boundary tests passed pre-fix because 1e6 is below the unbounded `z.number()` ceiling).
- **Full impacted suite:** `pnpm vitest run tests/unit/api tests/integration/library-item-update tests/integration/library-create` → **127/127 passed**, 3 skipped (skips are pre-existing real-DB harness gates).
- **R1 C3 regression check:** `tests/integration/library-item-update-round1.test.ts` (8/8) + `tests/unit/lib/library/create-schema.test.ts` (12/12) + `tests/unit/library/food-detail-edit-validation.test.ts` → all GREEN; the constant move did not break R1 fixes.
- **Adjacent suites:** `tests/unit/api/entries-save.test.ts` (full file) → all GREEN; existing save-to-library tests (Task 4.7.3 B2 cases) still pass with the tightened schema.
- **AI schemas:** `tests/unit/ai/` → all GREEN; the Gemini parse path was untouched, no regressions.

## Typecheck / lint
- `npx tsc --noEmit` — clean across all touched files (`app/api/entries/save/route.ts`, `app/api/library/merge/route.ts`, `app/api/library/[id]/update/route.ts`, `lib/library/create-schema.ts`, `lib/library/micros-bounds.ts`, `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`, both new test files). 8 pre-existing typecheck errors remain in `tests/unit/foodDetail/useFoodDetailEdit.editmicros.test.ts` — that file belongs to the **parallel R3 client-side sub-agent** working on the I2 findings and is out of this sub-agent's scope.
- `npx eslint` on every touched file — **0 errors, 0 warnings**.

## Pre-existing failures (NOT introduced by R3 server cluster)
The parallel client-side R3 sub-agent's tests in `tests/unit/foodDetail/useFoodDetailEdit.editmicros.test.ts` (Codex R3 I2-R2-1, I2-R2-2 cases) are currently failing — they assert behaviour (`errs.micros` as a per-key error map, raw-string preservation of negatives) that requires production changes in `useFoodDetailEdit.ts` that the parallel sub-agent has not yet shipped. Those failures predate my changes; confirmed by the same failures appearing in a test run prior to any of my edits. Not in this sub-agent's scope to fix.

## Confirmation
R3 server cluster auto-fix done. Two Critical findings closed. Zero regressions in entries-save, merge, update, create, or AI-parse paths. Shared constant module is now the single source of truth for `MAX_MICRO_VALUE` across all 5 mutation surfaces — the rule-of-three-violation has been resolved.
