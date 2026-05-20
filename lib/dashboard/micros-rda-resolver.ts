/**
 * `lib/dashboard/micros-rda-resolver.ts` — Task C.1 (US-STAB-C1).
 *
 * Pure data normalisation for the new `<MicrosRdaPanel />` dashboard
 * panel. Iterates `DEFAULT_MICROS_LIST` in declared order, sums every
 * food item's `micros[code]` contribution across today's entries, and
 * computes `pct + meetsThreshold` for each row.
 *
 * Contract:
 *   - Output length === `DEFAULT_MICROS_LIST.length` regardless of input.
 *   - Sparse data: rows the user did not contribute have `value=0, pct=0,
 *     meetsThreshold=false`. The panel renders the empty-state branch
 *     (AC5) when EVERY row has `value === 0`; resolver does NOT branch on
 *     this — it returns raw rows. The empty-state pivot lives in the
 *     component.
 *   - DT-5 / O-2 deferral: signature accepts ONLY `todayEntries`. NO
 *     `profile` parameter, NO `profiles.micros_rda_override` lookup. The
 *     followup `F-MICROS-RDA-OVERRIDE-COLUMN` will widen the signature
 *     post-MVP. Until then RDA values come from the code constant only.
 *   - Legacy compatibility (Codex R2 HIGH 2 fix): older persisted entries
 *     + warm AI-cache rows may carry display-name keys (`"Vitamin C"`).
 *     The resolver looks each key up first against the canonical codes,
 *     then falls back to `DISPLAY_NAME_TO_CANONICAL_CODE` so legacy data
 *     attributes correctly to canonical rows. Keys matching neither map
 *     are silently dropped — AC1 makes this unreachable in fresh
 *     production traffic, but the guard means a single fixture / stub
 *     typo cannot crash the dashboard.
 *   - Unit-suffixed alias compatibility (Task C.CODEX Round 1 fix): the
 *     library edit UI (`app/(app)/library/_components/FoodDetail/`) writes
 *     micros under unit-suffixed keys (`sodium_mg`, `iron_mg`, ...) because
 *     the form was authored around the historic shape. Log Now copies the
 *     library snapshot verbatim into `food_entries.items[0].micros`, so
 *     real user-entered values arrived at the resolver with `_mg` / `_mcg`
 *     suffixes and were dropped. The alias map (`LEGACY_MICRO_KEY_ALIASES`,
 *     below) is built once from `DEFAULT_MICROS_LIST` and maps every
 *     `${code}_${unit}` pair to its canonical code. Crucially the map is a
 *     CLOSED ALLOWLIST keyed on the canonical row's declared unit — so
 *     `sodium_mg` matches (sodium declares `mg`) but `sodium_g` does NOT
 *     (would be a 1000x scale error since the resolver does not unit-
 *     convert). The resolution order is: canonical code → display name →
 *     alias map → drop. The eventual followup is to migrate library
 *     persistence to canonical codes; until then the alias map prevents
 *     real intake from being silently underreported.
 *
 * Imported by:
 *   - `lib/dashboard/aggregate.ts::aggregateDay` — runs alongside
 *     `aggregateMacros` over the same `todayEntries`.
 *
 * Imports (allowed):
 *   - `@/lib/nutrition/micros-rda` — DEFAULT_MICROS_LIST, DISPLAY_NAME_TO_CANONICAL_CODE
 *   - `@/lib/dashboard/types` — FoodEntry type only
 */
import {
  CANONICAL_CODE_TO_UNIT,
  DEFAULT_MICROS_LIST,
  DISPLAY_NAME_TO_CANONICAL_CODE,
} from '@/lib/nutrition/micros-rda';

import type { FoodEntry } from './types';

/**
 * Canonical-code → RDA lookup. Built once at module load from
 * `DEFAULT_MICROS_LIST`. Sibling to `CANONICAL_CODE_TO_UNIT` in
 * `lib/nutrition/micros-rda.ts`; mirrored here next to the unit map so the
 * library-detail resolver's two canonical helpers (`canonicalMicroUnit`,
 * `canonicalMicroRda`) read from one consistent surface and any future
 * RDA value change in the source-of-truth table cascades automatically.
 */
const CANONICAL_CODE_TO_RDA: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [m.code, m.rda])),
);

/** Threshold (per design-doc §6) — chip shows oxblood foreground when pct ≥ 90. */
const RDA_THRESHOLD_PCT = 90;

/**
 * Closed-allowlist alias map: legacy / library-UI unit-suffixed key →
 * canonical code. Built once at module load from `DEFAULT_MICROS_LIST` so
 * any future canonical-code or unit change cascades automatically.
 *
 * Membership rule: an alias EXISTS iff the suffix equals the canonical
 * row's declared unit. So `sodium` (unit `mg`) generates `sodium_mg → sodium`
 * but no `sodium_g` entry. This preserves value-correctness — the resolver
 * never unit-converts; if the suffix and canonical unit disagree the key is
 * silently dropped per the AI-drift defense in `resolveMicrosRda` below.
 *
 * Example aliases (all 30 generated automatically):
 *   sodium_mg → sodium, iron_mg → iron, vitamin_c_mg → vitamin_c,
 *   vitamin_a_mcg → vitamin_a, vitamin_d_mcg → vitamin_d, ...
 */
const LEGACY_MICRO_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(DEFAULT_MICROS_LIST.map((m) => [`${m.code}_${m.unit}`, m.code])),
);

/** Canonical-code allowlist for `canonicalizeMicroKey` fast-path matching. */
const CANONICAL_MICRO_CODES: ReadonlySet<string> = new Set<string>(
  DEFAULT_MICROS_LIST.map((m) => m.code),
);

/**
 * Shared canonicalization helper consumed by BOTH `resolveMicrosRda` (the
 * new RDA panel) and `aggregateMicros` (the existing 7-day panel) in
 * `lib/dashboard/aggregate.ts`. Single source of truth for the resolution
 * chain so both dashboard surfaces agree on which canonical bucket a given
 * raw micro key belongs to — eliminates the Codex R2 finding where the two
 * panels disagreed for the same logged food.
 *
 * Resolution order (matches Round 1 inline logic in `resolveMicrosRda`):
 *   1. Unit-suffixed legacy alias (`sodium_mg`, `vitamin_a_mcg`, ...) registered
 *      in `LEGACY_MICRO_KEY_ALIASES` → canonical code. Closed allowlist keyed on
 *      canonical-unit match: `sodium_g` is NOT in the map so it does not match
 *      — the resolver never unit-converts.
 *   2. Canonical snake_case code (`sodium`, `vitamin_c`, ...) → passed through.
 *   3. Display-name key (`"Sodium"`, `"Vitamin C"`, ...) → canonical via
 *      `DISPLAY_NAME_TO_CANONICAL_CODE` (Codex R2 HIGH 2 path for legacy
 *      persisted entries + warm AI-cache rows).
 *   4. Anything else → `undefined` (unknown key — caller decides whether to
 *      drop, pass through unchanged, or treat as orphan).
 *
 * Pure function. No I/O. Safe to call in hot paths — all three maps are
 * frozen at module load.
 */
export function canonicalizeMicroKey(rawKey: string): string | undefined {
  if (LEGACY_MICRO_KEY_ALIASES[rawKey] !== undefined) {
    return LEGACY_MICRO_KEY_ALIASES[rawKey];
  }
  if (CANONICAL_MICRO_CODES.has(rawKey)) {
    return rawKey;
  }
  if (DISPLAY_NAME_TO_CANONICAL_CODE[rawKey] !== undefined) {
    return DISPLAY_NAME_TO_CANONICAL_CODE[rawKey];
  }
  return undefined;
}

/**
 * Resolve the canonical unit (`'mg' | 'mcg' | 'g'`) for any raw micro key
 * shape `canonicalizeMicroKey` accepts. Returns `undefined` for keys that
 * don't map to a canonical row — the caller decides whether to drop, pass
 * through, or fall back to a legacy resolver.
 *
 * Bug 2 (library-micros batch 2026-05-17) — the library detail view's
 * collapsible micros block (`app/(app)/library/_components/FoodDetail/`)
 * previously inferred units from snake_case suffixes via `unitFromMicroKey`.
 * That worked while every persisted micro carried a suffix (`vitamin_c_mg`)
 * but silently dropped the unit for AI-drift bare canonical codes
 * (`vitamin_c`) — making fat-soluble mcg vitamins visually indistinguishable
 * from mg micros. This helper routes EVERY library-micro unit lookup through
 * the SAME single source of truth (`DEFAULT_MICROS_LIST` → `CANONICAL_CODE_TO_UNIT`)
 * the dashboard resolver, the AI prompt, and the RDA panel already use.
 *
 * Resolution order:
 *   1. `canonicalizeMicroKey(rawKey)` — handles suffixed legacy aliases,
 *      bare canonical codes, display-name keys; returns canonical snake_case
 *      code OR undefined.
 *   2. Case-insensitive retry on the canonical-code path — user-typed or
 *      legacy uppercased data (`VITAMIN_C`) MUST still resolve, even though
 *      `canonicalizeMicroKey` is case-sensitive by design (its consumers
 *      treat case-mismatch as a drop signal).
 *   3. Lookup the canonical code in `CANONICAL_CODE_TO_UNIT`.
 *
 * Closed-allowlist contract: cross-unit suffixes the alias map intentionally
 * drops (e.g. `sodium_g`, which sodium's canonical row would never accept
 * as an `mg` alias) return `undefined` — the resolver does NOT unit-convert,
 * and silently coercing the unit would be a 1000x value-correctness lie.
 *
 * Pure function. No I/O. Safe in hot render paths — all underlying maps are
 * frozen at module load.
 */
export function canonicalMicroUnit(rawKey: string): 'mg' | 'mcg' | 'g' | undefined {
  let canonical = canonicalizeMicroKey(rawKey);
  if (canonical === undefined) {
    // Case-insensitive retry: lowercase the input and try the canonical
    // snake_case path only. Suffixed-alias and display-name maps stay
    // strict by intent — their keys are stable shapes — so we only widen
    // the canonical-code lookup, which IS naturally snake_case lowercase.
    const lowered = rawKey.toLowerCase();
    if (CANONICAL_MICRO_CODES.has(lowered)) {
      canonical = lowered;
    }
  }
  if (canonical === undefined) return undefined;
  return CANONICAL_CODE_TO_UNIT[canonical];
}

/**
 * Resolve the canonical RDA (mg / mcg / g — declared per row) for any raw
 * micro key shape `canonicalizeMicroKey` accepts. Sibling to
 * `canonicalMicroUnit` — same resolution chain, same `DEFAULT_MICROS_LIST`
 * source of truth, same closed-allowlist contract on cross-unit suffixes.
 *
 * Bug 3 (library-micros batch 2026-05-17) — the library detail view's
 * collapsible micros block previously showed only `{value} {unit}` (e.g.
 * `30 mg`) with no reference frame, while the dashboard `<MicrosRdaPanel />`
 * already rendered DV %. Routing the library renderer through this helper +
 * `formatMicroPercent` reuses the SAME canonical RDA the dashboard uses,
 * so the two surfaces cannot disagree on a row's DV % for a given food.
 *
 * Resolution order (identical to `canonicalMicroUnit`):
 *   1. `canonicalizeMicroKey(rawKey)` — handles suffixed legacy aliases,
 *      bare canonical codes, display-name keys.
 *   2. Case-insensitive retry on the canonical-code path — user-typed or
 *      legacy uppercased data (`VITAMIN_C`) MUST still resolve.
 *   3. Lookup the canonical code in `CANONICAL_CODE_TO_RDA`.
 *
 * Closed-allowlist contract: cross-unit suffixes that the alias map drops
 * (e.g. `sodium_g`) return `undefined`. Orphan keys not in
 * `DEFAULT_MICROS_LIST` (e.g. `omega3_g`) return `undefined` — the library
 * renderer omits the DV suffix entirely rather than printing "0% DV" of a
 * non-existent reference. The renderer keeps the value + unit even for
 * orphans (Bug 2 legacy fallback).
 *
 * Pure function. No I/O. Safe in hot render paths — `CANONICAL_CODE_TO_RDA`
 * is frozen at module load.
 */
export function canonicalMicroRda(rawKey: string): number | undefined {
  let canonical = canonicalizeMicroKey(rawKey);
  if (canonical === undefined) {
    // Case-insensitive retry mirrors `canonicalMicroUnit` — keeps the two
    // sibling helpers in lockstep on input-shape tolerance.
    const lowered = rawKey.toLowerCase();
    if (CANONICAL_MICRO_CODES.has(lowered)) {
      canonical = lowered;
    }
  }
  if (canonical === undefined) return undefined;
  return CANONICAL_CODE_TO_RDA[canonical];
}

/** Per-row resolver output consumed by `<MicrosRdaPanel />`. */
export interface MicroRdaRow {
  /** Stable key matching `MicroRdaEntry['code']`. */
  code: string;
  /** Display name from `DEFAULT_MICROS_LIST`. */
  name: string;
  /** Sum of `items[].micros[code]` across all today's entries. Default 0. */
  value: number;
  /** RDA from `DEFAULT_MICROS_LIST` (always positive). */
  rda: number;
  /** Unit token from `DEFAULT_MICROS_LIST` (`mg | mcg | g`). */
  unit: 'mg' | 'mcg' | 'g';
  /** `round((value / rda) * 100)`; not clamped — over-RDA may exceed 100. */
  pct: number;
  /** `pct >= 90` — binary chip color rule per design-system-snapshot. */
  meetsThreshold: boolean;
}

/**
 * Resolve today's `MicroRdaRow[]` from a flat array of `FoodEntry` rows.
 *
 * `todayEntries` is the same array `aggregateMacros` consumes — it should
 * already be filtered to today's user-TZ day by the caller (the `aggregateDay`
 * orchestrator handles the F5 user-TZ filter before invoking this resolver).
 */
export function resolveMicrosRda(todayEntries: FoodEntry[]): MicroRdaRow[] {
  // Sum each canonical micronutrient across every item in every entry.
  // Map<code, sum> keyed by the canonical codes. Key resolution is delegated
  // to `canonicalizeMicroKey` (shared with `aggregateMicros` in
  // `lib/dashboard/aggregate.ts`) so both dashboard panels agree on the
  // same canonical bucket for any given raw key. Resolution order:
  //   1. Unit-suffixed legacy alias (`sodium_mg`, `vitamin_a_mcg`, ...)
  //      registered in LEGACY_MICRO_KEY_ALIASES — closed allowlist keyed
  //      on canonical-unit match, so `sodium_g` is dropped (no unit coercion).
  //   2. Canonical snake_case code (`sodium`, `vitamin_c`, ...) — pass-through.
  //   3. Display-name (`"Sodium"`, `"Vitamin C"`, ...) via
  //      DISPLAY_NAME_TO_CANONICAL_CODE (Codex R2 HIGH 2 — legacy persisted
  //      entries + warm AI-cache rows).
  //   4. Anything else → silently drop (AI-drift defense).
  const sums = new Map<string, number>();
  for (const entry of DEFAULT_MICROS_LIST) {
    sums.set(entry.code, 0);
  }
  for (const fe of todayEntries) {
    for (const item of fe.items) {
      const micros = item.micros ?? {};
      for (const [rawKey, rawValue] of Object.entries(micros)) {
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) {
          continue;
        }
        const canonical = canonicalizeMicroKey(rawKey);
        if (canonical === undefined) continue;
        sums.set(canonical, (sums.get(canonical) ?? 0) + rawValue);
      }
    }
  }

  return DEFAULT_MICROS_LIST.map<MicroRdaRow>((entry) => {
    const value = sums.get(entry.code) ?? 0;
    const pct = entry.rda > 0 ? Math.round((value / entry.rda) * 100) : 0;
    return {
      code: entry.code,
      name: entry.name,
      value,
      rda: entry.rda,
      unit: entry.unit,
      pct,
      meetsThreshold: pct >= RDA_THRESHOLD_PCT,
    };
  });
}
