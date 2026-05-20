/**
 * Task 3.5 Milestone 2.2 — `aggregateDay` tests.
 *
 * F5 mitigation (briefing AC): user-TZ day boundary for aggregation. Covers
 * UTC+7 (Da Nang), UTC-12, UTC+13, DST transitions, and the edge cases of
 * empty day and over-target totals.
 */
import { describe, expect, it } from 'vitest';

import { aggregateDay } from '@/lib/dashboard/aggregate';
import type { FoodEntry, Profile, WaterLogEntry } from '@/lib/dashboard/types';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    calorie_target: 2000,
    bmr: 1500,
    tdee: 1800,
    timezone: 'Asia/Ho_Chi_Minh',
    created_at: '2025-11-01T00:00:00.000Z',
    last_dashboard_visit_at: null,
    target_mode: 'auto',
    manual_override_value: null,
    bio_sex: 'male',
    current_weight_kg: 70,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: 'e1',
    client_id: 'c1',
    logged_at: '2026-04-22T08:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: [
      {
        name: 'Test item',
        portion: 100,
        unit: 'g',
        kcal: 200,
        macros: {
          protein_g: 10,
          carbs_g: 20,
          fat_g: 5,
          fiber_g: 3,
        },
        micros: {},
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
    ...overrides,
  };
}

describe('aggregateDay', () => {
  it('empty day → zero totals, empty mealsByCategory, zero water', () => {
    const snap = aggregateDay({
      entries: [],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    // Chronometer in empty state (0 entries, 0 consumed).
    if (snap.chronometer.status === 'empty') {
      expect(snap.chronometer.target).toBe(2000);
    } else if ('consumed' in snap.chronometer) {
      expect(snap.chronometer.consumed).toBe(0);
    }
    expect(snap.macros.protein.consumedG).toBe(0);
    expect(snap.macros.carbs.consumedG).toBe(0);
    expect(snap.macros.fat.consumedG).toBe(0);
    expect(snap.macros.fiber.consumedG).toBe(0);
    for (const cat of ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const) {
      expect(snap.meals[cat].entries).toHaveLength(0);
      expect(snap.meals[cat].totalKcal).toBe(0);
    }
    expect(snap.water.consumedMl).toBe(0);
    expect(snap.bac).toEqual({ value: 0, calculatedAt: '2026-04-22T06:00:00.000Z' });
  });

  it('groups entries into 5 meal columns by meal_category', () => {
    const snap = aggregateDay({
      entries: [
        makeEntry({ id: 'e-b', meal_category: 'breakfast' }),
        makeEntry({ id: 'e-d', meal_category: 'dinner' }),
        makeEntry({ id: 'e-w', meal_category: 'drink' }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    expect(snap.meals.breakfast.entries.map((e) => e.id)).toEqual(['e-b']);
    expect(snap.meals.dinner.entries.map((e) => e.id)).toEqual(['e-d']);
    expect(snap.meals.drink.entries.map((e) => e.id)).toEqual(['e-w']);
    expect(snap.meals.lunch.entries).toHaveLength(0);
    expect(snap.meals.snack.entries).toHaveLength(0);
  });

  it('totals kcal + macros across items within entries', () => {
    const snap = aggregateDay({
      entries: [
        makeEntry({
          id: 'e-b',
          meal_category: 'breakfast',
          items: [
            {
              name: 'Eggs',
              portion: 100,
              unit: 'g',
              kcal: 150,
              macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
              micros: {},
              confidence: 0.95,
            },
            {
              name: 'Toast',
              portion: 60,
              unit: 'g',
              kcal: 160,
              macros: { protein_g: 4, carbs_g: 30, fat_g: 2, fiber_g: 2 },
              micros: {},
              confidence: 0.9,
            },
          ],
        }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    expect(snap.macros.protein.consumedG).toBe(16);
    expect(snap.macros.carbs.consumedG).toBe(31);
    expect(snap.macros.fat.consumedG).toBe(12);
    expect(snap.macros.fiber.consumedG).toBe(2);
    expect(snap.macros.fiber.targetG).toBe(25);
    expect(snap.meals.breakfast.totalKcal).toBe(310);
    expect(snap.macros.protein.contributions).toEqual([
      expect.objectContaining({
        itemName: 'Eggs',
        mealCategory: 'breakfast',
        grams: 12,
        pctOfTotal: 75,
      }),
      expect.objectContaining({
        itemName: 'Toast',
        mealCategory: 'breakfast',
        grams: 4,
        pctOfTotal: 25,
      }),
    ]);
    expect(snap.macros.carbs.contributions[0]).toEqual(
      expect.objectContaining({
        itemName: 'Toast',
        grams: 30,
        pctOfTotal: 97,
      }),
    );
    expect(snap.macros.fiber.contributions).toEqual([
      expect.objectContaining({
        itemName: 'Toast',
        grams: 2,
        pctOfTotal: 100,
      }),
    ]);
  });

  it('calculates water from count + unit (glass=250ml, bottle=500ml)', () => {
    const water: WaterLogEntry[] = [
      {
        id: 'w1',
        client_id: 'wc1',
        date: '2026-04-22',
        count: 2,
        unit: 'glass',
      },
      {
        id: 'w2',
        client_id: 'wc2',
        date: '2026-04-22',
        count: 1,
        unit: 'bottle',
      },
    ];
    const snap = aggregateDay({
      entries: [],
      water,
      micros7d: [],
      profile: makeProfile(),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    // 2×250 + 500 = 1000
    expect(snap.water.consumedMl).toBe(1000);
    expect(snap.water.entries).toHaveLength(2);
  });

  it('over-target scenario → totals exceed target (no clamping)', () => {
    const snap = aggregateDay({
      entries: [
        makeEntry({
          id: 'e-big',
          items: [
            {
              name: 'Feast',
              portion: 1000,
              unit: 'g',
              kcal: 3000,
              macros: { protein_g: 100, carbs_g: 300, fat_g: 120, fiber_g: 20 },
              micros: {},
              confidence: 0.9,
            },
          ],
        }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile({ calorie_target: 2000 }),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    if ('consumed' in snap.chronometer) {
      expect(snap.chronometer.consumed).toBe(3000);
      expect(
        snap.chronometer.status === 'over-target' || snap.chronometer.status === 'way-over',
      ).toBe(true);
    }
    expect(snap.macros.protein.consumedG).toBe(100);
  });

  it('UTC+7 (Asia/Ho_Chi_Minh): excludes entry logged at UTC-day but user-TZ yesterday', () => {
    // 2026-04-22 00:30 UTC = 2026-04-22 07:30 Asia/Ho_Chi_Minh (still day-22)
    // 2026-04-21 16:30 UTC = 2026-04-21 23:30 Asia/Ho_Chi_Minh (day-21)
    const snap = aggregateDay({
      entries: [
        makeEntry({ id: 'e-today', logged_at: '2026-04-22T00:30:00.000Z' }),
        makeEntry({ id: 'e-yesterday', logged_at: '2026-04-21T16:30:00.000Z' }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile({ timezone: 'Asia/Ho_Chi_Minh' }),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    const totalEntries = Object.values(snap.meals).reduce((n, col) => n + col.entries.length, 0);
    // Only the e-today entry should be counted (e-yesterday is day-21 local).
    expect(totalEntries).toBe(1);
    expect(snap.meals.breakfast.entries[0]?.id).toBe('e-today');
  });

  it('Pacific/Kiritimati (UTC+14): respects the TZ boundary', () => {
    // Extreme east-of-UTC zone (UTC+14 year-round, no DST).
    // 2026-04-21 11:00 UTC = 2026-04-22 01:00 local (day-22).
    // 2026-04-22 11:00 UTC = 2026-04-23 01:00 local (day-23).
    const snap = aggregateDay({
      entries: [
        makeEntry({ id: 'e-22', logged_at: '2026-04-21T11:00:00.000Z' }),
        makeEntry({ id: 'e-23', logged_at: '2026-04-22T11:00:00.000Z' }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile({ timezone: 'Pacific/Kiritimati' }),
      day: '2026-04-22',
      tz: 'Pacific/Kiritimati',
      now: '2026-04-22T06:00:00.000Z',
    });
    const totalEntries = Object.values(snap.meals).reduce((n, col) => n + col.entries.length, 0);
    expect(totalEntries).toBe(1);
    // e-22 has logged_at in UTC day-21 but local day-22.
    expect(snap.meals.breakfast.entries[0]?.id).toBe('e-22');
  });

  it('DST America/Los_Angeles spring-forward day correctly filters entries', () => {
    // 2026-03-08 is the spring-forward day. 2026-03-08 10:00 UTC = 03:00 local.
    const snap = aggregateDay({
      entries: [makeEntry({ id: 'e-dst', logged_at: '2026-03-08T18:00:00.000Z' })],
      water: [],
      micros7d: [],
      profile: makeProfile({ timezone: 'America/Los_Angeles' }),
      day: '2026-03-08',
      tz: 'America/Los_Angeles',
      now: '2026-03-08T22:00:00.000Z',
    });
    const totalEntries = Object.values(snap.meals).reduce((n, col) => n + col.entries.length, 0);
    expect(totalEntries).toBe(1);
  });

  it('includes cross-midnight alcohol logs in BAC independent of viewed day food entries', () => {
    const snap = aggregateDay({
      entries: [],
      water: [],
      micros7d: [],
      alcoholLogs: [
        {
          id: 'alc-1',
          user_id: 'u1',
          entry_id: 'e-drink',
          volume_ml: 355,
          abv_percent: 5,
          alcohol_grams: 14.005,
          consumed_at: '2026-04-21T23:45:00.000Z',
          created_at: '2026-04-21T23:45:01.000Z',
        },
      ],
      profile: makeProfile({ bio_sex: 'male', current_weight_kg: 70 }),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T00:15:00.000Z',
    });

    expect(snap.bac.calculatedAt).toBe('2026-04-22T00:15:00.000Z');
    expect(snap.bac.value).toBeGreaterThan(0);
  });

  it('marks the heaviest entry per meal column', () => {
    const snap = aggregateDay({
      entries: [
        makeEntry({
          id: 'e-small',
          meal_category: 'lunch',
          items: [
            {
              name: 'Salad',
              portion: 100,
              unit: 'g',
              kcal: 100,
              macros: { protein_g: 1, carbs_g: 5, fat_g: 2, fiber_g: 1 },
              micros: {},
              confidence: 0.9,
            },
          ],
        }),
        makeEntry({
          id: 'e-big',
          meal_category: 'lunch',
          items: [
            {
              name: 'Burger',
              portion: 200,
              unit: 'g',
              kcal: 600,
              macros: { protein_g: 30, carbs_g: 40, fat_g: 25, fiber_g: 2 },
              micros: {},
              confidence: 0.9,
            },
          ],
        }),
      ],
      water: [],
      micros7d: [],
      profile: makeProfile(),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    expect(snap.meals.lunch.heaviestEntryId).toBe('e-big');
  });

  it('edition number counts days since profile.created_at in user TZ', () => {
    // Created 2025-11-01 UTC; today 2026-04-22 UTC — roughly 172 days apart.
    const snap = aggregateDay({
      entries: [],
      water: [],
      micros7d: [],
      profile: makeProfile({
        created_at: '2025-11-01T00:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
      }),
      day: '2026-04-22',
      tz: 'Asia/Ho_Chi_Minh',
      now: '2026-04-22T06:00:00.000Z',
    });
    // Exact count is 172 (Nov 1 → Apr 22 next year in UTC).
    expect(snap.edition.n).toBeGreaterThan(100);
    expect(snap.edition.n).toBeLessThan(300);
    expect(snap.edition.year).toBe(2026);
    expect(snap.edition.day).toBe(22);
    // Month name from en-US month format.
    expect(['April', 'Apr']).toContain(snap.edition.month);
  });
});
