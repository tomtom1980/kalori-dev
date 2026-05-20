/**
 * Task C.CODEX Round 2 Fix R2-2 — `aggregateMicros` (7-day panel) legacy
 * unit-suffixed alias map.
 *
 * Codex flagged that the Round 1 alias fix only covered the new RDA panel's
 * `resolveMicrosRda` path. The existing 7-day `aggregateMicros` aggregation
 * (Task 3.5) STILL maps only canonical codes → display names and treats
 * library-UI unit-suffixed keys (`sodium_mg`, `iron_mg`, `vitamin_c_mg`, ...)
 * as unknown rows. Result: a logged food with `sodium_mg: 2300` renders the
 * new RDA panel as 100% sodium (correct) but the 7-day panel as a `sodium_mg`
 * row with `rda=null` and `status='low'` (wrong).
 *
 * Round 2 fix: extract a shared canonicalization helper used by BOTH
 * `resolveMicrosRda` and `aggregateMicros` so the two panels agree on the
 * same canonical bucket for the same logged food.
 *
 * Asserts:
 *   - 7-day window entries with `{ micros: { sodium_mg: 2300 } }` contribute
 *     to the canonical Sodium row (not a separate `sodium_mg` row) with RDA
 *     lookup applied
 *   - Multiple unit-suffixed keys (`iron_mg`, `vitamin_c_mg`) likewise
 *     contribute to their canonical display rows
 *   - Direct `sodium` entries + `sodium_mg` entries sum into ONE row
 *   - Cross-unit suffix (e.g. `sodium_g`) is silently DROPPED — no implicit
 *     unit coercion, consistent with Round 1 resolver behavior
 *   - Display-name (`Sodium`) and canonical-code (`sodium`) keys still
 *     resolve correctly — no regression on Round 1 / R2 HIGH 2 fixes
 */
import { describe, expect, it } from 'vitest';

import { aggregateDay } from '@/lib/dashboard/aggregate';
import type { FoodEntry, Profile } from '@/lib/dashboard/types';

type MicrosMap = Record<string, number>;

function makeProfile(): Profile {
  return {
    id: 'u1',
    calorie_target: 2000,
    bmr: 1500,
    tdee: 1800,
    bio_sex: 'male',
    current_weight_kg: 70,
    timezone: 'Asia/Ho_Chi_Minh',
    created_at: '2025-11-01T00:00:00.000Z',
    last_dashboard_visit_at: null,
    target_mode: 'auto',
    manual_override_value: null,
  };
}

function makeEntry(micros: MicrosMap, id = 'e1', loggedAt = '2026-05-14T05:00:00.000Z'): FoodEntry {
  return {
    id,
    client_id: `c-${id}`,
    logged_at: loggedAt,
    meal_category: 'breakfast',
    source: 'library',
    library_item_id: 'lib-1',
    items: [
      {
        name: 'test item',
        portion: 100,
        unit: 'g',
        kcal: 100,
        macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
        micros,
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
  };
}

function runAggregate(entries: FoodEntry[]) {
  // 2026-05-16 — `snapshot.micros` is now day-scoped: it reads from the
  // user-TZ-day-filtered `entries` array, not the 7-day `micros7d` window.
  // The test SETUP feeds all sample entries via `entries` (each scheduled
  // within the `2026-05-14 Asia/Ho_Chi_Minh` day) so the canonicalization
  // assertions below still validate the same correctness properties under
  // daily semantics. `micros7d` is left empty — kept in the call site so
  // the signature regression is obvious if it ever changes.
  return aggregateDay({
    entries,
    water: [],
    micros7d: [],
    profile: makeProfile(),
    day: '2026-05-14',
    tz: 'Asia/Ho_Chi_Minh',
    now: '2026-05-14T06:00:00.000Z',
  });
}

describe('Task C.CODEX R2 — aggregateMicros daily panel legacy unit-suffixed aliases', () => {
  it('sodium_mg (library-UI persisted shape) contributes to canonical Sodium row with RDA', () => {
    // The library edit UI writes `nutrition.micros.sodium_mg`. Log Now copies
    // that verbatim. Previously, the 7-day aggregator passed `sodium_mg`
    // through unchanged → rdaLookup('sodium_mg') returns null → row renders
    // with `status='low'` instead of contributing to Sodium at 100% RDA.
    const entry = makeEntry({ sodium_mg: 2300 }); // 100% of 2300mg RDA
    const snap = runAggregate([entry]);

    const sodiumRow = snap.micros.find((r) => r.name === 'Sodium');
    expect(sodiumRow).toBeDefined();
    expect(sodiumRow?.consumed).toBe(2300);
    expect(sodiumRow?.rda).toBe(2300);
    expect(sodiumRow?.pct).toBe(100);
    expect(sodiumRow?.status).toBe('good'); // 100% bucket

    // The aliased raw key MUST NOT appear as a separate row.
    expect(snap.micros.find((r) => r.name === 'sodium_mg')).toBeUndefined();
  });

  it('iron_mg contributes to canonical Iron row', () => {
    const entry = makeEntry({ iron_mg: 9 }); // 50% of 18mg RDA
    const snap = runAggregate([entry]);

    const ironRow = snap.micros.find((r) => r.name === 'Iron');
    expect(ironRow).toBeDefined();
    expect(ironRow?.consumed).toBe(9);
    expect(ironRow?.rda).toBe(18);
    expect(ironRow?.pct).toBe(50);
    expect(ironRow?.status).toBe('mid');

    expect(snap.micros.find((r) => r.name === 'iron_mg')).toBeUndefined();
  });

  it('vitamin_c_mg contributes to canonical Vitamin C row', () => {
    const entry = makeEntry({ vitamin_c_mg: 90 }); // 100% of 90mg RDA
    const snap = runAggregate([entry]);

    const vcRow = snap.micros.find((r) => r.name === 'Vitamin C');
    expect(vcRow).toBeDefined();
    expect(vcRow?.consumed).toBe(90);
    expect(vcRow?.rda).toBe(90);
    expect(vcRow?.pct).toBe(100);

    expect(snap.micros.find((r) => r.name === 'vitamin_c_mg')).toBeUndefined();
  });

  it('vitamin_a_mcg (microgram-suffixed) contributes when suffix matches canonical unit', () => {
    // Vitamin A's canonical row in DEFAULT_MICROS_LIST declares unit `mcg`.
    // The alias map matches by unit so `vitamin_a_mcg` attributes directly.
    // rdaLookup() now has `'vitamin a': 900`, so the canonical row clears
    // the 2026-05-17 sub-1% display filter at full 100% intake.
    const entry = makeEntry({ vitamin_a_mcg: 900 });
    const snap = runAggregate([entry]);

    const vaRow = snap.micros.find((r) => r.name === 'Vitamin A');
    expect(vaRow).toBeDefined();
    expect(vaRow?.consumed).toBe(900);

    // The aliased raw key MUST NOT appear as a separate row.
    expect(snap.micros.find((r) => r.name === 'vitamin_a_mcg')).toBeUndefined();
  });

  it('mixed canonical + alias keys for the same row sum into one bucket', () => {
    // Entry 1: canonical AI shape. Entry 2: library-UI alias shape. Both
    // MUST aggregate into the SAME Sodium row.
    const e1 = makeEntry({ sodium: 800 }, 'e1');
    const e2 = makeEntry({ sodium_mg: 700 }, 'e2', '2026-05-14T06:00:00.000Z');
    const snap = runAggregate([e1, e2]);

    const sodiumRow = snap.micros.find((r) => r.name === 'Sodium');
    expect(sodiumRow).toBeDefined();
    expect(sodiumRow?.consumed).toBe(1500); // 800 + 700

    // Exactly ONE sodium row.
    expect(snap.micros.filter((r) => r.name === 'Sodium')).toHaveLength(1);
    expect(snap.micros.find((r) => r.name === 'sodium_mg')).toBeUndefined();
    expect(snap.micros.find((r) => r.name === 'sodium')).toBeUndefined();
  });

  it('cross-unit suffix (sodium_g, canonical is mg) is silently DROPPED — no implicit coercion', () => {
    // Sodium's canonical unit is `mg`. A `_g` suffix would be off by 1000x.
    // Consistent with Round 1 resolver behavior: alias map is a closed
    // allowlist keyed on canonical-unit match.
    // Add a canonical sodium contribution alongside so the sodium row
    // exists in the output (otherwise it wouldn't render — sparse row).
    const e1 = makeEntry({ sodium: 100 }, 'e1');
    const e2 = makeEntry({ sodium_g: 2 }, 'e2', '2026-05-14T06:00:00.000Z'); // would be 2000mg if coerced
    const snap = runAggregate([e1, e2]);

    const sodiumRow = snap.micros.find((r) => r.name === 'Sodium');
    expect(sodiumRow).toBeDefined();
    expect(sodiumRow?.consumed).toBe(100); // NOT 2 and NOT 2000

    // The `sodium_g` raw key MAY pass through as an orphan display-name row
    // (matches pre-existing `made_up_key` behavior in canonical test) but
    // MUST NOT inflate the canonical Sodium row.
  });

  it('NO REGRESSION: canonical snake_case key (sodium) still resolves to Sodium row', () => {
    const entry = makeEntry({ sodium: 2300 });
    const snap = runAggregate([entry]);

    const sodiumRow = snap.micros.find((r) => r.name === 'Sodium');
    expect(sodiumRow).toBeDefined();
    expect(sodiumRow?.consumed).toBe(2300);
    expect(sodiumRow?.pct).toBe(100);
    expect(snap.micros.find((r) => r.name === 'sodium')).toBeUndefined();
  });

  it('NO REGRESSION: display-name key (Sodium) still resolves to Sodium row directly', () => {
    // Legacy entry shape — pre-canonical-code AI output. The aggregator's
    // pre-existing translator returns the input unchanged when it's not a
    // canonical code, so `Sodium` stays `Sodium` and aggregates fine.
    const entry = makeEntry({ Sodium: 2300 });
    const snap = runAggregate([entry]);

    const sodiumRow = snap.micros.find((r) => r.name === 'Sodium');
    expect(sodiumRow).toBeDefined();
    expect(sodiumRow?.consumed).toBe(2300);
    expect(sodiumRow?.pct).toBe(100);
  });

  it('all three resolution paths (canonical + display-name + alias) merge into one Sodium row', () => {
    // Multi-entry 7-day window with the user logging through three surfaces:
    //   - text-parse (canonical `sodium`)
    //   - legacy AI cache row (`"Sodium"`)
    //   - library item edited via FoodDetail UI (`sodium_mg`)
    // All three MUST aggregate into the single Sodium row.
    const e1 = makeEntry({ sodium: 400 }, 'e1');
    const e2 = makeEntry({ Sodium: 500 }, 'e2', '2026-05-14T06:00:00.000Z');
    const e3 = makeEntry({ sodium_mg: 600 }, 'e3', '2026-05-14T07:00:00.000Z');
    const snap = runAggregate([e1, e2, e3]);

    const sodiumRows = snap.micros.filter((r) => r.name === 'Sodium');
    expect(sodiumRows).toHaveLength(1);
    expect(sodiumRows[0]?.consumed).toBe(1500); // 400 + 500 + 600
  });
});
