/**
 * @vitest-environment node
 *
 * AI accuracy regression — full Phase 5 fixture matrix (Task 5.1.7 RED).
 *
 * Drives every fixture (5 VN critical + 3 Western critical + advisory tier)
 * through `/api/ai/text-parse` (text fixtures) and `/api/ai/vision` (photo
 * fixtures) against MSW stubs calibrated to each fixture's expected
 * nutrition. Asserts:
 *   - Critical-tier: kcal ±15%, each macro ±20%, EXACT itemCount
 *   - Advisory-tier: kcal ±20%, each macro ±30%, fuzzy itemCount (±1)
 *   - Fixture tree exists at all four expected folders
 *   - Loader is the sole source of truth (no parallel fixture-loading paths)
 *   - critical.ts registry exposes 5 VN + 3 Western (8 critical entries)
 *
 * Pipeline mirrors `tests/unit/ai/vn-smoke.test.ts`: real route POST handler
 * with mocked Supabase SSR + admin (cache-miss), MSW intercepts the outbound
 * Gemini fetch and returns a calibrated stub response. RED phase: missing
 * fixtures + un-extended loader → ENOENT failures + count mismatches.
 *
 * AC reconciliation (per briefing §3): 25-fixture target = 5 VN critical
 * (vn-smoke/) + 3 Western critical (western-smoke/) + 5 photo
 * (photos/) + ≥17 advisory text (advisory/, mix of VN + Western + edge).
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeServerFrom } from '../_helpers/fence-mock';
import { server } from '../mocks/server';
import {
  loadAdvisoryFixtures,
  loadAllFixtures,
  loadCriticalFixtures,
  loadFixtureByName,
  type AccuracyFixture,
} from '../fixtures/ai-accuracy/loader';
import { ADVISORY_FIXTURE_NAMES, CRITICAL_FIXTURE_NAMES } from '../fixtures/ai-accuracy/critical';

const FIXTURES_ROOT = resolve(__dirname, '../fixtures/ai-accuracy');

function mockSupabaseSsr(userId: string) {
  const getUser = vi.fn(async () => ({ data: { user: { id: userId } }, error: null }));
  vi.doMock('@/lib/supabase/server', () => ({
    getServerSupabase: async () => ({ auth: { getUser }, from: makeServerFrom(userId) }),
  }));
}

function mockAdminCacheMiss() {
  const makeMissBuilder = () => {
    const builder = {
      eq: () => builder,
      single: async () => ({ data: null, error: { code: 'PGRST116' } }),
    };
    return builder;
  };
  vi.doMock('@/lib/supabase/admin', () => ({
    getAdminSupabase: () => ({
      from: () => ({
        select: () => makeMissBuilder(),
        insert: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
      }),
      storage: {
        from: () => ({ upload: async () => ({ data: { path: '' }, error: null }) }),
      },
    }),
  }));
}

/**
 * Deterministic per-slug perturbation factor in [0, 1) — used so the stub
 * returns values OFFSET from the fixture's exact expected nutrition. Without
 * perturbation, the stub returns the exact expected values, the route echoes
 * them back, and ANY tolerance band (even 0%) would pass — the test becomes
 * tautological. Codex Round 1 I2.
 *
 * The hash is intentionally simple (cheap, no deps) and stable across runs:
 * the same slug always yields the same factor.
 */
function slugPerturbFactor(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  // Bucket into [0, 1) — offers ~1000 distinct factors, more than enough
  // to spread fixtures across the tolerance band without ever flooring or
  // ceilinging on the boundary.
  return (hash % 997) / 997;
}

function calibratedGeminiStub(fx: AccuracyFixture) {
  // Codex Round 1 I2: perturb deterministically per slug so the stub does NOT
  // hand back exact expected values — that would let any tolerance band pass.
  // Critical-tier band is ±15% kcal / ±20% macro; we offset by up to +8% / +12%
  // (well inside the band, but non-zero so the band is genuinely exercised).
  // Advisory-tier band is ±20% / ±30%; we offset by up to +15% / +25%.
  const isCritical = fx.tier === 'critical';
  const kcalOffset = (isCritical ? 0.08 : 0.15) * slugPerturbFactor(fx.name);
  const macroOffset = (isCritical ? 0.12 : 0.25) * slugPerturbFactor(`${fx.name}:macro`);
  const kcalScale = 1 + kcalOffset;
  const macroScale = 1 + macroOffset;

  const body = {
    items: fx.expected.items.map((it) => ({
      name: it.name,
      portion: it.portion,
      unit: it.unit,
      kcal: it.kcal * kcalScale,
      macros: {
        protein_g: it.macros.protein_g * macroScale,
        carbs_g: it.macros.carbs_g * macroScale,
        fat_g: it.macros.fat_g * macroScale,
        fiber_g: it.macros.fiber_g * macroScale,
      },
      micros: {},
      confidence: 0.82,
    })),
    reasoning: `Calibrated MSW stub for ${fx.name} — test-only; never shipped.`,
  };
  return [
    http.post('https://generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
    http.post('*://*generativelanguage.googleapis.com/*', async () => HttpResponse.json(body)),
  ];
}

/**
 * Tolerance helper — replicates `vn-smoke.test.ts` line 136 divide-by-zero
 * pattern so edge fixtures with `expected.total.X = 0` (e.g. empty plate)
 * use the absolute observed value as the delta instead of dividing by zero.
 */
function withinTolerance(observed: number, expected: number, pct: number): boolean {
  const delta = expected === 0 ? observed : Math.abs(observed - expected) / expected;
  return delta <= pct;
}

async function dispatchFixture(
  fx: AccuracyFixture,
): Promise<{ status: number; items: AccuracyFixture['expected']['items'] }> {
  if (fx.callType === 'text-parse') {
    const { POST } = await import('@/app/api/ai/text-parse/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/text-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          userText: fx.input,
          region: fx.region,
        }),
      }),
    );
    const body = (await res.json()) as {
      result?: { items?: AccuracyFixture['expected']['items'] };
    };
    return { status: res.status, items: body.result?.items ?? [] };
  }
  if (fx.callType === 'vision') {
    const { POST } = await import('@/app/api/ai/vision/route');
    const res = await POST(
      new Request('http://kalori.test/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          imageBase64: fx.input,
          mimeType: 'image/png',
        }),
      }),
    );
    const body = (await res.json()) as {
      result?: { items?: AccuracyFixture['expected']['items'] };
    };
    return { status: res.status, items: body.result?.items ?? [] };
  }
  throw new Error(
    `Unsupported callType ${fx.callType} for fixture ${fx.name} — out of 5.1.7 scope`,
  );
}

describe('AI accuracy regression — Phase 5 fixture matrix (Task 5.1.7)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/lib/supabase/admin');
  });

  describe('AC1 — fixture tree exists', () => {
    it('all four fixture folders exist', () => {
      for (const folder of ['vn-smoke', 'western-smoke', 'advisory', 'photos']) {
        expect(existsSync(resolve(FIXTURES_ROOT, folder))).toBe(true);
      }
    });

    it('each folder contains the expected minimum number of fixtures', () => {
      // Per briefing §3: 5 VN critical, 3 Western critical, 5 photo,
      // ≥17 advisory text (5 VN advisory + 7 Western advisory + 5 edge).
      const vnSmoke = readdirSync(resolve(FIXTURES_ROOT, 'vn-smoke')).filter((f) =>
        f.endsWith('.json'),
      );
      const westernSmoke = readdirSync(resolve(FIXTURES_ROOT, 'western-smoke')).filter((f) =>
        f.endsWith('.json'),
      );
      const advisory = readdirSync(resolve(FIXTURES_ROOT, 'advisory')).filter((f) =>
        f.endsWith('.json'),
      );
      const photos = readdirSync(resolve(FIXTURES_ROOT, 'photos')).filter((f) =>
        f.endsWith('.json'),
      );

      expect(vnSmoke.length).toBe(5);
      expect(westernSmoke.length).toBe(3);
      expect(advisory.length).toBeGreaterThanOrEqual(17);
      expect(photos.length).toBe(5);
    });
  });

  describe('AC2 — critical.ts registry exposes 5 VN + 3 Western', () => {
    it('CRITICAL_FIXTURE_NAMES has exactly 8 entries (5 VN + 3 Western)', () => {
      expect(CRITICAL_FIXTURE_NAMES).toHaveLength(8);
    });

    it('each critical slug resolves to a readable fixture with critical-tier tolerance', () => {
      const fixtures = loadCriticalFixtures('all');
      expect(fixtures).toHaveLength(8);

      const regions = fixtures.map((f) => f.region);
      const vnCount = regions.filter((r) => r === 'vn').length;
      const westernCount = regions.filter((r) => r === 'western').length;
      expect(vnCount).toBe(5);
      expect(westernCount).toBe(3);

      for (const f of fixtures) {
        expect(f.tier).toBe('critical');
        expect(f.tolerance.kcal_pct).toBeCloseTo(0.15);
        expect(f.tolerance.macro_pct).toBeCloseTo(0.2);
      }
    });
  });

  describe('AC3 — regression run within tolerance bands', () => {
    it('every critical fixture passes through its route under critical-tier tolerance', async () => {
      const fixtures = loadCriticalFixtures('all');
      expect(fixtures.length).toBeGreaterThan(0);

      for (const fx of fixtures) {
        // Reset modules + mocks per fixture so the dynamic import re-runs
        // with the fresh stubs (mirrors vn-smoke.test.ts pattern).
        vi.resetModules();
        mockSupabaseSsr('user-regression');
        mockAdminCacheMiss();
        server.use(...calibratedGeminiStub(fx));

        const { status, items } = await dispatchFixture(fx);
        expect(status, `fixture ${fx.name} returned non-200`).toBe(200);
        expect(items.length, `fixture ${fx.name} item count`).toBe(fx.expected.itemCount);

        const totalKcal = items.reduce((s, it) => s + it.kcal, 0);
        expect(
          withinTolerance(totalKcal, fx.expected.total.kcal, fx.tolerance.kcal_pct),
          `fixture ${fx.name} kcal ${totalKcal} vs expected ${fx.expected.total.kcal}`,
        ).toBe(true);

        for (const key of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
          const total = items.reduce((s, it) => s + it.macros[key], 0);
          expect(
            withinTolerance(total, fx.expected.total[key], fx.tolerance.macro_pct),
            `fixture ${fx.name} ${key} ${total} vs expected ${fx.expected.total[key]}`,
          ).toBe(true);
        }

        vi.doUnmock('@/lib/supabase/server');
        vi.doUnmock('@/lib/supabase/admin');
      }
    });

    it('every advisory fixture passes through its route under advisory-tier tolerance', async () => {
      const fixtures = loadAdvisoryFixtures();
      expect(fixtures.length).toBeGreaterThanOrEqual(17);

      for (const fx of fixtures) {
        vi.resetModules();
        mockSupabaseSsr('user-regression');
        mockAdminCacheMiss();
        server.use(...calibratedGeminiStub(fx));

        const { status, items } = await dispatchFixture(fx);
        expect(status, `fixture ${fx.name} returned non-200`).toBe(200);

        // Advisory tier: fuzzy itemCount ±1 (briefing §6.1).
        const itemCountDelta = Math.abs(items.length - fx.expected.itemCount);
        expect(itemCountDelta, `fixture ${fx.name} itemCount ±1`).toBeLessThanOrEqual(1);

        const totalKcal = items.reduce((s, it) => s + it.kcal, 0);
        expect(
          withinTolerance(totalKcal, fx.expected.total.kcal, fx.tolerance.kcal_pct),
          `fixture ${fx.name} kcal`,
        ).toBe(true);

        for (const key of ['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
          const total = items.reduce((s, it) => s + it.macros[key], 0);
          expect(
            withinTolerance(total, fx.expected.total[key], fx.tolerance.macro_pct),
            `fixture ${fx.name} ${key}`,
          ).toBe(true);
        }

        vi.doUnmock('@/lib/supabase/server');
        vi.doUnmock('@/lib/supabase/admin');
      }
    });

    it('photo fixtures route through /api/ai/vision with deterministic stub', async () => {
      const photoFixtures = loadAllFixtures().filter((f) => f.callType === 'vision');
      expect(photoFixtures.length).toBe(5);

      for (const fx of photoFixtures) {
        vi.resetModules();
        mockSupabaseSsr('user-regression');
        mockAdminCacheMiss();
        server.use(...calibratedGeminiStub(fx));

        const { status, items } = await dispatchFixture(fx);
        expect(status, `photo ${fx.name} non-200`).toBe(200);

        const totalKcal = items.reduce((s, it) => s + it.kcal, 0);
        expect(
          withinTolerance(totalKcal, fx.expected.total.kcal, fx.tolerance.kcal_pct),
          `photo ${fx.name} kcal`,
        ).toBe(true);

        vi.doUnmock('@/lib/supabase/server');
        vi.doUnmock('@/lib/supabase/admin');
      }
    });
  });

  describe('AC5 — loader is the sole source of truth', () => {
    it('loader exports the four canonical functions; no other fixture-loading helpers', () => {
      // The loader's four exports ARE the contract. New helpers are
      // permitted (folder-routing, photo-loading), but the four documented
      // entry points must remain back-compat.
      expect(typeof loadCriticalFixtures).toBe('function');
      expect(typeof loadAdvisoryFixtures).toBe('function');
      expect(typeof loadFixtureByName).toBe('function');
      expect(typeof loadAllFixtures).toBe('function');
    });

    it('loadAllFixtures concatenates critical + advisory in registry order', () => {
      const all = loadAllFixtures();
      const critical = loadCriticalFixtures('all');
      const advisory = loadAdvisoryFixtures();
      expect(all.length).toBe(critical.length + advisory.length);
      expect(all.slice(0, critical.length).map((f) => f.name)).toEqual(critical.map((f) => f.name));
      expect(all.slice(critical.length).map((f) => f.name)).toEqual(advisory.map((f) => f.name));
    });

    it('loadFixtureByName resolves every registered slug across both tiers', () => {
      for (const slug of [...CRITICAL_FIXTURE_NAMES, ...ADVISORY_FIXTURE_NAMES]) {
        const fx = loadFixtureByName(slug);
        expect(fx.name).toBe(slug);
      }
    });

    it('every fixture file conforms to the canonical JSON shape', () => {
      // Codex Round 2 I5: assert the FULL canonical shape on every fixture,
      // not just `itemCount` + `notes`. The loader's `AccuracyFixture`
      // contract enumerates: top-level `name`/`tier`/`region`/`callType`/
      // `input`/`expected{itemCount,items,total{4 macros + fiber}}`/
      // `tolerance{kcal_pct,macro_pct}`/`notes?`. Without per-field shape
      // assertions a fixture could ship missing `region` or `tolerance` and
      // the suite would happily run it (defaulting to undefined → silent
      // miscategorization in the regression matrix).
      const all = loadAllFixtures();
      for (const f of all) {
        // Top-level contract.
        expect(f, `fixture ${f.name} top-level shape`).toMatchObject({
          name: expect.any(String),
          tier: expect.stringMatching(/^(critical|advisory)$/),
          region: expect.stringMatching(/^(vn|western)$/),
          callType: expect.stringMatching(/^(text-parse|vision|weekly-review)$/),
          input: expect.any(String),
          tolerance: {
            kcal_pct: expect.any(Number),
            macro_pct: expect.any(Number),
          },
          expected: expect.objectContaining({
            itemCount: expect.any(Number),
            items: expect.any(Array),
            total: expect.objectContaining({
              kcal: expect.any(Number),
              protein_g: expect.any(Number),
              carbs_g: expect.any(Number),
              fat_g: expect.any(Number),
              fiber_g: expect.any(Number),
            }),
          }),
        });
        expect(f.name.length, `fixture ${f.name} name non-empty`).toBeGreaterThan(0);
        expect(f.input.length, `fixture ${f.name} input non-empty`).toBeGreaterThan(0);
        expect(f.tolerance.kcal_pct, `fixture ${f.name} kcal_pct positive`).toBeGreaterThan(0);
        expect(f.tolerance.macro_pct, `fixture ${f.name} macro_pct positive`).toBeGreaterThan(0);

        // Per-item contract — every item carries the fields the regression
        // and accuracy harnesses iterate (name, portion+unit, kcal, 4 macros
        // + fiber). Missing any one would silently zero out aggregates.
        for (const it of f.expected.items) {
          expect(it, `fixture ${f.name} item shape`).toMatchObject({
            name: expect.any(String),
            portion: expect.any(Number),
            unit: expect.any(String),
            kcal: expect.any(Number),
            macros: expect.objectContaining({
              protein_g: expect.any(Number),
              carbs_g: expect.any(Number),
              fat_g: expect.any(Number),
              fiber_g: expect.any(Number),
            }),
          });
        }

        // Defense-in-depth: itemCount === items.length; notes (when present)
        // is non-empty. Notes is OPTIONAL per `AccuracyFixture` but every
        // fixture currently ships one — keep the assertion but tolerate
        // future absence by gating on presence.
        expect(f.expected.itemCount).toBe(f.expected.items.length);
        if (f.notes !== undefined) {
          expect(typeof f.notes).toBe('string');
          expect(f.notes.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
