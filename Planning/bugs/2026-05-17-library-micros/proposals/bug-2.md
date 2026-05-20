# Bug #2 — Library micros displayed without units

**Batch:** `2026-05-17-library-micros`
**Surface:** `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` (view + edit modes)
**Classification:** `needs_debug_shallow` (canonical unit map exists, but the display path infers units from key suffixes rather than the canonical table — robust under today's data but fragile under future AI-canonical keys; sugar/sodium are also hardcoded)

---

## Root cause (what the user actually sees)

The library detail view's micros block has **two display paths** that obtain units differently. Neither uses `DEFAULT_MICROS_LIST` as the canonical lookup:

1. **`MicrosReadOnly` default rows** (always-visible — sugar + sodium):
   - Sugar value: `${formatGrams(sugarG)} g` (hardcoded `g` literal from `t.library.detail.macroUnitGrams`).
   - Sodium value: `${formatMilligrams(sodiumMg)} mg` (hardcoded `mg` literal from `t.library.detail.macroUnitMg`).
   - These two ARE rendered with units today.

2. **`MicrosReadOnly` collapsible extra rows** (calcium, iron, vitamin_c, vitamin_a, etc.):
   - `buildMicroRow` calls `unitFromMicroKey(key)` which strips the suffix from `*_mg` / `*_mcg` / `*_ug` / `*_g`. Returns `''` when no suffix is present.
   - Today every persisted library micro has the unit suffix (`sodium_mg`, `vitamin_c_mg`, …) because the schema + AI prompt + form drafts all use suffixed keys (see lesson 2026-05-15 canonicalizeMicroKey alias map). So the unit appears on screen NOW.
   - **Fragility:** If the AI ever returns canonical snake_case codes WITHOUT a suffix (`vitamin_c` instead of `vitamin_c_mg` — already happening on the dashboard side per `aggregateMicros`/`canonicalizeMicroKey`), `unitFromMicroKey()` returns `''` and `buildMicroRow` falls through to the final `else` branch which produces just `${value}` (no unit). Vitamins A/D/K/B12 in mcg vs mg/g become indistinguishable.
   - **Drift risk:** the format helper and the canonical table can disagree silently (e.g. `vitamin_a_mg` suffix → display `mg` but the canonical table declares `mcg` — a 1000x off-by-unit error in the user's mental model).

3. **`humanizeMicroKey()`** strips the unit suffix from the LABEL (`vitamin_c_mg → "Vitamin C"`). The label legitimately has no unit; the unit should live in the value column. That's intended editorial typography and not the bug — but it does mean if the value column also drops the unit (case 2 above), the user sees `Vitamin C 30` with no unit at all. That matches the verbatim user report.

**Edit-mode `EditMicrosCollapsible`** only edits sugar + sodium today (zero-saved-value guard), so it is not affected by this bug. Macros block (`MacroDisplay`) already shows `g`/`mg` units literally per macro.

**Conclusion:** A canonical unit map already exists and is the right answer — switch both display paths to read from it. Extending the existing single source of truth (`DEFAULT_MICROS_LIST`) is preferable to extending the suffix parser, because:
- Suffix parsing requires the key to carry the unit (couples persistence shape to display).
- The canonical table already encodes `code → unit` and is the authoritative source the dashboard resolver (`micros-rda-resolver.ts`) and the AI prompt (`MICROS_DIRECTIVE`) both agree on.
- The lesson 2026-05-15 alias map (`LEGACY_MICRO_KEY_ALIASES`) already canonicalizes `sodium_mg → sodium`, `vitamin_a_mcg → vitamin_a` etc. We piggyback on the same canonicalization function.

## Proposed fix (no implementation, design only)

### Step 1 — Add a unit-lookup helper alongside `canonicalizeMicroKey`

In `lib/dashboard/micros-rda-resolver.ts` (or hoisted to `lib/nutrition/micros-rda.ts` to keep the dashboard-vs-nutrition layering clean), export:

```ts
/**
 * Resolves the canonical unit ('mg' | 'mcg' | 'g') for any raw micro key.
 * Returns undefined for keys that don't map to a canonical row — caller
 * decides whether to drop, pass through, or fall back to suffix parsing.
 *
 * Built from DEFAULT_MICROS_LIST so it is automatically in lockstep with
 * the AI prompt, the dashboard resolver, and the RDA panel.
 */
export function canonicalMicroUnit(rawKey: string): 'mg' | 'mcg' | 'g' | undefined { ... }
```

Implementation: call `canonicalizeMicroKey(rawKey)` → look up the resulting canonical code in a frozen `CANONICAL_CODE_TO_UNIT` map built once from `DEFAULT_MICROS_LIST`. Same closed-allowlist semantics as the existing alias map — `sodium_g` returns undefined because there is no canonical row with unit `g` for sodium.

### Step 2 — Build the lookup map in `lib/nutrition/micros-rda.ts`

Add a third frozen export adjacent to `CANONICAL_CODE_TO_DISPLAY_NAME` and `DISPLAY_NAME_TO_CANONICAL_CODE`:

```ts
export const CANONICAL_CODE_TO_UNIT: Readonly<Record<string, 'mg' | 'mcg' | 'g'>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.code, m.unit])),
);
```

This keeps `DEFAULT_MICROS_LIST` as the single source of truth — any unit change there cascades to display, AI prompt, dashboard resolver, and library detail simultaneously.

### Step 3 — Update `FoodDetailMacros.tsx` `buildMicroRow` to prefer canonical unit

Replace `unitFromMicroKey(key)` with a two-step resolver:

1. Try `canonicalMicroUnit(key)` first (uses the full alias chain — `vitamin_c`, `vitamin_c_mg`, `"Vitamin C"` all return `mg`).
2. If that returns `undefined`, fall back to `unitFromMicroKey(key)` (preserves legacy/orphan keys like `omega3_g` not in the canonical 30).
3. If both fail, render the value with NO unit and prefix the label with a `?` marker OR (preferred) hide the row entirely behind a debug log — talk to user.

The format branch (`formatMilligrams` vs `formatGrams`) keys off the resolved unit: `mg`/`mcg` → `formatMilligrams`, `g` → `formatGrams`. Today both `mg` and `mcg` go through `formatMilligrams` which is correct (rounds to integer); keep that behavior.

### Step 4 — Switch sugar + sodium hardcoded literals to canonical

Today `MicrosReadOnly` hardcodes the units for sugar (`g`) and sodium (`mg`). Strictly cosmetic refactor — replace with `canonicalMicroUnit('sugar')` and `canonicalMicroUnit('sodium')` (lookup at module scope so it's a constant) so the hardcoded literals come from one place. Sugar is NOT in `DEFAULT_MICROS_LIST` (it's a macro sub-component), so it stays a literal `'g'` — flag this in the implementation note.

### Step 5 — Verify nothing collapses to "value only" rendering

Inspect `buildMicroRow`'s `else` branch (line 477: `: \`${value}\``) — this branch fires whenever `unitFromMicroKey` returns `''`. After the fix, this branch should be unreachable for any key in the canonical 30 + suffixed legacy keys. We keep the branch as a defensive fall-through for orphan keys (e.g. AI drift introducing `mystery_nutrient`), but they should be vanishingly rare given the closed alias allowlist.

## Files to touch (count: 4 minimum, 5 if test file added)

1. `lib/nutrition/micros-rda.ts` — add `CANONICAL_CODE_TO_UNIT` map (~5 lines).
2. `lib/dashboard/micros-rda-resolver.ts` — add `canonicalMicroUnit(rawKey)` helper (~12 lines, exports it).
3. `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — modify `buildMicroRow` to consult canonical map first (~10 line diff). Optionally refactor `MicrosReadOnly` default rows to use canonical sodium unit (~3 line diff).
4. `app/(app)/library/_components/FoodDetail/foodDetail.format.ts` — `unitFromMicroKey` stays as the legacy fallback. No edit unless we choose to delete it (recommend keep for orphans).
5. `tests/components/library/FoodDetailMacros.test.tsx` — extend with unit-display test cases (see TDD plan).

## TDD plan (mandatory — logic-touching)

### Red tests (in `tests/components/library/FoodDetailMacros.test.tsx`)

Append a new describe block `'<FoodDetailMacros /> — Bug 2 unit display'`:

1. **Suffixed key with canonical match:** Item with `micros: { vitamin_c_mg: 30 }` → expand collapsible → assert the vitamin C row's value cell contains `"30 mg"` (not just `"30"`).
2. **Bare canonical code (AI-drift case):** Item with `micros: { vitamin_a: 800 }` → expand → assert the row reads `"800 mcg"` — proves the fix queries `DEFAULT_MICROS_LIST`, not the suffix.
3. **Wrong-suffix defensive case:** Item with `micros: { sodium_g: 2.3 }` (a 1000x off-by-unit) → assert the row either drops the value or renders with explicit `?` (per Step 3 design choice — confirm with user during approval gate).
4. **Display-name legacy key:** Item with `micros: { "Vitamin C": 30 }` → assert the row reads `"30 mg"` (proves the alias chain works end-to-end).
5. **Orphan key fallback:** Item with `micros: { omega3_g: 1.5 }` (not in DEFAULT_MICROS_LIST) → assert the row reads `"1.5 g"` (legacy `unitFromMicroKey` still works).
6. **Sodium always-visible row:** verify `MicrosReadOnly` sodium row still ends in `" mg"` after refactor.

### Unit tests for `canonicalMicroUnit` (`tests/unit/nutrition/canonical-micro-unit.test.ts` — NEW file)

1. `canonicalMicroUnit('sodium_mg')` → `'mg'`
2. `canonicalMicroUnit('sodium')` → `'mg'`
3. `canonicalMicroUnit('"Sodium"')` → `'mg'` (display-name alias)
4. `canonicalMicroUnit('vitamin_a_mcg')` → `'mcg'`
5. `canonicalMicroUnit('sodium_g')` → `undefined` (wrong unit, alias map drops it)
6. `canonicalMicroUnit('mystery_thing')` → `undefined`

### Green implementation

After tests fail for the right reasons (missing function, missing unit on extras), implement Steps 1-4 above and re-run.

## Source-of-truth unit map decision

**Existing map path:** `lib/nutrition/micros-rda.ts::DEFAULT_MICROS_LIST` — 30-entry canonical table where each row carries `code/name/rda/unit`.

**Extension plan:** Add `CANONICAL_CODE_TO_UNIT` export (one-liner built from `DEFAULT_MICROS_LIST`) AND a `canonicalMicroUnit(rawKey)` helper hoisted into `lib/dashboard/micros-rda-resolver.ts` next to `canonicalizeMicroKey`. The helper chains through the existing alias map → canonical-code map → display-name map → finally the unit lookup, so every shape the canonicalizer accepts also resolves to a unit.

**Why not a new parallel map:** Doing so would violate lesson 2026-05-15 (canonical micro key handling) and create the kind of two-source disagreement that produced the Codex R2 HIGH 2 finding (dashboard and panel disagreed on which canonical bucket a row belonged to).

**Why not extend `unitFromMicroKey`:** Suffix parsing couples display unit to persistence shape. AI-canonical bare codes (`vitamin_c` no suffix) appear once the prompt directive lands. The canonical table is the right contract.

**Sugar caveat:** Sugar is a macro sub-component (not in `DEFAULT_MICROS_LIST`). The sugar hardcoded `g` literal stays; document in code that "sugar" is intentionally outside the canonical micros table.

## Coordination note for bug 3

Bug 3 (daily-value comparison) also targets `FoodDetailMacros.tsx`. My fix touches:

- **`buildMicroRow` function (lines 467-483)** — modify unit resolution.
- **`MicrosReadOnly` function (lines 485-586)** — optional 3-line refactor on the sodium hardcoded literal (lines 498-504).
- **No edits to `MacroDisplay` (lines 266-349) or `CholesterolMacroDisplay` (lines 369-444)** — those handle macros, which already render units literally.

Bug 3's DV comparison work will likely sit inside `MacroDisplay` (which already imports `MACRO_DV_G` and renders `· {dvPct}% DV`) and probably needs to do the same for micros — which means bug 3 will also edit `buildMicroRow` or `MicrosReadOnly`'s row render JSX.

**Coordination:** Bug 3's sub-agent should rebase onto my changes:
- Take my `canonicalMicroUnit` helper as a dependency (it'll need unit + RDA from the same canonical table to compute DV %).
- Pass the resolved unit string into whatever DV formatting bug 3 builds, so the DV line says `30 mg · 33% DV` instead of computing the unit twice.
- Bug 3 will likely also need a `canonicalMicroRda` companion helper — let bug 3's author add that next to `canonicalMicroUnit`.

If bug 2 and bug 3 land in the same commit, they share the same `buildMicroRow` rewrite; one author should own that function and the other should review.

## Risk

- **Low-medium.** The fix is additive (new export + new helper); existing call sites (`canonicalizeMicroKey`, dashboard resolver, AI prompt) are untouched. The library detail render path is the only consumer that changes behavior.
- **Visual regression test screenshots will diff** because the collapsed-micros panel now shows units on bare-code drift cases (currently rare in production). The change is desirable so screenshots should be re-baselined as part of bug 2's PR.
- **Lesson tax:** R1 from `bugfix-2026-05-15-library-canonical-keys` instructs callers to use `canonicalizeMicroKey` — I extend that contract with `canonicalMicroUnit`, which is the natural follow-on. Apply lessons-relevant.md when the implementation lands.

## Stop-the-world flags

None. No security/payment surface. No DB migration. No public-API change. Existing tests should keep passing; new tests are additive.

---

**Return-to-main summary (per template):**
- Classification: `needs_debug_shallow` — canonical map exists, library display path uses a parallel suffix-based unit resolver that drifts from the canonical table under bare-code AI keys.
- Canonical unit map already exists at `lib/nutrition/micros-rda.ts` (`DEFAULT_MICROS_LIST`). Will extend with one frozen `CANONICAL_CODE_TO_UNIT` map and one helper `canonicalMicroUnit(rawKey)` in `lib/dashboard/micros-rda-resolver.ts`.
- File count to touch: **4** (3 prod files + 1 existing test file extended; +1 new unit-test file).
- TDD required: **yes** — 6 component-level cases + 6 helper unit cases.
- Risk: **low-medium** (additive; visual baselines need re-record).
- Stop-the-world flags: **none**.
