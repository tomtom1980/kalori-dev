/**
 * @vitest-environment node
 *
 * Integration test for `scripts/seed.ts` (Task 1.3 AC; briefing §7.1 Option B).
 *
 * Task 1.3 scope per briefing §14-2 Option A: the seed script creates /
 * validates the dev auth user and loads the 14-day fixture JSON into memory
 * (schema validation). DB-row writes for food_entries / library_items /
 * weight_log activate in Task 3.1 once those tables exist.
 *
 * Why Option B (in-process fake admin client) for this test rather than a
 * live dev-Supabase round-trip?
 *   - No live dev-Supabase dependency at Task 1.3 means Windows + CI run
 *     deterministically (CI ubuntu boxes already test RLS substrate
 *     end-to-end via `_harness.test.ts`).
 *   - The seed logic is mostly schema validation + auth user idempotency;
 *     the real DB interaction surfaces in Task 3.1 when tables exist.
 *   - Briefing §7.1 allows both; Option B avoids flaky-live-DB deadweight.
 *
 * Idempotency proof: `runSeed()` returns a summary object; calling it twice
 * in a row must return the same summary AND must not throw (the real DB
 * equivalent will clear+reload rather than duplicate).
 *
 * Environment guard: `runSeed()` refuses to run against production Supabase.
 * We verify that by passing a prod-marker env override and expecting a throw.
 */
import { describe, expect, it } from 'vitest';

import { FixtureSchema, runSeed, validateFixture, type SeedSummary } from '../../scripts/seed';
import fixture from '../../fixtures/seed-14-days.json';

// In-memory fake admin client — only implements the `auth.admin` surface that
// `runSeed` exercises. If runSeed ever grows a DB write path (Task 3.1), the
// fake expands accordingly.
interface FakeUser {
  id: string;
  email: string;
}

function makeFakeAdmin() {
  let lastUser: FakeUser | null = null;
  return {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: { users: lastUser ? [lastUser] : [] },
            error: null,
          };
        },
        async createUser({ email }: { email: string }) {
          const id = `fake-${Math.floor(Math.random() * 1e9)}`;
          lastUser = { id, email };
          return { data: { user: { id, email } }, error: null };
        },
        async deleteUser(id: string) {
          if (lastUser?.id === id) lastUser = null;
          return { data: {}, error: null };
        },
      },
    },
  };
}

describe('scripts/seed', () => {
  it('validateFixture accepts the canonical 14-day fixture', () => {
    const result = validateFixture(fixture);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.dayCount).toBe(14);
  });

  it('validateFixture rejects a malformed fixture (missing days)', () => {
    const result = validateFixture({ devUserEmail: 'x@kalori.test', days: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateFixture rejects a missing devUserEmail', () => {
    const result = validateFixture({ days: fixture.days });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /devUserEmail/.test(e))).toBe(true);
  });

  it('validateFixture rejects a fixture missing tightened top-level fields (Codex R1 I-2)', () => {
    // Start from the canonical fixture, then strip one top-level field at a
    // time and expect validation to fail with a pointed error. This guards
    // against future drift where a field is added to the fixture JSON but
    // not to the schema validator.
    const extraTopLevelKeys = ['targetDailyKcal', 'baselineWeightKg', 'goalWeightKg'] as const;
    for (const key of extraTopLevelKeys) {
      // Shallow-clone then delete the key — avoids sharing object identity.
      const mutated: Record<string, unknown> = {
        ...(fixture as unknown as Record<string, unknown>),
      };
      delete mutated[key];
      const result = validateFixture(mutated);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => new RegExp(key).test(e))).toBe(true);
    }
  });

  it('validateFixture rejects a fixture missing per-day water_ml (Codex R1 I-2)', () => {
    const mutated = {
      ...(fixture as unknown as Record<string, unknown>),
      days: (fixture.days as unknown[]).map((day, idx) => {
        if (idx !== 0) return day;
        // Strip water_ml from the first day only.
        const d = { ...(day as Record<string, unknown>) };
        delete d.water_ml;
        return d;
      }),
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /water_ml/.test(e))).toBe(true);
  });

  it('validateFixture rejects a fixture with a non-array library (Codex R1 I-2)', () => {
    const mutated = {
      ...(fixture as unknown as Record<string, unknown>),
      library: null,
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /library/.test(e))).toBe(true);
  });

  it('FixtureSchema is the single source of truth shared by script + tests', () => {
    // Minimal contract probe — if a downstream refactor accidentally drops a
    // required key from the schema object, this test fails loudly.
    expect(Object.keys(FixtureSchema.topLevel)).toEqual(
      expect.arrayContaining([
        'devUserEmail',
        'devUserPassword',
        'targetDailyKcal',
        'baselineWeightKg',
        'goalWeightKg',
      ]),
    );
    expect(Object.keys(FixtureSchema.entry)).toEqual(
      expect.arrayContaining([
        'name',
        'cuisine',
        'qty',
        'unit',
        'kcal',
        'protein_g',
        'carbs_g',
        'fat_g',
      ]),
    );
    expect(Object.keys(FixtureSchema.libraryItem)).toEqual(
      expect.arrayContaining([
        'name',
        'cuisine',
        'serving',
        'kcal',
        'protein_g',
        'carbs_g',
        'fat_g',
      ]),
    );
  });

  // F-IMPL-2 (Task 3.1): declarative coverage of entries[] element shape +
  // nullable weight_kg. These cases prove that a malformed fixture is caught
  // by the SCHEMA rather than slipping through to runtime — the FixtureSchema
  // object becomes the authoritative shape reference Codex/reviewers consult.
  //
  // Briefing §10 case mapping (adapted to actual fixture shape — fixture uses
  // flat `qty/kcal/protein_g/...` per Task 1.3, not the briefing's hypothetical
  // DB-shape `portion/nutrition.macros.protein_g`):
  //   - entries[].qty as string                  (briefing: portion-as-string)
  //   - entries[].kcal missing                   (briefing: nutrition.kcal missing)
  //   - entries[].protein_g as null              (briefing: macros.protein_g null)
  //   - weight_kg as string                      (briefing: same)
  //   - targetDailyKcal as string                (briefing: regression lock)

  it('F-IMPL-2: rejects entries[].qty as string (declarative entry shape)', () => {
    const mutated: Record<string, unknown> = {
      ...(fixture as unknown as Record<string, unknown>),
      days: (fixture.days as unknown[]).map((day, dayIdx) => {
        if (dayIdx !== 0) return day;
        const d = day as Record<string, unknown>;
        const entries = (d.entries as Record<string, unknown>[]).map((entry, entryIdx) => {
          if (entryIdx !== 0) return entry;
          return { ...entry, qty: '1' };
        });
        return { ...d, entries };
      }),
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => /days\[0\]\.entries\[0\]\.qty/.test(e) && /number/.test(e)),
    ).toBe(true);
  });

  it('F-IMPL-2: rejects entries[].kcal missing (declarative entry shape)', () => {
    const mutated: Record<string, unknown> = {
      ...(fixture as unknown as Record<string, unknown>),
      days: (fixture.days as unknown[]).map((day, dayIdx) => {
        if (dayIdx !== 0) return day;
        const d = day as Record<string, unknown>;
        const entries = (d.entries as Record<string, unknown>[]).map((entry, entryIdx) => {
          if (entryIdx !== 0) return entry;
          const next = { ...entry };
          delete next.kcal;
          return next;
        });
        return { ...d, entries };
      }),
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /days\[0\]\.entries\[0\]\.kcal/.test(e))).toBe(true);
  });

  it('F-IMPL-2: rejects entries[].protein_g as null (declarative entry shape)', () => {
    const mutated: Record<string, unknown> = {
      ...(fixture as unknown as Record<string, unknown>),
      days: (fixture.days as unknown[]).map((day, dayIdx) => {
        if (dayIdx !== 0) return day;
        const d = day as Record<string, unknown>;
        const entries = (d.entries as Record<string, unknown>[]).map((entry, entryIdx) => {
          if (entryIdx !== 0) return entry;
          return { ...entry, protein_g: null };
        });
        return { ...d, entries };
      }),
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => /days\[0\]\.entries\[0\]\.protein_g/.test(e) && /number/.test(e)),
    ).toBe(true);
  });

  it('F-IMPL-2: rejects per-day weight_kg as string (declarative day shape)', () => {
    const mutated: Record<string, unknown> = {
      ...(fixture as unknown as Record<string, unknown>),
      days: (fixture.days as unknown[]).map((day, dayIdx) => {
        if (dayIdx !== 0) return day;
        return { ...(day as Record<string, unknown>), weight_kg: '70' };
      }),
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => /days\[0\]\.weight_kg/.test(e) && /number.*null|null.*number/i.test(e),
      ),
    ).toBe(true);
  });

  it('F-IMPL-2: rejects targetDailyKcal as string (regression lock)', () => {
    const mutated: Record<string, unknown> = {
      ...(fixture as unknown as Record<string, unknown>),
      targetDailyKcal: '2100',
    };
    const result = validateFixture(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /targetDailyKcal/.test(e) && /number/.test(e))).toBe(true);
  });

  it('F-IMPL-2: FixtureSchema.day declares weight_kg as nullable shape reference', () => {
    // Symbolic shape probe — FixtureSchema.day must enumerate weight_kg as
    // its declarative type so reviewers don't have to grep validateFixture()
    // body to understand the per-day shape.
    expect(Object.keys(FixtureSchema.day)).toEqual(
      expect.arrayContaining(['date', 'water_ml', 'weight_kg']),
    );
    // The validator allows null OR number. Symbolic encoding uses the union.
    expect(FixtureSchema.day.weight_kg).toBe('number|null');
  });

  it('runSeed creates the dev user on first run (fresh DB state)', async () => {
    const admin = makeFakeAdmin();
    const summary: SeedSummary = await runSeed({
      admin: admin as never,
      env: 'development',
      supabaseUrl: 'https://aaiohznsqlqchsoxaqkz.supabase.co',
    });
    expect(summary.userCreated).toBe(true);
    expect(summary.userId).toBeTypeOf('string');
    expect(summary.fixture.dayCount).toBe(14);
  });

  it('runSeed is idempotent — second run with the same admin state reports no recreate', async () => {
    const admin = makeFakeAdmin();
    const first = await runSeed({
      admin: admin as never,
      env: 'development',
      supabaseUrl: 'https://aaiohznsqlqchsoxaqkz.supabase.co',
    });
    const second = await runSeed({
      admin: admin as never,
      env: 'development',
      supabaseUrl: 'https://aaiohznsqlqchsoxaqkz.supabase.co',
    });
    expect(first.userCreated).toBe(true);
    expect(second.userCreated).toBe(false);
    // User id is stable across runs.
    expect(second.userId).toBe(first.userId);
  });

  it('runSeed refuses to run against production Supabase (safety guard)', async () => {
    const admin = makeFakeAdmin();
    await expect(
      runSeed({
        admin: admin as never,
        env: 'production',
        supabaseUrl: 'https://dryysypycsexvlbabtwq.supabase.co',
      }),
    ).rejects.toThrow(/prod/i);
  });

  it('runSeed refuses to run if supabaseUrl matches production project ref', async () => {
    const admin = makeFakeAdmin();
    await expect(
      runSeed({
        admin: admin as never,
        env: 'development',
        supabaseUrl: 'https://dryysypycsexvlbabtwq.supabase.co',
      }),
    ).rejects.toThrow(/prod/i);
  });
});
