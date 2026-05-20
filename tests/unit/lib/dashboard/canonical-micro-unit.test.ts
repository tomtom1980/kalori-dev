/**
 * Bug 2 (library-micros batch 2026-05-17) — `canonicalMicroUnit` helper.
 *
 * The library detail view's collapsible micros block currently derives units
 * from snake_case suffixes (`*_mg`, `*_mcg`, `*_g`) via `unitFromMicroKey` in
 * `app/(app)/library/_components/FoodDetail/foodDetail.format.ts`. That works
 * today because library persistence shape is suffixed, but it returns `''`
 * for AI-drift bare canonical codes (`vitamin_c`, `vitamin_a`) — making
 * vitamins A/D/K/B12 visually indistinguishable between mg / mcg / g.
 *
 * The fix is to route every library-micro unit lookup through ONE canonical
 * map (`CANONICAL_CODE_TO_UNIT`) sourced from `DEFAULT_MICROS_LIST` — the
 * same single source of truth the dashboard resolver (`resolveMicrosRda`)
 * and the AI prompt (`MICROS_DIRECTIVE`) already agree on. Extends lesson
 * 2026-05-15 (canonicalizeMicroKey) rather than introducing a second parallel
 * resolver.
 *
 * This file pins the helper contract:
 *   - any shape `canonicalizeMicroKey` accepts (suffixed legacy alias /
 *     canonical snake_case code / display-name) MUST resolve to the
 *     canonical row's unit;
 *   - case-insensitive lookups on the input key MUST still resolve (so
 *     `VITAMIN_C` and `vitamin_c` are equivalent for the user-typed edge);
 *   - cross-unit suffixes that the alias map intentionally drops (e.g.
 *     `sodium_g`) MUST return undefined — never silently coerce to the
 *     canonical unit;
 *   - unknown / orphan keys MUST return undefined so the caller can decide
 *     between drop / passthrough / fallback.
 */
import { describe, expect, it } from 'vitest';

import { canonicalMicroRda, canonicalMicroUnit } from '@/lib/dashboard/micros-rda-resolver';

describe('canonicalMicroUnit — Bug 2 library micros unit resolver', () => {
  it('suffixed legacy key (vitamin_c_mg) resolves to canonical mg', () => {
    expect(canonicalMicroUnit('vitamin_c_mg')).toBe('mg');
  });

  it('bare canonical snake_case code (vitamin_c) resolves to canonical mg', () => {
    expect(canonicalMicroUnit('vitamin_c')).toBe('mg');
  });

  it('uppercased canonical code (VITAMIN_C) resolves to canonical mg', () => {
    // User-typed / legacy data hardening — canonical codes are stable, but
    // input shape is not. Case-insensitive lookup matches the same alias
    // chain that `canonicalizeMicroKey` already accepts.
    expect(canonicalMicroUnit('VITAMIN_C')).toBe('mg');
  });

  it('mcg-suffixed key (vitamin_b12_mcg) resolves to canonical mcg', () => {
    expect(canonicalMicroUnit('vitamin_b12_mcg')).toBe('mcg');
  });

  it('display-name key ("Vitamin C") resolves to canonical mg', () => {
    expect(canonicalMicroUnit('Vitamin C')).toBe('mg');
  });

  it('orphan / unknown key (mystery_thing) returns undefined', () => {
    expect(canonicalMicroUnit('mystery_thing')).toBeUndefined();
  });

  it('cross-unit suffix (sodium_g, canonical is mg) returns undefined — never coerces', () => {
    // The alias map is a CLOSED ALLOWLIST keyed on canonical-unit match.
    // `sodium_g` does NOT match because sodium declares `mg` — returning
    // 'mg' here would be a 1000x value-correctness lie.
    expect(canonicalMicroUnit('sodium_g')).toBeUndefined();
  });

  it('sodium (canonical) resolves to mg', () => {
    expect(canonicalMicroUnit('sodium')).toBe('mg');
  });

  it('vitamin_a (canonical, bare) resolves to mcg — proves AI-drift bare codes get the right unit', () => {
    // The bug-reproducer case: AI prompt or future migration starts
    // emitting bare canonical codes. Without the canonical map fallback,
    // vitamin_a (an mcg micro) would have rendered without any unit.
    expect(canonicalMicroUnit('vitamin_a')).toBe('mcg');
  });
});

/**
 * Bug 3 (library-micros batch 2026-05-17) — `canonicalMicroRda` helper.
 *
 * Sibling to `canonicalMicroUnit`. Maps every raw micro key shape
 * `canonicalizeMicroKey` accepts to the canonical row's RDA from
 * `DEFAULT_MICROS_LIST`. The library detail view's collapsible micros
 * block consumes this helper to render the `· {n}% DV` mono suffix
 * alongside the unit-bearing value. Returns undefined for keys that
 * don't map to a canonical row (orphan / unknown / cross-unit suffixed
 * shapes) — the caller decides whether to drop the DV suffix entirely
 * or render the row without one.
 *
 * Contract pinned by tests below:
 *   - any shape `canonicalizeMicroKey` accepts MUST resolve to the
 *     canonical row's `rda` (vitamin_c → 90, vitamin_c_mg → 90,
 *     "Vitamin C" → 90);
 *   - unknown / orphan keys MUST return undefined so the library
 *     renderer omits the DV suffix instead of showing "0% DV" of
 *     nothing;
 *   - the helper MUST NOT introduce a NEW source of truth — it MUST
 *     read from `DEFAULT_MICROS_LIST` exactly like `canonicalMicroUnit`.
 */
describe('canonicalMicroRda — Bug 3 library micros DV resolver', () => {
  it('suffixed legacy key (vitamin_c_mg) resolves to canonical RDA 90', () => {
    expect(canonicalMicroRda('vitamin_c_mg')).toBe(90);
  });

  it('bare canonical snake_case code (vitamin_c) resolves to canonical RDA 90', () => {
    expect(canonicalMicroRda('vitamin_c')).toBe(90);
  });

  it('uppercased canonical code (VITAMIN_C) resolves to canonical RDA 90 — case-insensitive parity with unit resolver', () => {
    expect(canonicalMicroRda('VITAMIN_C')).toBe(90);
  });

  it('mcg-suffixed key (vitamin_a_mcg) resolves to canonical RDA 900', () => {
    // Vitamin A's canonical RDA is 900mcg RAE (FDA DV). Pinned so the
    // library DV % shows 88% for an 800mcg meal — same value the
    // dashboard MicrosRdaPanel computes.
    expect(canonicalMicroRda('vitamin_a_mcg')).toBe(900);
  });

  it('display-name key ("Vitamin C") resolves to canonical RDA 90', () => {
    expect(canonicalMicroRda('Vitamin C')).toBe(90);
  });

  it('orphan / unknown key (mystery_thing) returns undefined — caller omits DV suffix', () => {
    expect(canonicalMicroRda('mystery_thing')).toBeUndefined();
  });

  it('orphan but unit-suffixed key (omega3_g, not in DEFAULT_MICROS_LIST) returns undefined', () => {
    // omega3 is NOT in the canonical 30. The suffix parser would still
    // resolve `omega3_g`'s UNIT, but there's no RDA reference, so the
    // DV suffix MUST be omitted entirely rather than printed as "0% DV".
    expect(canonicalMicroRda('omega3_g')).toBeUndefined();
  });

  it('cross-unit suffix (sodium_g, canonical is mg) returns undefined — never coerces RDA', () => {
    // The alias map is a closed allowlist keyed on canonical-unit match.
    // `sodium_g` is dropped by `canonicalizeMicroKey`, so the RDA is
    // also unreachable — preserves the never-unit-convert contract.
    expect(canonicalMicroRda('sodium_g')).toBeUndefined();
  });

  it('sodium (canonical) resolves to RDA 2300', () => {
    expect(canonicalMicroRda('sodium')).toBe(2300);
  });

  it('vitamin_a (canonical, bare) resolves to RDA 900 — proves AI-drift bare codes get a DV reference', () => {
    expect(canonicalMicroRda('vitamin_a')).toBe(900);
  });
});
