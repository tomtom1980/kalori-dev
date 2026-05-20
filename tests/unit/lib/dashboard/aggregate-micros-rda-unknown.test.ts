/**
 * Codex R2 I2 regression test (bugfix-tomi 2026-05-17-micros-display-consistency).
 *
 * `aggregateMicros` must emit RDA-unknown rows with `status: 'unknown'`
 * (NOT `'low'`) so the dashboard renderer can paint them with neutral
 * treatment instead of the red/oxblood "below reference" treatment
 * reserved for actually-low measurable rows.
 *
 * This complements the existing
 * `aggregate-micros-canonical.test.ts::"unknown keys [...] at END of list"`
 * which previously asserted `status: 'low'` for sugar/orphan rows — that
 * assertion is updated in lockstep with this fix because the public row
 * shape contract has changed.
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

describe('Codex R2 I2 — aggregateMicros emits status="unknown" for RDA-null rows', () => {
  it('sugar (no RDA reference) emits status="unknown", not status="low"', () => {
    const entry = makeEntry({
      sodium: 2300, // 100% RDA — RDA-having anchor
      sugar: 25, // RDA-unknown
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

    const sugar = snap.micros.find((r) => r.name === 'sugar');
    expect(sugar).toBeDefined();
    expect(sugar?.rda).toBeNull();
    // The KEY assertion: status is 'unknown' (not 'low'), so the renderer
    // can branch on it to omit the percent label + red color.
    expect(sugar?.status).toBe('unknown');
  });

  it('orphan keys (made_up_key) emit status="unknown"', () => {
    const entry = makeEntry({
      sodium: 2300,
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

    const orphan = snap.micros.find((r) => r.name === 'made_up_key');
    expect(orphan).toBeDefined();
    expect(orphan?.rda).toBeNull();
    expect(orphan?.status).toBe('unknown');
  });

  it('RDA-having rows continue to emit status="low" / "mid" / "good" / "over"', () => {
    // Regression guard: the I2 fix must NOT change the existing status
    // bucketing for measurable rows. Iron at 50% RDA is still 'mid'.
    const entry = makeEntry({
      iron: 9, // 50% of 18 RDA -> 'mid'
      sodium: 4600, // 200% of 2300 RDA -> 'over'
      potassium: 700, // 20% of 3500 RDA -> 'low'
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

    const iron = snap.micros.find((r) => r.name === 'Iron');
    const sodium = snap.micros.find((r) => r.name === 'Sodium');
    const potassium = snap.micros.find((r) => r.name === 'Potassium');
    expect(iron?.status).toBe('mid');
    expect(sodium?.status).toBe('over');
    expect(potassium?.status).toBe('low');
  });

  it('orders show-all rows by failing daily values before good and RDA-unknown rows', () => {
    const entry = makeEntry({
      vitamin_c: 90, // good
      iron: 3.6, // low, worst
      potassium: 1750, // mid
      sodium: 4600, // over, upper-limit failure
      sugar: 25, // unknown, included at end
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

    expect(snap.micros.map((row) => row.name).slice(0, 5)).toEqual([
      'Iron',
      'Potassium',
      'Sodium',
      'Vitamin C',
      'sugar',
    ]);
  });
});
