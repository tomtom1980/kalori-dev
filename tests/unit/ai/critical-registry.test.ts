/**
 * @vitest-environment node
 *
 * AI Critical fixture registry — SINGLE SOURCE OF TRUTH sanity (Task 3.2 +
 * Task 5.1.7 extension).
 *
 * Per testing-strategy.md §3.2 the `critical.ts` registry is the sole
 * promotion rail for merge-blocking accuracy fixtures. These specs assert:
 *   - Task 3.2 shipped 5 VN entries; Task 5.1.7 promoted 3 Western staples
 *     to critical (eggs-on-toast, large-salad, rotisserie-chicken)
 *   - Advisory tier is populated at Task 5.1.7 (5 VN regional + 7 Western
 *     + 5 edge cases + 5 vision/photo = 22 advisory entries)
 *   - Every critical slug resolves to a readable fixture via the loader
 *   - Every fixture exposes the contract fields the VN smoke suite needs
 */
import { describe, expect, it } from 'vitest';

import {
  ADVISORY_FIXTURE_NAMES,
  CRITICAL_FIXTURE_NAMES,
} from '@/tests/fixtures/ai-accuracy/critical';
import {
  loadAdvisoryFixtures,
  loadCriticalFixtures,
  loadFixtureByName,
} from '@/tests/fixtures/ai-accuracy/loader';

describe('AI Critical fixture registry (Task 3.2 + 5.1.7)', () => {
  it('CRITICAL_FIXTURE_NAMES exposes exactly 5 VN + 3 Western dishes', () => {
    expect([...CRITICAL_FIXTURE_NAMES].sort()).toEqual(
      [
        'banh-mi',
        'bun-bo-hue',
        'bun-thit-nuong',
        'com-tam',
        'pho',
        'eggs-on-toast',
        'large-salad',
        'rotisserie-chicken',
      ].sort(),
    );
  });

  it('ADVISORY_FIXTURE_NAMES is populated by Task 5.1.7 (≥17 advisory text + 5 vision)', () => {
    // 5 VN + 7 Western + 5 edge + 5 vision = 22.
    expect(ADVISORY_FIXTURE_NAMES.length).toBeGreaterThanOrEqual(17);
  });

  it('loadCriticalFixtures returns 8 fixtures, each with the canonical shape', () => {
    const fixtures = loadCriticalFixtures('all');
    expect(fixtures).toHaveLength(8);

    const regions = fixtures.map((f) => f.region);
    expect(regions.filter((r) => r === 'vn')).toHaveLength(5);
    expect(regions.filter((r) => r === 'western')).toHaveLength(3);

    for (const f of fixtures) {
      expect(f.tier).toBe('critical');
      expect(f.callType).toBe('text-parse');
      expect(typeof f.input).toBe('string');
      expect(f.input.length).toBeGreaterThan(0);
      expect(f.expected.itemCount).toBeGreaterThan(0);
      expect(f.expected.items.length).toBe(f.expected.itemCount);
      expect(f.expected.total.kcal).toBeGreaterThan(0);
      expect(f.tolerance.kcal_pct).toBeCloseTo(0.15);
      expect(f.tolerance.macro_pct).toBeCloseTo(0.2);
    }
  });

  it('loadCriticalFixtures default is VN-only (Task 3.2 invariant)', () => {
    // Codex Round 1 I1: default behavior MUST stay VN-only so the Task 3.2
    // VN smoke suite — which calls loadCriticalFixtures() with no args —
    // never picks up Western entries. The 'all' / 'western' filters are
    // explicit opt-ins for the Task 5.1.7 regression matrix.
    const vnOnly = loadCriticalFixtures();
    expect(vnOnly).toHaveLength(5);
    expect(vnOnly.every((f) => f.region === 'vn')).toBe(true);

    const westernOnly = loadCriticalFixtures('western');
    expect(westernOnly).toHaveLength(3);
    expect(westernOnly.every((f) => f.region === 'western')).toBe(true);

    const all = loadCriticalFixtures('all');
    expect(all).toHaveLength(8);
  });

  it('loadAdvisoryFixtures returns the populated Task 5.1.7 set with advisory tolerance', () => {
    const fixtures = loadAdvisoryFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(17);

    for (const f of fixtures) {
      expect(f.tier).toBe('advisory');
      expect(f.tolerance.kcal_pct).toBeCloseTo(0.2);
      expect(f.tolerance.macro_pct).toBeCloseTo(0.3);
    }
  });

  it('loadFixtureByName resolves each critical slug', () => {
    for (const slug of CRITICAL_FIXTURE_NAMES) {
      const fixture = loadFixtureByName(slug);
      expect(fixture.name).toBe(slug);
    }
  });

  it('loadFixtureByName throws for an unknown slug', () => {
    expect(() => loadFixtureByName('nonexistent-dish')).toThrow();
  });
});
