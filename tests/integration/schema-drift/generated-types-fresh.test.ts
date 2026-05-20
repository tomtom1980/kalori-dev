/**
 * @vitest-environment node
 *
 * US-STAB-D4 — Generated types freshness (AC4).
 *
 * AC4: `tests/integration/schema-drift/generated-types-fresh.test.ts::types-not-stale-vs-migrations`
 *   GIVEN Supabase generated types (`supabase gen types typescript`),
 *   WHEN any migration applies to dev,
 *   THEN the generated types are regenerated AND committed to
 *   `lib/database.types.ts`; the freshness marker (header comment naming
 *   the newest migration filename) MUST match the newest file under
 *   `supabase/migrations/*.sql`.
 *
 * Per design-doc.md §11 (O-1 scope cap) — filesystem-only check, no DB
 * connection, no MSW.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { isTypesFileFresh } from '../../../scripts/schema-drift-check.mjs';

const repoRoot = path.resolve(__dirname, '../../..');
const typesFilePath = path.join(repoRoot, 'lib', 'database.types.ts');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

describe('US-STAB-D4 generated-types freshness', () => {
  it('types-not-stale-vs-migrations', () => {
    // AC4.a — types file exists at canonical path
    expect(existsSync(typesFilePath)).toBe(true);

    const typesContent = readFileSync(typesFilePath, 'utf8');

    // AC4.b — header freshness marker present
    expect(typesContent).toMatch(/Generated \d{4}-\d{2}-\d{2}T/);
    expect(typesContent).toMatch(/from migrations through .+\.sql/);

    // AC4.c — header marker names the newest migration in supabase/migrations
    const migrations = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    expect(migrations.length).toBeGreaterThan(0);
    const newestMigration = migrations[migrations.length - 1];
    expect(typesContent).toContain(newestMigration);

    // AC4.d — programmatic freshness check passes
    const result = isTypesFileFresh({
      typesFile: typesFilePath,
      migrationsDir,
    });
    expect(result.fresh).toBe(true);
    expect(result.newestMigration).toBe(newestMigration);

    // AC4.e — simulated stale state fails freshness check
    const stale = isTypesFileFresh({
      typesFile: typesFilePath,
      migrationsDir,
      // Force a sentinel newer-than-actual migration filename. The helper
      // compares lexicographically (filenames are zero-padded) so any string
      // greater than the actual newest is "newer".
      simulatedNewestMigration: '9999_future_migration.sql',
    });
    expect(stale.fresh).toBe(false);
  });
});
