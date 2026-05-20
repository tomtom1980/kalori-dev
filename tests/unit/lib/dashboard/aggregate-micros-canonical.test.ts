/**
 * Task C.1 — Codex Round 1 Finding 1 regression test.
 *
 * AI now returns canonical snake_case codes (`vitamin_c`, `vitamin_d`, …)
 * per the `MICROS_DIRECTIVE` in the Gemini prompt. The existing 7-day
 * `aggregateMicros` aggregation path (Task 3.5) looks up RDAs by display
 * name (`"vitamin c"`) and sorts by display-name priority. Without
 * canonical→display translation, the new AI shape would silently regress
 * the existing `MicronutrientPanel`: raw `vitamin_c` chips, no RDA lookup,
 * no priority ordering, misleading `status='low'`.
 *
 * Asserts:
 *   - canonical `vitamin_c` AI key aggregates into `Vitamin C` display row
 *     with the proper RDA (90 mg) and percent-of-RDA computation
 *   - aggregation across MIXED entries (some canonical, some legacy display
 *     names) merges into a single display row
 *   - unknown keys (neither canonical code nor known display name) pass
 *     through unchanged → low-priority row with `rda=null`, `status='low'`
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
    source: 'text',
    library_item_id: null,
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

describe('Task C.1 Codex R1 Finding 1 — aggregateMicros canonical→display translation', () => {
  it('translates canonical vitamin_c key into Vitamin C row with correct RDA lookup', () => {
    const entry = makeEntry({ vitamin_c: 45 }); // 50% of 90mg RDA
    const snap = aggregateDay({
      entries: [entry],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    // Find the Vitamin C row — title-case display name from DEFAULT_MICROS_LIST.
    const vcRow = snap.micros.find((r) => r.name === 'Vitamin C');
    expect(vcRow).toBeDefined();
    expect(vcRow?.consumed).toBe(45);
    // RDA lookup is by .toLowerCase() — 'Vitamin C' → 'vitamin c' → 90.
    expect(vcRow?.rda).toBe(90);
    expect(vcRow?.pct).toBe(50);
    expect(vcRow?.status).toBe('mid'); // 50% bucket

    // The raw canonical key MUST NOT appear as a separate row.
    expect(snap.micros.find((r) => r.name === 'vitamin_c')).toBeUndefined();
  });

  it('mixed canonical + legacy display-name keys converge into a single row', () => {
    // Entry 1 uses canonical code (new AI shape); entry 2 uses legacy
    // display name (older entries logged before this contract). Both
    // should aggregate into the same Vitamin C row.
    const newShape = makeEntry({ vitamin_c: 30 }, 'e1');
    const legacyShape: FoodEntry = {
      id: 'e2',
      client_id: 'c2',
      logged_at: '2026-05-14T06:00:00.000Z',
      meal_category: 'breakfast',
      source: 'text',
      library_item_id: null,
      items: [
        {
          name: 'legacy item',
          portion: 100,
          unit: 'g',
          kcal: 100,
          macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
          // The legacy AI shape used 'Vitamin C' (display name) verbatim.
          micros: { 'Vitamin C': 60 },
          confidence: 0.9,
        },
      ],
      ai_reasoning: null,
    };

    const snap = aggregateDay({
      entries: [newShape, legacyShape], // both land in today's day-scoped window
      water: [],
      micros7d: [], // no longer consumed for the snapshot's `micros` field
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    const vcRows = snap.micros.filter((r) => r.name === 'Vitamin C');
    expect(vcRows).toHaveLength(1);
    expect(vcRows[0]?.consumed).toBe(90); // 30 + 60
    expect(vcRows[0]?.rda).toBe(90);
    expect(vcRows[0]?.pct).toBe(100);
  });

  it('canonical iron and vitamin_d keys also translate to display names', () => {
    const entry = makeEntry({ iron: 9, vitamin_d: 10 });
    const snap = aggregateDay({
      entries: [entry],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    const ironRow = snap.micros.find((r) => r.name === 'Iron');
    expect(ironRow).toBeDefined();
    expect(ironRow?.consumed).toBe(9);
    expect(ironRow?.rda).toBe(18); // existing rdaLookup() iron RDA
    expect(ironRow?.pct).toBe(50);

    const vdRow = snap.micros.find((r) => r.name === 'Vitamin D');
    expect(vdRow).toBeDefined();
    expect(vdRow?.consumed).toBe(10);
    expect(vdRow?.rda).toBe(20);

    // Raw canonical codes MUST NOT appear as separate rows.
    expect(snap.micros.find((r) => r.name === 'iron')).toBeUndefined();
    expect(snap.micros.find((r) => r.name === 'vitamin_d')).toBeUndefined();
  });

  it('unknown keys (non-canonical, non-display) survive as RDA-unknown rows at the END of the list (Codex R1 C1 fix)', () => {
    // 'made_up_key' is neither a canonical code nor a known display name.
    // PRIOR BEHAVIOUR (Surface A historic): helper called with
    // `includeUnknownRda: false` → row was dropped entirely from the panel.
    // CURRENT BEHAVIOUR (post-Codex R1 C1 fix, bugfix-tomi
    // 2026-05-17-micros-display-consistency): helper called with
    // `includeUnknownRda: true` → row survives as an RDA-unknown orphan at
    // the END of the sorted list (after every RDA-having row), matching the
    // user-articulated cross-surface rule that RDA-unknown nutrients (sugar
    // / orphan / etc.) stay visible on every surface.
    //
    // Mixed fixture: known sodium (clears the 1% floor) + made_up_key
    // (orphan). The assertion structure is positional — orphan MUST come
    // after the RDA-having row(s).
    const entry = makeEntry({
      sodium: 30, // ~1.3% of 2300 RDA — clears the sub-1% floor
      made_up_key: 100,
    });
    const snap = aggregateDay({
      entries: [entry],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    const names = snap.micros.map((r) => r.name);
    expect(names).toContain('Sodium');
    expect(names).toContain('made_up_key');

    // Sodium (RDA-having) must come BEFORE the RDA-unknown made_up_key row.
    const sodiumIdx = names.indexOf('Sodium');
    const orphanIdx = names.indexOf('made_up_key');
    expect(sodiumIdx).toBeGreaterThanOrEqual(0);
    expect(orphanIdx).toBeGreaterThan(sodiumIdx);

    // Orphan row's public shape: rda=null (no reference), pct=0 (the public
    // MicroRow.pct field is always number — `formatMicroPercent` returns 0
    // when rda is null), status='unknown' (Codex R2 I2 fix —
    // `microStatus` now distinguishes RDA-unknown rows from actually-low
    // measurable rows so the dashboard renderer can omit the red/oxblood
    // "below reference" treatment).
    const orphan = snap.micros.find((r) => r.name === 'made_up_key');
    expect(orphan?.rda).toBeNull();
    expect(orphan?.pct).toBe(0);
    expect(orphan?.status).toBe('unknown');
  });

  it('dashboard includes RDA-unknown nutrients (e.g., sugar) at the end of the sorted list (Codex R1 C1)', () => {
    // Cross-surface consistency test — the user-articulated rule says that
    // RDA-unknown quantities like `sugar` (not in `DEFAULT_MICROS_LIST`, not
    // in `rdaLookup()`) must stay visible on the dashboard alongside the
    // library + confirmation surfaces. Codex R1 C1 flagged that
    // `aggregateMicros` was still calling the shared helper with
    // `includeUnknownRda: false`, breaking that cross-surface contract.
    //
    // Fixture builds a small set with varying %RDA values + 2 RDA-unknown
    // nutrients to verify both inclusion (count) and position (end of list).
    const entry = makeEntry({
      sodium: 2300, // 100% of 2300 RDA
      iron: 9, // 50% of 18 RDA
      vitamin_c: 90, // 100% of 90 RDA
      sugar: 25, // RDA-unknown — should now survive
      caffeine: 100, // RDA-unknown — should now survive
    });
    const snap = aggregateDay({
      entries: [entry],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    const names = snap.micros.map((r) => r.name);

    // INCLUSION: RDA-unknown nutrients survive aggregation.
    expect(names).toContain('sugar');
    expect(names).toContain('caffeine');

    // POSITION: RDA-unknown rows sit AFTER every RDA-having row. We do not
    // assert the precise inter-RDA ordering (the helper sorts desc by pct
    // among RDA-having rows; vitamin_c + sodium are both 100% and may tie),
    // but the partition boundary is firm: every RDA-having row precedes
    // every RDA-unknown row.
    const rdaHavingNames = ['Sodium', 'Iron', 'Vitamin C'];
    const rdaUnknownNames = ['sugar', 'caffeine'];
    for (const knownName of rdaHavingNames) {
      const knownIdx = names.indexOf(knownName);
      expect(knownIdx).toBeGreaterThanOrEqual(0);
      for (const unknownName of rdaUnknownNames) {
        const unknownIdx = names.indexOf(unknownName);
        expect(unknownIdx).toBeGreaterThan(knownIdx);
      }
    }

    // RDA-unknown rows are stable-sorted alphabetically among themselves
    // by the shared helper (`displayName.localeCompare`). caffeine < sugar.
    const caffeineIdx = names.indexOf('caffeine');
    const sugarIdx = names.indexOf('sugar');
    expect(caffeineIdx).toBeLessThan(sugarIdx);
  });

  it('RDA-having nutrients below 1% RDA are STILL filtered out (regression guard)', () => {
    // Critical regression guard: the C1 fix only changes the
    // `includeUnknownRda` flag from false → true. The `minPct: 1` filter
    // for RDA-having rows MUST continue to drop sub-1% rows so the dashboard
    // panel does not get spammed with trace contributions.
    //
    // Fixture: 1mg of sodium (0.043% of 2300 RDA — well under 1%) +
    // 9mg of iron (50% of 18 RDA — clears the filter). Sodium row MUST be
    // dropped; iron row MUST survive.
    const entry = makeEntry({
      sodium: 1, // 0.043% RDA — sub-1% floor, MUST be filtered
      iron: 9, // 50% RDA — clears filter
    });
    const snap = aggregateDay({
      entries: [entry],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-05-14',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-05-14T06:00:00.000Z',
    });

    const names = snap.micros.map((r) => r.name);
    expect(names).toContain('Iron');
    expect(names).not.toContain('Sodium');
  });
});
