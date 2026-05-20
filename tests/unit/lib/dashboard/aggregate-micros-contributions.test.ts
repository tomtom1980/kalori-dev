/**
 * Micros per-source contributors — parity with macros.
 *
 * `aggregateMicros` must now attach a `contributions: MicroContribution[]`
 * array to every `MicroRow`. Contributions are sorted by amount desc, then
 * by loggedAt asc (mirrors `macroContributions`). Each contribution
 * references the source entry + item index + micro key so the UI can
 * deep-link or render a per-item breakdown.
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

function makeEntry(
  itemsMicros: MicrosMap[],
  opts: { id?: string; loggedAt?: string } = {},
): FoodEntry {
  return {
    id: opts.id ?? 'e1',
    client_id: `c-${opts.id ?? 'e1'}`,
    logged_at: opts.loggedAt ?? '2026-05-14T05:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: itemsMicros.map((micros, i) => ({
      name: `item-${i}`,
      portion: 100,
      unit: 'g',
      kcal: 100,
      macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
      micros,
      confidence: 0.9,
    })),
    ai_reasoning: null,
  };
}

function snapshotFor(entries: FoodEntry[]) {
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

describe('aggregateMicros — per-source contributions', () => {
  it('attaches a contributions array to every returned MicroRow', () => {
    const snap = snapshotFor([makeEntry([{ sodium: 100, iron: 5 }])]);
    for (const row of snap.micros) {
      expect(Array.isArray(row.contributions)).toBe(true);
    }
  });

  it('one item contributing 30mg of sodium produces one contribution row', () => {
    // 30mg sodium against the 2300mg RDA = ~1.3% → clears the 2026-05-17
    // sub-1% display filter. The test's intent is the contribution shape,
    // not the threshold; the fixture was bumped from 10mg purely to keep
    // the row in the panel.
    const snap = snapshotFor([makeEntry([{ sodium: 30 }])]);
    const sodiumRow = snap.micros.find((r) => r.name.toLowerCase() === 'sodium');
    expect(sodiumRow).toBeDefined();
    const contribs = sodiumRow!.contributions!;
    expect(contribs.length).toBe(1);
    expect(contribs[0]?.amount).toBe(30);
    expect(contribs[0]?.itemName).toBe('item-0');
  });

  it('contributions reference correct entryId + itemIndex + microKey in id', () => {
    const snap = snapshotFor([makeEntry([{ sodium: 5 }, { sodium: 20 }], { id: 'entry-xyz' })]);
    const sodiumRow = snap.micros.find((r) => r.name.toLowerCase() === 'sodium');
    expect(sodiumRow).toBeDefined();
    const contribs = sodiumRow!.contributions!;
    const ids = contribs.map((c) => c.id);
    // id format: `${entryId}:${itemIndex}:${microKey}` — micro key is the
    // CANONICAL/display-translated name (matches the row.name lookup).
    expect(ids.some((id) => id.startsWith('entry-xyz:'))).toBe(true);
    for (const c of contribs) {
      expect(c.entryId).toBe('entry-xyz');
    }
  });

  it('contributions sorted by amount desc, then loggedAt asc', () => {
    // Two entries at different times, same micro, varying amounts. Sorted
    // by amount desc primarily; ties break by loggedAt asc (earliest first).
    const snap = snapshotFor([
      makeEntry([{ sodium: 30 }], { id: 'e-late', loggedAt: '2026-05-14T10:00:00.000Z' }),
      makeEntry([{ sodium: 30 }], { id: 'e-early', loggedAt: '2026-05-14T08:00:00.000Z' }),
      makeEntry([{ sodium: 80 }], { id: 'e-mid', loggedAt: '2026-05-14T09:00:00.000Z' }),
    ]);
    const sodiumRow = snap.micros.find((r) => r.name.toLowerCase() === 'sodium');
    expect(sodiumRow).toBeDefined();
    const ordering = sodiumRow!.contributions!.map((c) => c.entryId);
    // 80 first, then the two 30s in loggedAt-asc order.
    expect(ordering).toEqual(['e-mid', 'e-early', 'e-late']);
  });

  it('produces empty contributions for micros that nobody consumed', () => {
    // Per existing daily-audit behaviour, micros with zero consumption are
    // filtered out, so we cannot directly inspect a zero-consumption row.
    // Instead assert that an entry with NO micros yields NO micro rows at
    // all (and therefore no orphan contributions).
    const snap = snapshotFor([makeEntry([{}])]);
    expect(snap.micros).toEqual([]);
  });

  it('totals are unchanged by adding contributions tracking', () => {
    // Two items, both contributing to the same micro. Total must equal
    // the simple sum.
    const snap = snapshotFor([makeEntry([{ iron: 5 }, { iron: 7 }])]);
    const ironRow = snap.micros.find((r) => r.name.toLowerCase() === 'iron');
    expect(ironRow).toBeDefined();
    expect(ironRow?.consumed).toBe(12);
    const contribs = ironRow!.contributions!;
    expect(contribs.length).toBe(2);
    expect(contribs.reduce((s, c) => s + c.amount, 0)).toBe(12);
  });

  it('contribution unit matches the canonical micros-rda unit map (sodium=mg)', () => {
    const snap = snapshotFor([makeEntry([{ sodium: 100 }])]);
    const sodiumRow = snap.micros.find((r) => r.name.toLowerCase() === 'sodium');
    expect(sodiumRow).toBeDefined();
    // The MicroRow gains a unit field. Sodium is mg per DEFAULT_MICROS_LIST.
    expect(sodiumRow?.unit).toBe('mg');
    expect(sodiumRow!.contributions![0]?.unit).toBe('mg');
  });
});
