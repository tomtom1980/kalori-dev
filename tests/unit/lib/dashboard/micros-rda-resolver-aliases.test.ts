/**
 * Task C.CODEX Round 1 — RDA resolver legacy/unit-suffixed alias map.
 *
 * Codex flagged a storage/UI schema mismatch: the library edit UI persists
 * micros under unit-suffixed keys (e.g. `sodium_mg`) and Log Now copies that
 * snapshot verbatim into `food_entries.items[0].micros`. The resolver only
 * matched canonical codes (`sodium`) or display names (`Sodium`), so real
 * user-entered values were silently dropped from `<MicrosRdaPanel />`.
 *
 * This regression test pins the alias-map behaviour:
 *   - unit-suffixed keys whose suffix matches the canonical row's declared
 *     unit (`sodium_mg`, `iron_mg`, `vitamin_c_mg`, `vitamin_a_mcg`, ...) MUST
 *     attribute to the matching canonical bucket with NO value conversion;
 *   - cross-unit suffixes (e.g. `sodium_g` when canonical declares `mg`)
 *     MUST be silently dropped — the resolver doesn't unit-convert and a
 *     false-positive match would corrupt totals by 1000x;
 *   - unrelated unit-suffixed keys (`foobar_mg`) MUST still be dropped — the
 *     alias map is a closed allowlist sourced from `DEFAULT_MICROS_LIST`;
 *   - existing canonical (`sodium`) + display-name (`Sodium`) resolution
 *     paths MUST keep working — no regression on prior fixes.
 *
 * The alias map is built from `DEFAULT_MICROS_LIST` at module load so any
 * future canonical-code or unit change cascades automatically without
 * editing this test.
 */
import { describe, expect, it } from 'vitest';

import { resolveMicrosRda, type MicroRdaRow } from '@/lib/dashboard/micros-rda-resolver';
import type { FoodEntry } from '@/lib/dashboard/types';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';

type MicrosMap = Record<string, number>;

function makeEntry(items: { micros: MicrosMap }[]): FoodEntry {
  return {
    id: `e${Math.random()}`,
    client_id: `c${Math.random()}`,
    logged_at: '2026-05-14T05:00:00.000Z',
    meal_category: 'breakfast',
    source: 'library',
    library_item_id: 'lib-1',
    items: items.map((it, i) => ({
      name: `item-${i}`,
      portion: 1,
      unit: 'piece',
      kcal: 100,
      macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
      micros: it.micros,
      confidence: 0.9,
    })),
    ai_reasoning: null,
  };
}

function rowFor(rows: MicroRdaRow[], code: string): MicroRdaRow {
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`code ${code} not present in resolver output`);
  return row;
}

describe('Task C.CODEX R1 — micros-rda-resolver legacy unit-suffixed aliases', () => {
  it('sodium_mg (library-UI persisted shape) resolves to canonical sodium row', () => {
    // The library edit UI writes `nutrition.micros.sodium_mg`. Log Now
    // ships the same shape into `food_entries.items[0].micros`. The
    // resolver previously dropped this key because it matched neither
    // `sodium` (canonical) nor `Sodium` (display name).
    const entry = makeEntry([{ micros: { sodium_mg: 1150 } }]); // 50% of 2300mg RDA
    const rows = resolveMicrosRda([entry]);

    const sodium = rowFor(rows, 'sodium');
    expect(sodium.value).toBe(1150);
    expect(sodium.unit).toBe('mg');
    expect(sodium.pct).toBe(50);
    expect(sodium.meetsThreshold).toBe(false);

    // The aliased key MUST NOT show up as a separate row.
    expect(rows.find((r) => r.code === 'sodium_mg')).toBeUndefined();
  });

  it('iron_mg (test-fixture shape from food-detail-edit) resolves to canonical iron row', () => {
    // The existing food-detail-edit-validation test fixture seeds
    // `micros: { sodium_mg, iron_mg, vitamin_c_mg }` — confirms `_mg`
    // suffixed keys are an in-repo persistence shape, not just sodium.
    const entry = makeEntry([{ micros: { iron_mg: 9 } }]); // 50% of 18mg RDA
    const rows = resolveMicrosRda([entry]);

    const iron = rowFor(rows, 'iron');
    expect(iron.value).toBe(9);
    expect(iron.unit).toBe('mg');
    expect(iron.pct).toBe(50);
  });

  it('vitamin_c_mg (test-fixture shape) resolves to canonical vitamin_c row', () => {
    const entry = makeEntry([{ micros: { vitamin_c_mg: 45 } }]); // 50% of 90mg RDA
    const rows = resolveMicrosRda([entry]);

    const vc = rowFor(rows, 'vitamin_c');
    expect(vc.value).toBe(45);
    expect(vc.unit).toBe('mg');
    expect(vc.pct).toBe(50);
  });

  it('vitamin_a_mcg (microgram-suffixed) resolves when suffix matches canonical unit', () => {
    // Vitamin A's canonical row declares `unit: 'mcg'`. A `_mcg` suffixed
    // key matches by unit so the alias map attributes it directly with no
    // conversion.
    const entry = makeEntry([{ micros: { vitamin_a_mcg: 450 } }]); // 50% of 900mcg RDA
    const rows = resolveMicrosRda([entry]);

    const va = rowFor(rows, 'vitamin_a');
    expect(va.value).toBe(450);
    expect(va.unit).toBe('mcg');
    expect(va.pct).toBe(50);
  });

  it('mixed canonical + alias keys for the same row sum into one bucket', () => {
    // Entry 1 ships the canonical AI shape. Entry 2 ships the library-UI
    // alias shape. Both MUST sum into the SAME canonical bucket.
    const e1 = makeEntry([{ micros: { sodium: 800 } }]);
    const e2 = makeEntry([{ micros: { sodium_mg: 700 } }]);
    const rows = resolveMicrosRda([e1, e2]);

    const sodium = rowFor(rows, 'sodium');
    expect(sodium.value).toBe(1500); // 800 + 700
  });

  it('cross-unit suffix (e.g. sodium_g when canonical is mg) MUST be dropped, not coerced', () => {
    // Sodium's canonical unit is `mg`. A `_g` suffix would be off by 1000x;
    // the resolver does NOT unit-convert, so attributing this value would
    // silently inflate sodium intake by three orders of magnitude. The
    // alias map MUST be a closed allowlist — only matches when suffix
    // equals canonical unit.
    const entry = makeEntry([{ micros: { sodium_g: 2 } }]); // would be 2000mg if mis-coerced
    const rows = resolveMicrosRda([entry]);

    const sodium = rowFor(rows, 'sodium');
    expect(sodium.value).toBe(0); // dropped, NOT 2 and NOT 2000
    expect(sodium.pct).toBe(0);
  });

  it('unknown suffixed key (foobar_mg) is silently dropped — no false-positive match', () => {
    // The alias map is built from DEFAULT_MICROS_LIST only. A made-up
    // suffix like `foobar_mg` must NOT match any canonical row.
    const entry = makeEntry([{ micros: { foobar_mg: 999, vitamin_c: 90 } }]);
    const rows = resolveMicrosRda([entry]);

    // No phantom row for the bogus key.
    expect(rows.find((r) => r.code === 'foobar_mg')).toBeUndefined();
    // Every canonical row sums correctly — vitamin_c value unaffected by
    // the noise key.
    expect(rowFor(rows, 'vitamin_c').value).toBe(90);
    // Output length still equals canonical length.
    expect(rows).toHaveLength(DEFAULT_MICROS_LIST.length);
  });

  it('NO REGRESSION: canonical snake_case key (sodium) still resolves directly', () => {
    const entry = makeEntry([{ micros: { sodium: 2300 } }]);
    const rows = resolveMicrosRda([entry]);

    const sodium = rowFor(rows, 'sodium');
    expect(sodium.value).toBe(2300);
    expect(sodium.pct).toBe(100);
  });

  it('NO REGRESSION: display-name key (Sodium) still resolves via inverse-display map', () => {
    // Codex R2 HIGH 2 fix path — display-name keys come from legacy persisted
    // entries / warm AI-cache rows. Must keep working after the alias-map
    // change is layered in.
    const entry = makeEntry([{ micros: { Sodium: 2300 } }]);
    const rows = resolveMicrosRda([entry]);

    const sodium = rowFor(rows, 'sodium');
    expect(sodium.value).toBe(2300);
    expect(sodium.pct).toBe(100);
  });

  it('all three resolution paths (canonical + display-name + alias) merge into one bucket', () => {
    // Multi-entry day where the user has logged via three different
    // surfaces — text-parse (canonical `sodium`), legacy cache row
    // (`"Sodium"`), library item edited via FoodDetail UI (`sodium_mg`).
    // All three MUST sum into the single canonical sodium row.
    const e1 = makeEntry([{ micros: { sodium: 400 } }]);
    const e2 = makeEntry([{ micros: { Sodium: 500 } }]);
    const e3 = makeEntry([{ micros: { sodium_mg: 600 } }]);
    const rows = resolveMicrosRda([e1, e2, e3]);

    expect(rowFor(rows, 'sodium').value).toBe(1500); // 400 + 500 + 600
  });
});
