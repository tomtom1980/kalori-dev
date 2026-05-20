/**
 * Shared upper bound for per-micro values across every mutation surface
 * that writes `food_library_items.nutrition.micros`.
 *
 * Bugfix 2026-05-17 (library-micros-parse) — extracted from four duplicate
 * definitions after R3 added the bound to `entries/save` and `library/merge`,
 * bringing the count to five surfaces (4 server + 1 client). Per the
 * "rule of three" heuristic, four+ duplications justify extraction.
 *
 * Importers:
 *   - `lib/library/create-schema.ts` (POST /api/library/create body schema)
 *   - `app/api/library/[id]/update/route.ts` (POST /api/library/[id]/update)
 *   - `app/api/library/merge/route.ts`     (POST /api/library/merge)
 *   - `app/api/entries/save/route.ts`      (POST /api/entries/save — save-to-library)
 *   - `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
 *     (client edit form numeric clamp)
 *
 * Inclusive maximum: `.max(MAX_MICRO_VALUE)` accepts EXACTLY `1_000_000`.
 *
 * Rationale for `1e6` (1,000,000):
 *   - Largest realistic per-serving micro magnitude is sodium (mg) at
 *     ~1500mg per high-sodium meal; vitamins in mcg range top out at
 *     ~1000mcg. `1e6` is ~666x the upper bound of legitimate values —
 *     comfortably above plausible inputs while still rejecting paste-
 *     mistakes like `1e9` that would round-trip through Number → JSON
 *     and produce numerically-unreasonable values downstream.
 *   - Gemini's parsed responses have never produced values near this
 *     ceiling for any tracked nutrient, so the bound is safe to apply
 *     to AI-parsed flows (entries/save uses Gemini parse output).
 */
export const MAX_MICRO_VALUE = 1_000_000;
