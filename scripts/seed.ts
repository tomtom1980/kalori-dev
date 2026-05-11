/**
 * `pnpm seed` — dev Supabase seeding script (Task 1.3 AC; briefing §14-2
 * Option A).
 *
 * Task 1.3 scope (today):
 *   1. Load + schema-validate `fixtures/seed-14-days.json` so downstream
 *      tasks can trust the shape.
 *   2. Idempotently create the dev auth user (one `listUsers` + one
 *      `createUser` call) so Task 2.1+ can sign in without clicking through
 *      Google OAuth for every local run.
 *   3. Refuse to run against production Supabase — environment guard + URL
 *      check.
 *
 * Task 3.1 extension (deferred — NOT this task):
 *   - Clear + reload 14 days of food_entries + library_items + weight_log
 *     rows via the service-role admin client. The JSON fixture here is
 *     already shaped for that; Task 3.1 adds the DB writes + a
 *     `foodEntriesInserted` / `libraryItemsInserted` / `weightRowsInserted`
 *     count to `SeedSummary`.
 *
 * Safety rails:
 *   - Explicit `process.env.KALORI_ENV === 'production'` throws.
 *   - `supabaseUrl` string must NOT contain the production project ref
 *     (`dryysypycsexvlbabtwq`). Misconfigured env = loud abort.
 *
 * Usage:
 *   ```
 *   $ pnpm seed
 *   ```
 *   Reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`,
 *   invokes `runSeed()` against the dev Supabase admin client, prints a
 *   summary to stdout and exits 0 on success / non-zero on error.
 */
// eslint-disable-next-line kalori/no-admin-in-app -- Seed script needs service-role admin access; dev-only, gated at runtime against prod (Task 1.3 AC + briefing §12).
import { getAdminSupabase } from '@/lib/supabase/admin';

import fixture from '../fixtures/seed-14-days.json' with { type: 'json' };

// --- Shapes ---------------------------------------------------------------

/**
 * Minimal shape of the admin client surface this script actually uses.
 * Tests pass a fake that implements this subset; prod uses the real
 * Supabase admin client from `lib/supabase/admin.ts`.
 */
export interface SeedAdminClient {
  auth: {
    admin: {
      listUsers(): Promise<{
        data: { users: Array<{ id: string; email?: string | null }> };
        error: unknown;
      }>;
      createUser(args: { email: string; password: string; email_confirm: boolean }): Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
}

export interface FixtureValidation {
  valid: boolean;
  errors: string[];
  dayCount: number;
}

export interface SeedSummary {
  userCreated: boolean;
  userId: string;
  fixture: FixtureValidation;
}

export interface RunSeedInput {
  admin: SeedAdminClient;
  env: string | undefined;
  supabaseUrl: string | undefined;
}

// --- Prod guard -----------------------------------------------------------

const PROD_PROJECT_REF = 'dryysypycsexvlbabtwq';

function assertNotProduction(env: string | undefined, supabaseUrl: string | undefined): void {
  if (env === 'production') {
    throw new Error('seed: refusing to run with KALORI_ENV=production. This script is dev-only.');
  }
  if (supabaseUrl && supabaseUrl.includes(PROD_PROJECT_REF)) {
    throw new Error(
      `seed: refusing to run against production Supabase (URL contains ${PROD_PROJECT_REF}). This script is dev-only.`,
    );
  }
}

// --- Fixture validation ---------------------------------------------------

/**
 * Schema definition for `fixtures/seed-14-days.json`. Exported so tests and
 * the script share one source of truth (Codex R1 I-2). If the fixture shape
 * changes (Task 3.1 adds DB-row writes), update the FixtureSchema below +
 * the `Fixture*` interfaces together; the test suite will surface any drift.
 */
export interface FixtureEntry {
  name: string;
  cuisine: string;
  qty: number;
  unit: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FixtureDay {
  date: string;
  entries: FixtureEntry[];
  water_ml: number;
  weight_kg: number | null;
}

export interface FixtureLibraryItem {
  name: string;
  cuisine: string;
  serving: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FixtureShape {
  devUserEmail: string;
  devUserPassword: string;
  targetDailyKcal: number;
  baselineWeightKg: number;
  goalWeightKg: number;
  days: FixtureDay[];
  library: FixtureLibraryItem[];
}

/**
 * Required keys (and their expected runtime `typeof`) for each layer of the
 * fixture. Exported as a plain data structure so tests can probe it without
 * duplicating the shape.
 */
export const FixtureSchema = {
  topLevel: {
    devUserEmail: 'string',
    devUserPassword: 'string',
    targetDailyKcal: 'number',
    baselineWeightKg: 'number',
    goalWeightKg: 'number',
    // days + library validated structurally below
  } as const,
  day: {
    date: 'string',
    water_ml: 'number',
    // weight_kg is null on no-weigh-in days (not every day has a measurement);
    // F-IMPL-2 (Task 3.1) declarative coverage — `'number|null'` is the
    // symbolic encoding the validator interprets as "either null OR number".
    weight_kg: 'number|null',
    // entries validated structurally below; the shape lives in
    // FixtureSchema.entry (per-element fields).
  } as const,
  entry: {
    name: 'string',
    cuisine: 'string',
    qty: 'number',
    unit: 'string',
    kcal: 'number',
    protein_g: 'number',
    carbs_g: 'number',
    fat_g: 'number',
  } as const,
  libraryItem: {
    name: 'string',
    cuisine: 'string',
    serving: 'string',
    kcal: 'number',
    protein_g: 'number',
    carbs_g: 'number',
    fat_g: 'number',
  } as const,
} as const;

/**
 * Declarative type tokens accepted by FixtureSchema entries:
 *   'string'        — value must be typeof 'string' and non-empty
 *   'number'        — value must be typeof 'number'
 *   'number|null'   — value must be typeof 'number' OR exactly null
 *
 * Add new union variants here when extending FixtureSchema (F-IMPL-2 path).
 */
type SchemaTypeToken = 'string' | 'number' | 'number|null';

function checkKey(errors: string[], path: string, value: unknown, expected: SchemaTypeToken): void {
  if (expected === 'number|null') {
    if (value !== null && typeof value !== 'number') {
      errors.push(`${path}: expected a number or null`);
    }
    return;
  }
  if (typeof value !== expected) {
    errors.push(`${path}: expected a ${expected}`);
  } else if (expected === 'string' && value === '') {
    errors.push(`${path}: missing or empty`);
  }
}

/**
 * Schema-validate the 14-day fixture JSON. Today the script doesn't write
 * food_entries rows (Task 3.1), but asserting the full shape prevents a
 * malformed fixture from silently shipping to the repo ahead of Task 3.1.
 *
 * Codex R1 I-2 tightening — validates every field committed to the fixture:
 * top-level devUser + targets + baseline/goal weights, library array of
 * library items, per-day date + entries + water_ml + weight_kg (nullable).
 */
export function validateFixture(candidate: unknown): FixtureValidation {
  const errors: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, errors: ['fixture: expected an object'], dayCount: 0 };
  }
  const f = candidate as Record<string, unknown>;

  // Top-level required keys.
  for (const [key, expectedType] of Object.entries(FixtureSchema.topLevel)) {
    checkKey(errors, `fixture.${key}`, f[key], expectedType);
  }

  if (!Array.isArray(f.days)) {
    errors.push('fixture.days: expected an array');
    return { valid: false, errors, dayCount: 0 };
  }
  if (f.days.length !== 14) {
    errors.push(`fixture.days: expected 14 days, got ${f.days.length}`);
  }
  for (const [idx, day] of f.days.entries()) {
    if (!day || typeof day !== 'object') {
      errors.push(`fixture.days[${idx}]: expected an object`);
      continue;
    }
    const d = day as Record<string, unknown>;
    // Per-day field validation driven by FixtureSchema.day (F-IMPL-2).
    // `date` gets a stricter format check after the type-token pass.
    for (const [key, expectedType] of Object.entries(FixtureSchema.day)) {
      checkKey(errors, `fixture.days[${idx}].${key}`, d[key], expectedType as SchemaTypeToken);
    }
    if (typeof d.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      errors.push(`fixture.days[${idx}].date: expected YYYY-MM-DD`);
    }
    if (!Array.isArray(d.entries)) {
      errors.push(`fixture.days[${idx}].entries: expected an array`);
      continue;
    }
    if (d.entries.length < 3 || d.entries.length > 6) {
      errors.push(`fixture.days[${idx}].entries: expected 3–6 entries, got ${d.entries.length}`);
    }
    for (const [eidx, entry] of d.entries.entries()) {
      if (!entry || typeof entry !== 'object') {
        errors.push(`fixture.days[${idx}].entries[${eidx}]: expected an object`);
        continue;
      }
      const e = entry as Record<string, unknown>;
      for (const [key, expectedType] of Object.entries(FixtureSchema.entry)) {
        checkKey(
          errors,
          `fixture.days[${idx}].entries[${eidx}].${key}`,
          e[key],
          expectedType as SchemaTypeToken,
        );
      }
    }
  }

  // Library (top-level array of FixtureLibraryItem).
  if (!Array.isArray(f.library)) {
    errors.push('fixture.library: expected an array');
  } else {
    for (const [lidx, item] of f.library.entries()) {
      if (!item || typeof item !== 'object') {
        errors.push(`fixture.library[${lidx}]: expected an object`);
        continue;
      }
      const li = item as Record<string, unknown>;
      for (const [key, expectedType] of Object.entries(FixtureSchema.libraryItem)) {
        checkKey(
          errors,
          `fixture.library[${lidx}].${key}`,
          li[key],
          expectedType as SchemaTypeToken,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    dayCount: (f.days as unknown[]).length,
  };
}

// --- Seed runner ----------------------------------------------------------

/**
 * Idempotent seed runner. Safe to call twice — a pre-existing dev user with
 * the fixture-specified email is recognised and NOT recreated.
 */
export async function runSeed(input: RunSeedInput): Promise<SeedSummary> {
  assertNotProduction(input.env, input.supabaseUrl);

  const validated = validateFixture(fixture);
  if (!validated.valid) {
    throw new Error(`seed: fixture schema invalid:\n  - ${validated.errors.join('\n  - ')}`);
  }

  const { devUserEmail, devUserPassword } = fixture as {
    devUserEmail: string;
    devUserPassword: string;
  };

  // Check for an existing dev user first (idempotency).
  const { data: listData, error: listError } = await input.admin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`seed: auth.admin.listUsers failed: ${String(listError)}`);
  }
  const existing = listData.users.find((u) => u.email === devUserEmail);
  if (existing) {
    return {
      userCreated: false,
      userId: existing.id,
      fixture: validated,
    };
  }

  const { data: createData, error: createError } = await input.admin.auth.admin.createUser({
    email: devUserEmail,
    password: devUserPassword,
    email_confirm: true,
  });
  if (createError || !createData.user) {
    throw new Error(
      `seed: auth.admin.createUser failed: ${createError ? String(createError) : 'no user returned'}`,
    );
  }

  return {
    userCreated: true,
    userId: createData.user.id,
    fixture: validated,
  };
}

// --- CLI entry ------------------------------------------------------------

const invokedDirectly = (() => {
  // Detect `pnpm seed` / `node scripts/seed.ts` invocation — Node 20 / tsx.
  try {
    const argv1 = process.argv[1] ?? '';
    return (
      argv1.endsWith('scripts/seed.ts') ||
      argv1.endsWith('scripts\\seed.ts') ||
      argv1.endsWith('scripts/seed.js') ||
      argv1.endsWith('scripts\\seed.js')
    );
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const env = process.env.KALORI_ENV ?? process.env.NODE_ENV;
    try {
      // Run the prod guard BEFORE creating the admin client. `getAdminSupabase`
      // would throw a generic "env vars missing" error first otherwise, masking
      // the informative prod-refusal message.
      assertNotProduction(env, url);
      const admin = getAdminSupabase() as unknown as SeedAdminClient;
      const summary = await runSeed({ admin, env, supabaseUrl: url });
      console.log('seed: completed');
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    } catch (error) {
      console.error('seed: FAILED');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
