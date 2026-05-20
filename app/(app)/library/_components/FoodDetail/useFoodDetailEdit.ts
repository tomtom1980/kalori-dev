'use client';

/**
 * `useFoodDetailEdit` — Task 4.2.
 *
 * Centralized state + validation for the FoodDetail edit form.
 *
 * Deviation from Quick-Pick §5 "Forms + validation" (react-hook-form +
 * zod resolver, ~9 KB gz): EditMode has ≤ 7 shallow fields, trivial
 * validation, no async, no field arrays. Native `useState` is sufficient
 * + Zod on commit. ~9 KB saved. Briefing §5.2 justifies. If the form
 * grows past ~15 fields or adds async validation, promote to RHF.
 *
 * The hook intentionally exports primitive string state (NOT coerced
 * numbers) so inputs stay controllable without NaN-on-blur; coercion +
 * validation happen in `commit()` right before the authPost.
 */
import { useCallback, useMemo, useState } from 'react';

import { authPost } from '@/lib/auth/refresh-interceptor';
import { canonicalizeMicroKey } from '@/lib/dashboard/micros-rda-resolver';
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import { MAX_MICRO_VALUE as SHARED_MAX_MICRO_VALUE } from '@/lib/library/micros-bounds';
import { isWholeStyleQuantity } from '@/lib/log/portion-unit';

import { EditFieldsSchema, type EditFields } from './foodDetail.schema';

/**
 * Defensive numeric upper bound on per-micro edits — mirrors the
 * EDIT_ITEM_MICRO clamp pattern (`ConfirmationScreen.tsx`) and the
 * LM-SEC-1 followup spirit. Without this, a paste of `1e20` would
 * round-trip through Number → JSON and store a numerically-unreasonable
 * value that downstream RDA math cannot render sanely.
 *
 * Bugfix R3 2026-05-17 — re-exported from the shared
 * `lib/library/micros-bounds.ts` module so all 5 mutation surfaces
 * (4 server + this client clamp) cannot drift apart again. Local
 * `MAX_MICRO_VALUE` alias preserved for back-compat with the existing
 * test imports.
 */
export const MAX_MICRO_VALUE = SHARED_MAX_MICRO_VALUE;

export interface DraftState {
  display_name: string;
  default_portion: string;
  default_unit: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  // Phase 2C — cholesterol_mg is the 5th tracked macro. Stored as a
  // string so the input stays controllable. Unit on the rendered row
  // is `mg`, not `g`. Optional so legacy test fixtures type-check.
  cholesterol_mg?: string;
  sugar_g: string;
  sodium_mg: string;
  /**
   * bugfix library-micros-parse (2026-05-17) — per-micro draft bag,
   * canonical-keyed (DEFAULT_MICROS_LIST.code). Carries every persisted
   * non-zero micro plus any in-progress edits. Strings so inputs stay
   * controllable; coerced + clamped on save via `buildFieldsPatch`.
   *
   * Optional so legacy test fixtures that pre-date this field still type-
   * check; the production hook always seeds it via `itemToDraft`.
   */
  micros?: Record<string, string>;
}

export type DraftKey = keyof DraftState;

/**
 * Codex R3 I2-R2-2 (bugfix library-micros-parse 2026-05-17) — `micros` is
 * a per-canonical-key error map, NOT a single aggregate string, so the
 * component can render aria-invalid + an inline `<p role="alert">` next to
 * the specific errored micro input (`iron`, `vitamin_c`, etc.). All other
 * DraftKey fields keep the legacy single-string error shape since they map
 * to single inputs each.
 */
export type MicrosErrors = Record<string, string>;
export type EditErrors = Partial<Record<Exclude<DraftKey, 'micros'> | '_form', string>> & {
  micros?: MicrosErrors;
};

function nullableNum(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function nullableStr(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Codex R1 C1 (bugfix batch library-micros 2026-05-17) — sodium can live
 * under canonical `sodium` (new `ConfirmationItemMicros` library-only flow)
 * OR legacy `sodium_mg` (historic `useFoodDetailEdit` write shape).
 * Reads BOTH; canonical wins on drift. Mirrors the resolver in
 * `FoodDetailMacros::resolveSodiumMg` — same source of truth.
 */
function readSodiumMg(micros: Record<string, unknown>): number | null {
  const canonical = micros.sodium;
  if (typeof canonical === 'number' && Number.isFinite(canonical)) {
    return canonical;
  }
  const legacy = micros.sodium_mg;
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    return legacy;
  }
  return null;
}

/**
 * bugfix library-micros-parse (2026-05-17) — build the per-micro draft
 * bag, canonicalizing each persisted key. Legacy unit-suffixed keys
 * (`sodium_mg`) and display-name keys (`"Sodium"`) collapse onto their
 * canonical equivalent (`sodium`) so the render loop + the patch builder
 * see a single canonical-keyed shape regardless of source.
 *
 * Skips entries that don't canonicalize (orphan keys not in the alias
 * map, display-name map, or canonical allowlist) — the resolver-side
 * "drop-silently" contract for unit-suffix mismatches (e.g. `sodium_g`)
 * applies symmetrically here.
 *
 * Codex R1 C2 — when BOTH a canonical key (`iron`) and a legacy alias
 * (`iron_mg`) exist in the JSONB row, the CANONICAL key always wins.
 * Without this, JSONB insertion order (`{ iron_mg: 3, iron: 4 }`) could
 * silently overwrite the canonical value with the stale legacy alias.
 *
 * Codex R1 I2 — zero values are SKIPPED at seed time. Stringifying `0`
 * to `'0'` would otherwise cause the render loop to add a row for every
 * zero-filled canonical bag entry, contradicting the non-zero render rule.
 * Users always have the always-editable sugar + sodium inputs to add a
 * zero-baseline value post-hoc.
 */
function buildMicrosDraftBag(micros: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  // Two-pass to honour canonical-precedence regardless of insertion order:
  //   Pass 1 — write CANONICAL keys (rawKey === canonicalizeMicroKey(rawKey)).
  //   Pass 2 — write legacy / display-name aliases ONLY if no canonical
  //            value was set for that canonical code in pass 1.
  for (const [rawKey, value] of Object.entries(micros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value <= 0) continue; // Codex R1 I2 — skip zero entries.
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical === rawKey) {
      // Canonical key — wins unconditionally.
      out[canonical] = String(value);
    }
  }
  for (const [rawKey, value] of Object.entries(micros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value <= 0) continue;
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical !== rawKey && out[canonical] === undefined) {
      // Legacy / alias / display-name — only write if canonical didn't.
      out[canonical] = String(value);
    }
  }
  return out;
}

/**
 * Codex R1 C2 — canonicalize the initial micros bag with canonical-
 * precedence. Mirrors `buildMicrosDraftBag` but returns numeric values
 * so `buildFieldsPatch` can diff against initial state and write the
 * post-edit JSONB shape. Zero values are PRESERVED here (unlike the
 * draft bag) because they form part of the initial DB row's shape.
 */
function canonicalizeMicrosBag(micros: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, value] of Object.entries(micros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical === rawKey) {
      out[canonical] = value;
    }
  }
  for (const [rawKey, value] of Object.entries(micros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical !== rawKey && out[canonical] === undefined) {
      out[canonical] = value;
    }
  }
  return out;
}

/**
 * Codex R1 I1 — validate a single drafted micro value.
 *
 * Returns:
 *   - `{ kind: 'empty' }`  — empty string; semantics handled by caller
 *     (treated as "clear this micro" in `buildFieldsPatch`).
 *   - `{ kind: 'valid', value: number }` — finite non-negative number,
 *     clamped to `MAX_MICRO_VALUE`.
 *   - `{ kind: 'invalid', reason: 'nan' | 'negative' }` — surfaced as a
 *     `validationError` per existing field-error pattern.
 */
type MicroValueValidation =
  | { kind: 'empty' }
  | { kind: 'valid'; value: number }
  | { kind: 'invalid'; reason: 'nan' | 'negative' };

function validateMicroValue(raw: string): MicroValueValidation {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'empty' };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { kind: 'invalid', reason: 'nan' };
  if (n < 0) return { kind: 'invalid', reason: 'negative' };
  return { kind: 'valid', value: Math.min(n, MAX_MICRO_VALUE) };
}

function itemToDraft(item: LibraryItem): DraftState {
  const macros = item.nutrition.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0 };
  const micros = item.nutrition.micros ?? {};
  const optional = (v: number | null | undefined): string =>
    v === null || v === undefined ? '' : String(v);
  return {
    display_name: item.display_name,
    default_portion: optional(item.default_portion),
    default_unit: item.default_unit ?? '',
    kcal: optional(item.nutrition.kcal),
    protein_g: optional(macros.protein_g ?? null),
    carbs_g: optional(macros.carbs_g ?? null),
    fat_g: optional(macros.fat_g ?? null),
    fiber_g: optional(macros.fiber_g ?? null),
    // Phase 2C — seed cholesterol from macros.cholesterol_mg. Legacy
    // rows missing the key surface as empty so the input doesn't
    // pre-fill a phantom 0.
    cholesterol_mg: optional((macros as { cholesterol_mg?: number }).cholesterol_mg ?? null),
    sugar_g: optional((macros as { sugar_g?: number }).sugar_g ?? null),
    // Codex R1 C1 — accept both shapes so the input is pre-filled for a
    // library row whose sodium came from `ConfirmationItemMicros`.
    sodium_mg: optional(readSodiumMg(micros as Record<string, unknown>)),
    // bugfix library-micros-parse — canonical-keyed per-micro bag.
    micros: buildMicrosDraftBag(micros as Record<string, unknown>),
  };
}

function buildFieldsPatch(initial: LibraryItem, draft: DraftState): EditFields | null {
  const fields: EditFields = {};
  // Name
  const name = draft.display_name.trim();
  if (name !== initial.display_name.trim()) {
    fields.display_name = name;
  }
  // Portion
  const portion = nullableNum(draft.default_portion);
  if (portion !== undefined && portion !== initial.default_portion) {
    fields.default_portion = portion;
  }
  // Unit
  const unit = nullableStr(draft.default_unit);
  if (unit !== initial.default_unit) {
    fields.default_unit = unit;
  }

  // Nutrition — Task 4.2 round 1 C2 fix.
  //
  // Supabase `.update({ nutrition: {...} })` is a SHALLOW JSONB
  // replacement. If we sent only the changed macros, every untouched
  // sibling (kcal / fat_g / carbs_g / micros / etc.) would be silently
  // nulled in the database. So the client always POSTs the full post-edit
  // nutrition object: `{ ...initial, ...draft diffs }`. When none of the
  // seven nutrition fields moved, we omit `nutrition` entirely to avoid
  // writing an identity patch.
  const initMacros = initial.nutrition.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    cholesterol_mg: 0,
  };
  const initMicros = initial.nutrition.micros ?? {};
  const initialMacrosRecord = initMacros as Record<string, number | undefined>;

  // Codex R1 F2 fix — preserve absence vs zero for optional macros on
  // legacy rows. The original `resolveMacro` collapsed "absent in DB"
  // into `prev = 0` and the call site unconditionally wrote that 0 into
  // the JSONB replacement. After an unrelated nutrition edit, a row
  // that never carried `cholesterol_mg` would suddenly persist a literal
  // 0mg as if the user verified it. We now thread an `absent` discriminant
  // through the resolver so the call site can omit the key.
  //
  // Function overloads: callers WITHOUT `preserveAbsence` get the
  // tighter `{ value: number }` shape so the existing macros
  // (protein/carbs/fat/fiber/sugar) keep working without per-call
  // narrowing. Only cholesterol opts into the absence-aware shape.
  type MacroKey = 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'cholesterol_mg';
  type MacroResolverResult =
    | { value: number; changed: boolean; absent: false }
    | { value: undefined; changed: false; absent: true };

  function resolveMacro(key: MacroKey, raw: string): { value: number; changed: boolean };
  function resolveMacro(
    key: MacroKey,
    raw: string,
    options: { preserveAbsence: true },
  ): MacroResolverResult;
  function resolveMacro(
    key: MacroKey,
    raw: string,
    options: { preserveAbsence?: boolean } = {},
  ): { value: number; changed: boolean } | MacroResolverResult {
    const had = Object.prototype.hasOwnProperty.call(initialMacrosRecord, key);
    const prev = initialMacrosRecord[key] ?? 0;
    const n = nullableNum(raw);
    if (n === undefined || n === null) {
      if (options.preserveAbsence && !had) {
        return { value: undefined, changed: false, absent: true };
      }
      return { value: prev, changed: false, absent: false };
    }
    // User typed a value → that's a change vs absent OR vs a different prev.
    return { value: n, changed: n !== prev || !had, absent: false };
  }
  const protein = resolveMacro('protein_g', draft.protein_g);
  const carbs = resolveMacro('carbs_g', draft.carbs_g);
  const fat = resolveMacro('fat_g', draft.fat_g);
  const fiber = resolveMacro('fiber_g', draft.fiber_g);
  const sugar = resolveMacro('sugar_g', draft.sugar_g);
  // Phase 2C — cholesterol resolver. Pass `preserveAbsence: true` so
  // legacy rows without `cholesterol_mg` keep the key absent on save,
  // rather than silently materialising a literal 0mg the user never
  // entered. Once the user types a value, `absent` becomes false and
  // the key is written normally.
  const cholesterol = resolveMacro('cholesterol_mg', draft.cholesterol_mg ?? '', {
    preserveAbsence: true,
  });

  const kcalRaw = nullableNum(draft.kcal);
  const kcalPrev = initial.nutrition.kcal;
  const kcalChanged = kcalRaw !== undefined && kcalRaw !== null && Math.round(kcalRaw) !== kcalPrev;
  const kcalValue =
    kcalChanged && kcalRaw !== null && kcalRaw !== undefined ? Math.round(kcalRaw) : kcalPrev;

  const sodium = nullableNum(draft.sodium_mg);
  // Codex R1 C1 — `sodiumPrev` must read whichever key the row stores
  // sodium under (canonical `sodium` from the new ConfirmationItemMicros
  // flow OR legacy `sodium_mg`). Without this normalisation, a canonical-
  // only row's unchanged sodium was incorrectly reported as changed (prev
  // === undefined !== draft value), triggering a spurious POST that
  // duplicated sodium under the legacy key.
  const sodiumPrev = readSodiumMg(initMicros as Record<string, unknown>);
  const sodiumChanged = sodium !== undefined && sodium !== null && sodium !== sodiumPrev;

  // bugfix library-micros-parse — compute the per-micro diff across the
  // generic `draft.micros` bag. The bag is canonical-keyed by
  // `buildMicrosDraftBag`; compare against the SAME canonicalized
  // snapshot of `initMicros` so legacy keys don't double-count.
  //
  // Codex R1 C2 — canonical-precedence in the initial canonicalization.
  // `canonicalizeMicrosBag` does a two-pass walk so the canonical key
  // always wins over a sibling legacy alias regardless of JSONB insertion
  // order. Without this, `{ iron_mg: 3, iron: 4 }` would seed the diff
  // baseline at 3 (stale legacy) and silently overwrite the canonical 4
  // on every unrelated nutrition edit.
  const draftMicros = draft.micros ?? {};
  const initMicrosCanonical = canonicalizeMicrosBag(initMicros as Record<string, unknown>);
  // Diff: for each drafted canonical key, validate value, clamp [0, MAX], and
  // record edits. Codex R1 I1 — empty string means "clear this micro"
  // (omit from patch). Invalid (NaN/negative) values are SKIPPED here so
  // the on-disk row keeps its prior value; `validateDraft` surfaces them
  // as a user-visible error on commit.
  const microEdits: Record<string, number> = {};
  const microClears = new Set<string>();
  let anyGenericMicroChanged = false;
  for (const [canonicalKey, raw] of Object.entries(draftMicros)) {
    if (typeof raw !== 'string') continue;
    const validation = validateMicroValue(raw);
    if (validation.kind === 'invalid') continue; // Surfaced by validateDraft.
    if (validation.kind === 'empty') {
      // User cleared the input — remove key from post-edit shape if it
      // was previously present.
      if (initMicrosCanonical[canonicalKey] !== undefined) {
        microClears.add(canonicalKey);
        anyGenericMicroChanged = true;
      }
      continue;
    }
    const clamped = validation.value;
    const prev = initMicrosCanonical[canonicalKey];
    if (clamped !== prev) {
      microEdits[canonicalKey] = clamped;
      anyGenericMicroChanged = true;
    }
  }

  const anyNutritionChanged =
    kcalChanged ||
    protein.changed ||
    carbs.changed ||
    fat.changed ||
    fiber.changed ||
    sugar.changed ||
    cholesterol.changed ||
    sodiumChanged ||
    anyGenericMicroChanged;

  if (anyNutritionChanged) {
    // Merge micros: preserve every existing micro, overlay user edits.
    //
    // bugfix library-micros-parse — extend the sodium-only merge to ALL
    // canonical micros. The merged bag canonicalizes every source key,
    // then layers per-micro edits on top. This dedups any drift (a row
    // that somehow had BOTH `sodium` and `sodium_mg` ends up with one
    // canonical key) and preserves untouched siblings shallow-replace-
    // safe.
    //
    // Codex R1 C2 — the canonicalize step now uses two-pass canonical
    // precedence (`canonicalizeMicrosBag`), so legacy-first JSONB order
    // doesn't drop the canonical value.
    const initMicrosRecord = initMicros as Record<string, unknown>;
    const mergedMicros: Record<string, number> = canonicalizeMicrosBag(initMicrosRecord);
    // Preserve orphan keys verbatim (not in canonical / alias / display-name
    // maps) so legacy or future shapes aren't silently dropped on an
    // unrelated edit. Shallow-JSONB-replace contract: every sibling
    // round-trips.
    for (const [rawKey, value] of Object.entries(initMicrosRecord)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (canonicalizeMicroKey(rawKey) === undefined) {
        mergedMicros[rawKey] = value;
      }
    }
    // Layer the generic per-micro edits on top.
    for (const [canonicalKey, value] of Object.entries(microEdits)) {
      mergedMicros[canonicalKey] = value;
    }
    // Codex R1 I1 — apply user clears (empty-string drafted micros).
    for (const canonicalKey of microClears) {
      delete mergedMicros[canonicalKey];
    }
    // Bugfix batch followups Codex R1-C1 (2026-05-17) — UNIVERSAL legacy-
    // shape preservation across ALL canonical/legacy micro pairs, not just
    // sodium. The earlier LM-I2 patch preserved `sodium_mg`-only rows but
    // left `iron_mg`, `vitamin_c_mg`, etc. silently migrating to canonical
    // on every unrelated nutrition edit. That mutated the row's committed
    // shape without user consent and contradicted the R1-C1 shape policy.
    //
    // Strategy: walk `initMicrosRecord` once and build a per-canonical-key
    // map of the original shape (legacy-only / canonical / drift). After
    // `canonicalizeMicrosBag` collapses everything onto canonical, restore
    // the legacy shape for any canonical key that:
    //   1. Came from a legacy-only row (legacy present, canonical absent
    //      in init), AND
    //   2. Was NOT edited by the user via the generic micros bag
    //      (`microEdits` / `microClears` did not touch this canonical key).
    //
    // Sodium continues to flow through the dedicated typed-field branch
    // below (drafts via `draft.sodium_mg`, not via `draft.micros.sodium`).
    // The universal pass below skips canonical keys edited via either
    // surface; sodium's dedicated branch handles its own clamp + write.
    type InitShape = {
      /** The original legacy alias key, e.g. `iron_mg`. */
      legacyKey: string;
      hasLegacy: boolean;
      hasCanonical: boolean;
    };
    const initShapes = new Map<string, InitShape>();
    for (const [rawKey, value] of Object.entries(initMicrosRecord)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const canonical = canonicalizeMicroKey(rawKey);
      if (canonical === undefined) continue;
      const isCanonicalShape = rawKey === canonical;
      const existing = initShapes.get(canonical);
      if (existing) {
        if (isCanonicalShape) existing.hasCanonical = true;
        else {
          existing.hasLegacy = true;
          // Prefer a real legacy-alias key over a display-name key for
          // the restored shape — display-name keys (`"Sodium"`) are
          // accepted on read but never the desirable on-disk shape.
          if (existing.legacyKey === '' || existing.legacyKey === rawKey) {
            existing.legacyKey = rawKey;
          }
        }
      } else {
        initShapes.set(canonical, {
          legacyKey: isCanonicalShape ? '' : rawKey,
          hasLegacy: !isCanonicalShape,
          hasCanonical: isCanonicalShape,
        });
      }
    }

    // Convenience handles for sodium — its dedicated typed field needs
    // them below.
    const sodiumShape = initShapes.get('sodium');
    const hasLegacy = sodiumShape?.hasLegacy ?? false;
    const hasCanonical = sodiumShape?.hasCanonical ?? false;

    if (sodiumChanged && sodium !== undefined && sodium !== null) {
      // Codex R1 C1 — sodium edits route through the dedicated
      // `draft.sodium_mg` typed field. Write to whichever shape the row
      // used; drop the legacy duplicate if drift existed.
      // Defensive clamp (mirrors LM-SEC-1 across both entry surfaces).
      const clampedSodium = Math.min(Math.max(sodium, 0), MAX_MICRO_VALUE);
      if (hasLegacy && !hasCanonical) {
        // Legacy-only row → preserve legacy shape.
        mergedMicros.sodium_mg = clampedSodium;
        delete mergedMicros.sodium;
      } else {
        // Canonical-only, drift, or net-new → canonical key wins. If both
        // existed we also drop the legacy duplicate so the row converges.
        mergedMicros.sodium = clampedSodium;
        if (hasLegacy) {
          delete mergedMicros.sodium_mg;
        }
      }
    }
    // R1-C1 universal preservation pass — runs AFTER the sodium branch so
    // sodium edits route through the dedicated typed field above. Iterate
    // every legacy-only canonical key and restore its legacy shape on the
    // merged bag unless the user touched it.
    for (const [canonicalKey, shape] of initShapes) {
      if (!shape.hasLegacy || shape.hasCanonical) continue;
      // The user explicitly edited this canonical key via the generic
      // micros surface → keep canonical shape.
      if (microEdits[canonicalKey] !== undefined) continue;
      if (microClears.has(canonicalKey)) continue;
      // The user edited sodium via the dedicated typed field → the
      // sodium branch above already wrote the correct shape, leave it
      // alone here.
      if (canonicalKey === 'sodium' && sodiumChanged) continue;
      // Restore: take whatever value `canonicalizeMicrosBag` wrote under
      // the canonical key and re-publish it under the original legacy
      // alias key. Drop the canonical so the row converges on legacy.
      if (typeof mergedMicros[canonicalKey] === 'number' && shape.legacyKey !== '') {
        mergedMicros[shape.legacyKey] = mergedMicros[canonicalKey];
        delete mergedMicros[canonicalKey];
      }
    }
    // Drift case (hasLegacy && hasCanonical, key NOT edited) is already
    // resolved: `canonicalizeMicrosBag` wrote canonical, dropped legacy.
    // Canonical-only and neither cases are unchanged.
    // Codex R1 C1 — sugar is a CARB SUB-COMPONENT, stored at
    // `macros.sugar_g`. It is NOT a canonical micro. Any stray
    // `micros.sugar` that previously leaked in via the dual-write path
    // is scrubbed here so the JSONB row converges on the canonical
    // shape (sugar lives on macros, never on micros).
    if ('sugar' in mergedMicros) {
      delete mergedMicros.sugar;
    }
    fields.nutrition = {
      kcal: kcalValue,
      macros: {
        protein_g: protein.value,
        carbs_g: carbs.value,
        fat_g: fat.value,
        fiber_g: fiber.value,
        sugar_g: sugar.value,
        // Phase 2C + Codex R1 F2 — only persist cholesterol when the
        // original row had it OR the user typed a value. Legacy rows
        // without the key stay absent so the dashboard / library detail
        // shows "no data" instead of a phantom 0mg.
        ...(cholesterol.absent ? {} : { cholesterol_mg: cholesterol.value }),
      },
      ...(Object.keys(mergedMicros).length > 0 ? { micros: mergedMicros } : {}),
      ...(typeof initial.nutrition.approxGrams === 'number' &&
      Number.isFinite(initial.nutrition.approxGrams) &&
      initial.nutrition.approxGrams > 0
        ? { approxGrams: initial.nutrition.approxGrams }
        : {}),
    };
  }

  if (Object.keys(fields).length === 0) return null;
  return fields;
}

function validateDraft(draft: DraftState): EditErrors {
  const errs: EditErrors = {};
  const name = draft.display_name.trim();
  if (name.length === 0) errs.display_name = t.library.detail.errNameRequired;
  else if (name.length > 120) errs.display_name = t.library.detail.errNameTooLong;

  const portionRaw = draft.default_portion.trim();
  if (portionRaw !== '') {
    const n = Number(portionRaw);
    if (!Number.isFinite(n) || n <= 0) {
      errs.default_portion = t.library.detail.errPortionPositive;
    } else if (!isWholeStyleQuantity(draft.default_unit, n)) {
      errs.default_portion = t.library.detail.errPortionWhole;
    }
  }

  const unit = draft.default_unit;
  if (unit.length > 16) errs.default_unit = t.library.detail.errUnitTooLong;

  const kcalRaw = draft.kcal.trim();
  if (kcalRaw !== '') {
    const n = Number(kcalRaw);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      errs.kcal = t.library.detail.errKcalInteger;
    }
  }

  // Codex R3 (2026-05-17) — narrow `key` to exclude 'micros' because
  // `errs.micros` is now a `MicrosErrors` map, not a single string. The
  // helper is only used for the gram/mg macro keys below.
  const checkNonneg = (raw: string, key: Exclude<DraftKey, 'micros'>) => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      errs[key] = t.library.detail.errMacroNonneg;
    }
  };
  checkNonneg(draft.protein_g, 'protein_g');
  checkNonneg(draft.carbs_g, 'carbs_g');
  checkNonneg(draft.fat_g, 'fat_g');
  checkNonneg(draft.fiber_g, 'fiber_g');
  // Phase 2C — cholesterol_mg nonneg validation. Optional draft field;
  // absent → skip (no error). Same unit semantics as sodium (mg).
  checkNonneg(draft.cholesterol_mg ?? '', 'cholesterol_mg');
  checkNonneg(draft.sugar_g, 'sugar_g');
  checkNonneg(draft.sodium_mg, 'sodium_mg');

  // Codex R3 I2-R2-2 — validate every drafted micro, surfacing per-key
  // errors keyed on the canonical micro code (NOT a single aggregate
  // string). This lets the component render aria-invalid + an inline error
  // next to the specific input that failed validation, mirroring the
  // existing per-macro error pattern. NaN gets `errMicroNumber`; negative
  // gets `errMacroNonneg` (same i18n key already used by gram-keyed
  // macros). Empty string is allowed (semantics = "clear this micro" in
  // buildFieldsPatch).
  const draftMicros = draft.micros ?? {};
  const microsErrs: MicrosErrors = {};
  for (const [canonicalKey, raw] of Object.entries(draftMicros)) {
    if (typeof raw !== 'string') continue;
    const validation = validateMicroValue(raw);
    if (validation.kind === 'invalid') {
      microsErrs[canonicalKey] =
        validation.reason === 'nan'
          ? t.library.detail.errMicroNumber
          : t.library.detail.errMacroNonneg;
    }
  }
  if (Object.keys(microsErrs).length > 0) {
    errs.micros = microsErrs;
  }

  return errs;
}

export function useFoodDetailEdit(initial: LibraryItem) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => itemToDraft(initial));
  const [errors, setErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  const initialDraft = useMemo(() => itemToDraft(initial), [initial]);

  const dirty = useMemo(() => {
    for (const key of Object.keys(draft) as DraftKey[]) {
      if (key === 'micros') {
        // Deep compare canonical-keyed bag — top-level identity check
        // would always read dirty since itemToDraft mints a fresh object.
        const a = draft.micros ?? {};
        const b = initialDraft.micros ?? {};
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return true;
        for (const k of aKeys) {
          if (a[k] !== b[k]) return true;
        }
        continue;
      }
      if (draft[key] !== initialDraft[key]) return true;
    }
    return false;
  }, [draft, initialDraft]);

  const setField = useCallback((key: DraftKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Clear this field's error on change (error re-validates on commit).
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * bugfix library-micros-parse — generic per-micro setter. Canonical-
   * keyed.
   *
   * Codex R3 I2-R2-1 (2026-05-17) — the negative clamp `Math.max(n, 0)` was
   * removed. Silently coercing `-5` → `0` bypassed `validateMicroValue` /
   * the R1 I1 contract and let invalid user input save as a valid zero with
   * no UX feedback. Negatives now propagate as raw strings and surface in
   * `errs.micros[canonicalKey]` on commit so the user can see + fix the
   * error. NaN strings also propagate verbatim for the same reason.
   *
   * The MAX_MICRO_VALUE upper clamp is preserved: it's a data-integrity
   * defense (against `1e20`-style overflow), not a user-typo class — the
   * existing `EDIT_ITEM_MICRO` confirmation-screen reducer treats it the
   * same way. The clamp only fires when the parsed number EXCEEDS the
   * bound; sub-bound finite values flow through verbatim.
   *
   * Empty string is allowed (input stays controllable; commit treats it as
   * "clear this micro").
   */
  const setMicro = useCallback((canonicalKey: string, rawValue: string) => {
    setDraft((prev) => {
      const trimmed = rawValue.trim();
      let nextValue = rawValue;
      if (trimmed !== '') {
        const n = Number(trimmed);
        if (Number.isFinite(n) && n > MAX_MICRO_VALUE) {
          // Upper-bound only — the data-integrity defense. Negatives and
          // NaN propagate verbatim so validateDraft can flag them with a
          // proper per-key error.
          nextValue = String(MAX_MICRO_VALUE);
        }
      }
      const nextMicros = { ...(prev.micros ?? {}), [canonicalKey]: nextValue };
      return { ...prev, micros: nextMicros };
    });
    // Mirror `setField` — clear THIS canonical key's micro error on edit
    // so the user gets immediate feedback when correcting an invalid value.
    setErrors((prev) => {
      if (!prev.micros || prev.micros[canonicalKey] === undefined) return prev;
      const nextMicros = { ...prev.micros };
      delete nextMicros[canonicalKey];
      const next = { ...prev };
      if (Object.keys(nextMicros).length === 0) {
        delete next.micros;
      } else {
        next.micros = nextMicros;
      }
      return next;
    });
  }, []);

  const enter = useCallback(() => {
    setDraft(itemToDraft(initial));
    setErrors({});
    setEditing(true);
  }, [initial]);

  const cancel = useCallback(() => {
    setDraft(itemToDraft(initial));
    setErrors({});
    setEditing(false);
  }, [initial]);

  const commit = useCallback(
    async ({
      itemId,
      onCommitted,
      onFailed,
    }: {
      itemId: string;
      onCommitted: (next: LibraryItem) => void;
      onFailed: (message: string) => void;
    }): Promise<boolean> => {
      const validation = validateDraft(draft);
      if (Object.keys(validation).length > 0) {
        // Codex R1-I1 (bugfix batch followups 2026-05-17) — surface a
        // top-level save banner whenever validation blocks a save. The
        // prior code only set per-field `errors`; if the errored input
        // lived inside a CLOSED Radix Collapsible (the generic-micros
        // expand panel below sodium) the focus call below was a no-op
        // and the user saw no signal that Save had been blocked. Adding
        // `_form` mirrors the network-failure path AND calling
        // `onFailed(saveFailedBanner)` triggers the parent
        // FoodDetail's `<p role="alert">` banner regardless of which
        // input owns the error or whether its panel is open.
        const bannerMessage = t.library.detail.saveFailedBanner;
        setErrors({ ...validation, _form: bannerMessage });
        onFailed(bannerMessage);
        // V10 (Task 4.2 round 1 a11y fix) — focus the first invalid field
        // in canonical top-to-bottom field order so keyboard/SR users
        // can immediately edit it. Uses the id convention `fd-edit-${key}`
        // shared by every input in FoodDetailName + FoodDetailMacros.
        //
        // Codex R3 I2-R2-2 (2026-05-17) — the order now ends with `micros`,
        // meaning "if no DraftKey errored, fall through to the first errored
        // generic micro input." The micros panel sits beneath sodium in the
        // visual layout, so this preserves top-to-bottom focus walking.
        const ORDER: DraftKey[] = [
          'display_name',
          'default_portion',
          'default_unit',
          'kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fiber_g',
          // Phase 2C — cholesterol row sits beneath fiber in the macros
          // block; error focus walks top-to-bottom matching the layout.
          'cholesterol_mg',
          'sugar_g',
          'sodium_mg',
          // Codex R3 I2-R2-2 — generic micros are the LAST visual block
          // (collapsible expand panel below the dedicated sodium input).
          // When `errs.micros` carries any keys, the first errored
          // canonical micro input is the focus target.
          'micros',
        ];
        const firstErr = ORDER.find((k) => {
          const v = validation[k];
          if (v === undefined) return false;
          if (k === 'micros') {
            // Per-key error map — only truthy when at least one canonical
            // key has an error string.
            return typeof v === 'object' && v !== null && Object.keys(v).length > 0;
          }
          return Boolean(v);
        });
        if (firstErr && typeof document !== 'undefined') {
          // Map DraftKey → input DOM id. Ids predate the round-1 fix and
          // don't follow a single convention (some are short labels, some
          // are the exact key), so spell out the mapping here.
          const ID_MAP: Record<Exclude<DraftKey, 'micros'>, string> = {
            display_name: 'fd-edit-name',
            default_portion: 'fd-edit-portion',
            default_unit: 'fd-edit-unit',
            kcal: 'fd-edit-kcal',
            protein_g: 'fd-edit-protein_g',
            carbs_g: 'fd-edit-carbs_g',
            fat_g: 'fd-edit-fat_g',
            fiber_g: 'fd-edit-fiber',
            // Phase 2C — cholesterol input id matches the convention
            // used by the FoodDetailMacros MacroDisplay errorKey wiring.
            cholesterol_mg: 'fd-edit-cholesterol_mg',
            sugar_g: 'fd-edit-sugar',
            sodium_mg: 'fd-edit-sodium',
          };
          // Codex R3 I2-R2-2 — resolve the focus target. For DraftKey errors
          // it's a direct id lookup. For `micros` errors, pick the first
          // canonical key in the error map and route to its generic-micro
          // input id (`fd-edit-micro-${canonicalKey}`), the convention
          // `<EditMicrosCollapsible />` uses for non-sodium rows.
          let targetId: string;
          if (firstErr === 'micros') {
            const microsErr = validation.micros;
            // Pick the first errored canonical micro key (Object.keys
            // preserves insertion order which mirrors validateDraft's
            // iteration order across `draft.micros`, which mirrors the
            // visual render order from DEFAULT_MICROS_LIST in
            // FoodDetailMacros::EditMicrosCollapsible).
            const firstMicroKey =
              microsErr && typeof microsErr === 'object' ? Object.keys(microsErr)[0] : undefined;
            targetId = firstMicroKey ? `fd-edit-micro-${firstMicroKey}` : '';
          } else {
            targetId = ID_MAP[firstErr];
          }
          if (targetId) {
            // Defer focus so it runs AFTER the click handler's default focus
            // on SAVE + React's re-render pass. Without deferral, the click
            // focus would overwrite our call and the user would see focus
            // stuck on the submit button.
            //
            // Codex R3 — for micros, the input lives inside a Radix
            // Collapsible that may be CLOSED. We can't reliably expand it
            // from imperative code (no public ref to the Radix root). The
            // focus call still fires; if the panel is closed the element
            // isn't in the DOM and the focus call is a no-op. Worst case
            // the user sees the SAVE banner + can manually expand the
            // panel — the error message is still rendered next to the
            // input once they do.
            setTimeout(() => {
              const el = document.getElementById(targetId);
              if (el instanceof HTMLElement) el.focus();
            }, 0);
          }
        }
        return false;
      }

      const fields = buildFieldsPatch(initial, draft);
      if (!fields) {
        // Nothing to commit; treat as success (closes edit mode cleanly).
        setEditing(false);
        return true;
      }

      const parsed = EditFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        setErrors({ _form: t.library.detail.saveFailedBanner });
        return false;
      }

      setSaving(true);
      try {
        const result = await authPost<{ item: LibraryItem }>(`/api/library/${itemId}/update`, {
          client_id: crypto.randomUUID(),
          fields: parsed.data,
        });
        setSaving(false);
        setEditing(false);
        setErrors({});
        onCommitted(result.item);
        return true;
      } catch (err) {
        setSaving(false);
        const message = t.library.detail.saveFailedBanner;
        setErrors((prev) => ({ ...prev, _form: message }));
        onFailed(message);
        // Surface error upstream only on non-session failures.
        void err;
        return false;
      }
    },
    [draft, initial],
  );

  return {
    editing,
    draft,
    errors,
    saving,
    dirty,
    setField,
    setMicro,
    enter,
    cancel,
    commit,
  };
}

// Expose pure validators for testing.
export const __internals = {
  itemToDraft,
  buildFieldsPatch,
  validateDraft,
};
