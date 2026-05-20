# Project Context — bugfix-2026-05-17-library-micros-parse

**Project slug:** `kalori`
**Tech stack:** Next.js 16 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase + Gemini (`gemini-flash-latest`) + Vercel + Sentry.

## Files in the parse → library-create → display flow

1. **`app/api/ai/text-parse/route.ts`** — Server: validates Gemini response with `ParseResult` Zod schema; returns `{result: {items[], reasoning}}` where each item carries macros + `micros` (all 30 canonical codes, missing keys filled with 0 by Zod transform).
2. **`lib/ai/schemas.ts`** — `ParsedItem` Zod schema: `macros{protein_g, carbs_g, fat_g, fiber_g, cholesterol_mg?}` + `micros` (validated by `Micros` superRefine: rejects negatives/NaN/unknown keys, transforms by filling missing canonical keys with 0). `ParseResultT` IS the type used everywhere downstream.
3. **`lib/ai/prompts.ts`** — `MICROS_DIRECTIVE` (line 110): mandates Gemini return ALL 30 canonical micro keys with 0 when food contributes none.
4. **`lib/nutrition/micros-rda.ts`** — `DEFAULT_MICROS_LIST` (30 canonical codes), `MicroCode` type, units, RDA values.
5. **`app/(app)/log/_components/ConfirmationScreen.tsx`** — Confirmation modal: receives `items: ParsedItemT[]` (line 192), seeds `rows[].item` via lazy reducer (line 634). `EDIT_ITEM_MICRO` reducer (line 430) writes back to `r.item.micros`. Library-only save loop (line 782–870) builds `nutrition.micros = nonZeroMicros` filtering `value > 0` (line 817–821), then POSTs to `/api/library/create`. `ConfirmationItemMicros` (line 1615) is the library-only edit-mode collapsible that renders all 30 inputs.
6. **`lib/library/create-schema.ts`** — `CreateLibraryBodySchema`: accepts `nutrition.micros: z.record(z.string(), z.number().nonnegative().finite()).optional()`. PASSES micros through if present.
7. **`app/api/library/create/route.ts`** — Inserts `nutrition: body.nutrition` verbatim into `food_library_items.nutrition` JSONB (line 129). No micros drop here.
8. **`lib/library/fetch.ts`** — Read-back path: `LibraryItem.nutrition.micros` is a `Record<string, number>` JSONB.
9. **`app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`** — Library item detail view. View-mode: `MicrosReadOnly` (line 552) renders sugar+sodium hero rows + `extraRows` (line 634) via collapsible. **Edit-mode: `EditMicrosCollapsible` (line 813) ONLY renders sugar+sodium inputs, AND only if `saved > 0`**.
10. **`app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`** — `DraftState` (line 26) only has 8 nutrition keys (kcal, protein/carbs/fat/fiber/cholesterol, sugar_g, sodium_mg). 28 of 30 micros are NEVER editable here. `buildFieldsPatch` merges only sodium back into `mergedMicros`.

## food_library_items.nutrition JSONB micros column list

Stored as `Record<string, number>` (free-shape JSONB). Canonical 30 codes per `DEFAULT_MICROS_LIST`: `sodium`, `potassium`, `calcium`, `iron`, `magnesium`, `zinc`, `phosphorus`, `copper`, `manganese`, `selenium`, `iodine`, `chloride`, `chromium`, `molybdenum`, `vitamin_a`, `vitamin_c`, `vitamin_d`, `vitamin_e`, `vitamin_k`, `thiamin`, `riboflavin`, `niacin`, `vitamin_b6`, `folate`, `vitamin_b12`, `pantothenic_acid`, `biotin`, `choline`, `omega_3`, `sugar`. Legacy `sodium_mg` alias still recognized via `canonicalizeMicroKey()`.

## Current AI parse output shape (verified)

- `ParseResultT.items[].micros` — `Record<string, number>` (canonical keys, all 30 present after `.transform()` fill, all nonneg finite).
- `ParseResultT.items[].macros.cholesterol_mg` — optional.
- `ConfirmationItemMicros` collapsible IS rendered (Bug 1 from yesterday's batch shipped 2026-05-17 commit `45376f8`). It writes user edits via `EDIT_ITEM_MICRO`.
- Library-only save filters to `nonZeroMicros` before POST.

## Candidate break points

1. **`FoodDetailMacros::EditMicrosCollapsible` (lines 813–895)** — In edit-mode after the library item is saved, this surface only renders sugar + sodium inputs, gated on `saved > 0`. The other 28 micros (potassium, calcium, vitamins, etc.) have NO edit input despite being persisted in `nutrition.micros`. The user opens edit, sees only sugar/sodium (or nothing if both zero), interprets as "all micros are zero." **This matches the symptom verbatim: "expects me to edit it, all shows zero."**
2. **`useFoodDetailEdit::DraftState` + `buildFieldsPatch`** — Only carries 8 macro/micro keys. Even if EditMicros UI is fixed, the save patch logic must round-trip all 30 canonical micros (currently the merge logic only handles sodium via `mergedMicros.sodium`).
3. **Library-only save loop nonZero filter (`ConfirmationScreen.tsx` line 817)** — Drops every micro that AI returned as exactly 0. Combined with break #1, an item with sparse micros (e.g., only iron + folate non-zero) saves correctly but only those 2 micros are persisted. View-mode shows them via `extraRows`; edit-mode `EditMicrosCollapsible` only exposes sugar+sodium so the user can't edit iron/folate at all → "looks zero/missing."

## Recent CHANGELOG one-liners (relevant)

- 2026-05-17 — Bug Bundle library-micros (3 fixes): Bug 1 `ConfirmationItemMicros` (all 30 in confirmation), Bug 2 micros display units, Bug 3 daily-value comparison. R1-C1 sodium canonical/legacy alignment (`8dc799f`). R2-I1/I2 (FoodDetailMacros display-name drop, useFoodDetailEdit canonical/legacy dedup) DEFERRED to followups.
- 2026-05-16 — Library Create Schema Extended for Micronutrient Persistence (`8347`).
- 2026-05-16 — Library Add Item Simplified to AI-Only Mode (`8328`).
- 2026-05-16 — Library Add Item Flow Shares Dashboard Confirmation Screen (`8330`).
