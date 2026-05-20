/**
 * Task C.1 — AC4 unit test: resolver reads default constants.
 *
 * Asserts `resolveMicrosRda(todayEntries)`:
 *   - returns exactly `DEFAULT_MICROS_LIST.length` rows (no truncation, no
 *     padding) in declared order;
 *   - reads RDA from the code constant ONLY (DT-5/O-2 deferral — NO
 *     `profile.micros_rda_override`, no profile parameter);
 *   - sums each micronutrient value across every item in every entry
 *     (multi-item, multi-entry summation invariant);
 *   - silently drops AI-returned keys not present in `DEFAULT_MICROS_LIST`
 *     (defensive against future AI drift; AC1 prevents this in production);
 *   - reports `pct = round((value / rda) * 100)` and flips
 *     `meetsThreshold = pct >= 90` for the binary chip color rule.
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
    source: 'text',
    library_item_id: null,
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

describe('Task C.1 AC4 — micros-rda-resolver::reads-default-constants', () => {
  it('returns exactly DEFAULT_MICROS_LIST.length rows in declared order', () => {
    const rows = resolveMicrosRda([]);
    expect(rows).toHaveLength(DEFAULT_MICROS_LIST.length);
    rows.forEach((row, i) => {
      const entry = DEFAULT_MICROS_LIST[i];
      if (!entry) throw new Error('constant length drift in test');
      expect(row.code).toBe(entry.code);
      expect(row.name).toBe(entry.name);
      expect(row.rda).toBe(entry.rda);
      expect(row.unit).toBe(entry.unit);
    });
  });

  it('reads each row RDA verbatim from DEFAULT_MICROS_LIST (NOT from any override)', () => {
    const rows = resolveMicrosRda([]);
    for (const entry of DEFAULT_MICROS_LIST) {
      const row = rowFor(rows, entry.code);
      expect(row.rda).toBe(entry.rda);
    }
  });

  it('empty entries → every row has value=0 and pct=0', () => {
    const rows = resolveMicrosRda([]);
    for (const row of rows) {
      expect(row.value).toBe(0);
      expect(row.pct).toBe(0);
      expect(row.meetsThreshold).toBe(false);
    }
  });

  it('single entry with one item contributes value to the matching row only', () => {
    const entry = makeEntry([{ micros: { vitamin_c: 45 } }]); // RDA 90mg → 50%
    const rows = resolveMicrosRda([entry]);
    const vc = rowFor(rows, 'vitamin_c');
    expect(vc.value).toBe(45);
    expect(vc.pct).toBe(50);
    expect(vc.meetsThreshold).toBe(false);
    // Every other row stays at 0
    for (const row of rows) {
      if (row.code !== 'vitamin_c') {
        expect(row.value).toBe(0);
        expect(row.pct).toBe(0);
      }
    }
  });

  it('sums across multiple items in multiple entries', () => {
    const e1 = makeEntry([{ micros: { vitamin_c: 30, iron: 6 } }, { micros: { vitamin_c: 10 } }]);
    const e2 = makeEntry([{ micros: { iron: 3, vitamin_c: 50 } }]);
    const rows = resolveMicrosRda([e1, e2]);
    expect(rowFor(rows, 'vitamin_c').value).toBe(90); // 30 + 10 + 50
    expect(rowFor(rows, 'iron').value).toBe(9); // 6 + 3
  });

  it('flips meetsThreshold true when pct >= 90', () => {
    const entry = makeEntry([{ micros: { vitamin_c: 81 } }]); // 90% exactly
    const rows = resolveMicrosRda([entry]);
    expect(rowFor(rows, 'vitamin_c').pct).toBe(90);
    expect(rowFor(rows, 'vitamin_c').meetsThreshold).toBe(true);
  });

  it('keeps meetsThreshold false at pct=89', () => {
    const entry = makeEntry([{ micros: { vitamin_c: 80 } }]); // ~89%
    const rows = resolveMicrosRda([entry]);
    expect(rowFor(rows, 'vitamin_c').pct).toBe(89);
    expect(rowFor(rows, 'vitamin_c').meetsThreshold).toBe(false);
  });

  it('does NOT clamp pct values above 100 (resolver is data-only; UI shows raw pct)', () => {
    const entry = makeEntry([{ micros: { vitamin_c: 225 } }]); // 250%
    const rows = resolveMicrosRda([entry]);
    expect(rowFor(rows, 'vitamin_c').pct).toBe(250);
    expect(rowFor(rows, 'vitamin_c').meetsThreshold).toBe(true);
  });

  it('silently drops AI-returned keys that are NOT in DEFAULT_MICROS_LIST', () => {
    const entry = makeEntry([{ micros: { vitamin_c: 90, made_up_key: 999 } }]);
    const rows = resolveMicrosRda([entry]);
    // Only the canonical codes appear in output
    expect(rows.find((r) => r.code === 'made_up_key')).toBeUndefined();
    // vitamin_c is unaffected
    expect(rowFor(rows, 'vitamin_c').value).toBe(90);
  });

  it('treats absent micros (entry has empty {}) as zero contribution', () => {
    const entry = makeEntry([{ micros: {} }]);
    const rows = resolveMicrosRda([entry]);
    for (const row of rows) {
      expect(row.value).toBe(0);
      expect(row.pct).toBe(0);
    }
  });
});

/**
 * Task C.1 — Codex Round 2 Finding HIGH 2 regression.
 *
 * Earlier persisted entries + still-warm AI cache rows may carry
 * display-name micros keys (e.g. `"Vitamin C"`) because both the save and
 * PATCH schemas accept arbitrary `micros` maps (`z.record(z.string(),
 * z.number())` at the request boundary). The original `resolveMicrosRda`
 * only read `micros[entry.code]` (canonical snake_case keys), so those
 * legacy rows showed up as 0 in the new MicrosRdaPanel and underreported
 * the user's actual micronutrient intake.
 *
 * Fix: when a key is not a canonical code, look it up in the inverse
 * `DISPLAY_NAME_TO_CANONICAL_CODE` map (sourced from
 * `lib/nutrition/micros-rda.ts`). If it matches, attribute the value to
 * the canonical bucket. Unknown keys (neither canonical code nor display
 * name) are silently dropped — already the resolver's documented AI-drift
 * defense per file header.
 */
describe('Task C.1 Codex R2 Finding HIGH 2 — legacy display-name fallback', () => {
  it('legacy display-name keys translated to canonical codes', () => {
    // Legacy AI-cache payload + older entries used display-name keys
    // verbatim ("Vitamin C" instead of "vitamin_c"). Resolver must
    // attribute these to the matching canonical row, not drop them.
    const entry = makeEntry([{ micros: { 'Vitamin C': 45, Iron: 9 } }]);
    const rows = resolveMicrosRda([entry]);

    // 45 mg of vitamin_c → 50% of 90mg RDA
    const vc = rowFor(rows, 'vitamin_c');
    expect(vc.value).toBe(45);
    expect(vc.pct).toBe(50);

    // 9 mg of iron → 50% of 18mg RDA
    const ir = rowFor(rows, 'iron');
    expect(ir.value).toBe(9);
    expect(ir.pct).toBe(50);

    // The display-name keys MUST NOT show up as separate rows.
    expect(rows.find((r) => r.code === 'Vitamin C')).toBeUndefined();
    expect(rows.find((r) => r.code === 'Iron')).toBeUndefined();
  });

  it('mixed canonical + display-name keys for the same row merge into one bucket', () => {
    // Entry 1 uses the new canonical key; entry 2 uses the legacy display
    // name. Both should sum into the SAME canonical Vitamin C row.
    const e1 = makeEntry([{ micros: { vitamin_c: 30 } }]);
    const e2 = makeEntry([{ micros: { 'Vitamin C': 60 } }]);
    const rows = resolveMicrosRda([e1, e2]);

    const vc = rowFor(rows, 'vitamin_c');
    expect(vc.value).toBe(90); // 30 + 60
    expect(vc.pct).toBe(100);
    expect(vc.meetsThreshold).toBe(true);
  });

  it('unknown keys ignored without error', () => {
    // 'made_up_key' is neither a canonical snake_case code nor a known
    // display name. Resolver must silently drop it — no throw, no
    // poisoning of any canonical row.
    const entry = makeEntry([{ micros: { made_up_key: 999, 'Not A Real Vitamin': 500 } }]);
    const rows = resolveMicrosRda([entry]);

    // Output length still equals DEFAULT_MICROS_LIST.length (no extra rows).
    expect(rows).toHaveLength(DEFAULT_MICROS_LIST.length);
    // No row carries the bogus keys.
    expect(rows.find((r) => r.code === 'made_up_key')).toBeUndefined();
    expect(rows.find((r) => r.code === 'Not A Real Vitamin')).toBeUndefined();
    // Every row is still at 0.
    for (const row of rows) {
      expect(row.value).toBe(0);
      expect(row.pct).toBe(0);
    }
  });
});
