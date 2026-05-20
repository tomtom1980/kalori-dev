/**
 * Task E.1.2 — unit tests for scripts/apply-prod-migrations-incremental.mjs.
 *
 * Covers the four pure helpers extracted from the script (no fs / network):
 *   - parseMigrationNumber
 *   - computeMigrationDelta
 *   - detectDestructiveDDL
 *   - buildVerificationQuery
 *
 * Plus a "dry-run integration" test that exercises the apply path with a mocked
 * Supabase Management API client to confirm:
 *   - the plan is rendered for the 4 pending migrations (0018..0021)
 *   - zero DB writes are attempted (mock fetch counter stays at 0)
 *   - process exits 0 on the dry-run path
 *
 * NO real network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  parseMigrationNumber,
  computeMigrationDelta,
  detectDestructiveDDL,
  buildVerificationQuery,
  parseFlags,
  parseEnvFile,
  detectAppliedMigrations,
} from '@/scripts/apply-prod-migrations-incremental.mjs';

describe('parseMigrationNumber', () => {
  it('extracts the 4-digit prefix from a canonical filename', () => {
    expect(parseMigrationNumber('0018_water_log_atomic_cap.sql')).toBe('0018');
  });

  it('extracts from 0001 and 0021', () => {
    expect(parseMigrationNumber('0001_init.sql')).toBe('0001');
    expect(parseMigrationNumber('0021_library_overhaul.sql')).toBe('0021');
  });

  it('returns null for non-conforming filenames', () => {
    expect(parseMigrationNumber('init.sql')).toBeNull();
    expect(parseMigrationNumber('123_init.sql')).toBeNull(); // 3 digits
    expect(parseMigrationNumber('foo.sql')).toBeNull();
    expect(parseMigrationNumber('')).toBeNull();
  });
});

describe('computeMigrationDelta', () => {
  it('returns the missing migrations in sorted order', () => {
    const local = [
      '0001_init.sql',
      '0002_profiles.sql',
      '0018_x.sql',
      '0019_y.sql',
      '0020_z.sql',
      '0021_w.sql',
    ];
    const applied = new Set(['0001', '0002']);
    expect(computeMigrationDelta(local, applied)).toEqual([
      '0018_x.sql',
      '0019_y.sql',
      '0020_z.sql',
      '0021_w.sql',
    ]);
  });

  it('returns empty when everything is applied', () => {
    const local = ['0001_a.sql', '0002_b.sql'];
    expect(computeMigrationDelta(local, new Set(['0001', '0002']))).toEqual([]);
  });

  it('returns everything when nothing is applied', () => {
    const local = ['0001_a.sql', '0002_b.sql'];
    expect(computeMigrationDelta(local, new Set())).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('ignores filenames that do not match the canonical NNNN_ pattern', () => {
    const local = ['0001_a.sql', 'foo.sql', '0002_b.sql'];
    expect(computeMigrationDelta(local, new Set())).toEqual(['0001_a.sql', '0002_b.sql']);
  });

  it('sorts unsorted input (lexicographic = numeric for zero-padded)', () => {
    const local = ['0021_w.sql', '0001_init.sql', '0018_x.sql'];
    expect(computeMigrationDelta(local, new Set())).toEqual([
      '0001_init.sql',
      '0018_x.sql',
      '0021_w.sql',
    ]);
  });
});

describe('detectDestructiveDDL', () => {
  it('flags DROP TABLE', () => {
    const findings = detectDestructiveDDL('DROP TABLE public.foo;');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => /DROP TABLE/i.test(f))).toBe(true);
  });

  it('flags DROP COLUMN', () => {
    const findings = detectDestructiveDDL('ALTER TABLE public.foo DROP COLUMN bar;');
    expect(findings.some((f) => /DROP COLUMN bar/i.test(f))).toBe(true);
  });

  it('flags TRUNCATE', () => {
    const findings = detectDestructiveDDL('TRUNCATE TABLE public.foo;');
    expect(findings.some((f) => /TRUNCATE/i.test(f))).toBe(true);
  });

  it('flags DELETE FROM without WHERE', () => {
    const findings = detectDestructiveDDL('DELETE FROM public.foo;');
    expect(findings.some((f) => /DELETE FROM public.foo/i.test(f))).toBe(true);
  });

  it('does NOT flag DELETE FROM with WHERE', () => {
    const findings = detectDestructiveDDL(
      "DELETE FROM public.foo WHERE id = '00000000-0000-0000-0000-000000000000';",
    );
    expect(findings.filter((f) => /DELETE/i.test(f))).toEqual([]);
  });

  // Codex E.CODEX Round 1 (A-H1) — soft-delete via UPDATE deleted_at is
  // a data mutation hazard under the privileged migration context. The
  // detector must flag the pattern regardless of WHERE clause: even a
  // WHERE-scoped UPDATE bypasses RLS under the migration role and can
  // affect rows across tenants, so explicit operator confirmation is
  // warranted. Mirrors 0020's duplicate-cleanup pattern.
  it('flags UPDATE ... SET deleted_at = now() (soft-delete)', () => {
    const findings = detectDestructiveDDL(
      `UPDATE public.food_library_items
         SET deleted_at = now()
         WHERE id IN (SELECT id FROM dup_picks);`,
    );
    expect(findings.some((f) => /UPDATE.*SET deleted_at/i.test(f))).toBe(true);
  });

  it('flags multi-column SET that includes deleted_at', () => {
    const findings = detectDestructiveDDL(
      `UPDATE public.food_entries
         SET updated_at = now(), deleted_at = now()
         WHERE user_id = '00000000-0000-0000-0000-000000000000';`,
    );
    expect(findings.some((f) => /UPDATE.*SET deleted_at/i.test(f))).toBe(true);
  });

  it('does NOT flag UPDATE that does not touch deleted_at', () => {
    const findings = detectDestructiveDDL(
      `UPDATE public.food_library_items
         SET log_count = log_count + 1, last_used_at = now()
         WHERE id = '00000000-0000-0000-0000-000000000000';`,
    );
    expect(findings.filter((f) => /UPDATE/i.test(f))).toEqual([]);
  });

  it('does NOT flag a DROP CONSTRAINT IF EXISTS followed by ADD CONSTRAINT of same name (0021 pattern)', () => {
    // This is the canonical CHECK-widening pattern in 0021 line 75-80.
    const sql = `
      ALTER TABLE public.food_library_items
        DROP CONSTRAINT IF EXISTS food_library_items_created_from_check;

      ALTER TABLE public.food_library_items
        ADD CONSTRAINT food_library_items_created_from_check
        CHECK (created_from IN ('text', 'photo', 'manual'));
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings.filter((f) => /DROP CONSTRAINT/i.test(f))).toEqual([]);
  });

  it('flags a DROP CONSTRAINT with NO matching ADD CONSTRAINT', () => {
    const sql = `ALTER TABLE public.foo DROP CONSTRAINT bar;`;
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP CONSTRAINT bar/i.test(f))).toBe(true);
  });

  it('does NOT flag a DROP INDEX IF EXISTS followed by CREATE INDEX of same name (0020 pattern)', () => {
    // This is the canonical idempotency pattern in 0020 line 70 + 137.
    const sql = `
      DROP INDEX IF EXISTS public.food_library_items_user_normalized_name_unique;
      CREATE UNIQUE INDEX food_library_items_user_normalized_name_unique
        ON public.food_library_items (user_id, normalized_name)
        WHERE deleted_at IS NULL AND normalized_name IS NOT NULL;
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings.filter((f) => /DROP INDEX/i.test(f))).toEqual([]);
  });

  it('flags ALTER COLUMN TYPE', () => {
    const findings = detectDestructiveDDL('ALTER TABLE public.foo ALTER COLUMN bar TYPE integer;');
    expect(findings.some((f) => /ALTER COLUMN bar TYPE/i.test(f))).toBe(true);
  });

  it('flags DROP FUNCTION', () => {
    const findings = detectDestructiveDDL('DROP FUNCTION public.foo(uuid);');
    expect(findings.some((f) => /DROP FUNCTION/i.test(f))).toBe(true);
  });

  it('does NOT flag CREATE OR REPLACE FUNCTION', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.log_water_with_cap(p_client_id uuid)
      RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END $$;
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings).toEqual([]);
  });

  it('returns empty array for plain idempotent CREATE INDEX / ADD COLUMN', () => {
    const sql = `
      ALTER TABLE public.food_library_items
        ADD COLUMN IF NOT EXISTS thumbnail_kind text NULL;
      CREATE INDEX IF NOT EXISTS foo_idx ON public.foo(bar);
    `;
    expect(detectDestructiveDDL(sql)).toEqual([]);
  });

  // E.1.9 Codex finding 3 — behavior/permission-changing DDL hazards.
  // Non-destructive in the "no data loss" sense but capable of silently
  // breaking inserts, role access, or critical RPC behavior. Should be
  // flagged so the operator sees the hazard before applying.
  it('flags REVOKE on a named role (permission change)', () => {
    const sql = 'REVOKE EXECUTE ON FUNCTION public.delete_user_data() FROM anon;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /REVOKE/i.test(f))).toBe(true);
  });

  it('does NOT flag the canonical "revoke from public + grant to named role" hardening idiom', () => {
    // This is the pattern used by every SECURITY DEFINER RPC migration in
    // this repo — net-positive net change on the permission graph (tightens
    // the default PUBLIC grant).
    const sql = `
      revoke all on function public.log_water_with_cap(uuid, date, integer, text) from public;
      grant execute on function public.log_water_with_cap(uuid, date, integer, text) to authenticated;
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings.filter((f) => /REVOKE/i.test(f))).toEqual([]);
  });

  it('flags REVOKE from PUBLIC if NOT followed by a GRANT to a named role', () => {
    // A REVOKE FROM PUBLIC without a follow-up GRANT actually reduces
    // overall access — flag it.
    const sql = 'revoke all on function public.foo(uuid) from public;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /REVOKE/i.test(f))).toBe(true);
  });

  it('flags REVOKE on object A when only a GRANT on UNRELATED object B follows (E.1.9 Round 2 finding 3)', () => {
    // Codex Round 2 finding 3 — the loose whitelist used to suppress the
    // REVOKE on `public.foo` simply because a GRANT on `public.bar`
    // appeared later. After the same-object tightening, this MUST be
    // flagged.
    const sql = `
      revoke all on function public.foo(uuid) from public;
      grant execute on function public.bar(uuid) to authenticated;
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /REVOKE/i.test(f) && /foo/.test(f))).toBe(true);
  });

  it('still passes the canonical same-object hardening (REVOKE on X then GRANT on X)', () => {
    const sql = `
      revoke all on function public.foo(uuid) from public;
      grant execute on function public.foo(uuid) to authenticated;
    `;
    const findings = detectDestructiveDDL(sql);
    expect(findings.filter((f) => /REVOKE/i.test(f))).toEqual([]);
  });

  it('flags ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT (insert behavior change)', () => {
    const sql = 'ALTER TABLE public.foo ALTER COLUMN bar DROP DEFAULT;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP DEFAULT/i.test(f))).toBe(true);
  });

  it('flags ALTER TABLE ... ALTER <ident> DROP DEFAULT (COLUMN keyword optional)', () => {
    // Postgres syntax allows omitting the COLUMN keyword.
    const sql = 'ALTER TABLE public.foo ALTER bar DROP DEFAULT;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP DEFAULT/i.test(f) && /bar/.test(f))).toBe(true);
  });

  it('flags ALTER COLUMN with a quoted identifier (DROP DEFAULT)', () => {
    const sql = 'ALTER TABLE public.foo ALTER COLUMN "createdAt" DROP DEFAULT;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP DEFAULT/i.test(f) && /createdAt/.test(f))).toBe(true);
  });

  it('flags ALTER <quoted ident> DROP DEFAULT (both shortcuts at once)', () => {
    const sql = 'ALTER TABLE public.foo ALTER "createdAt" DROP DEFAULT;';
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP DEFAULT/i.test(f) && /createdAt/.test(f))).toBe(true);
  });

  it('does NOT flag SET DEFAULT (adding a default is additive)', () => {
    const sql = "ALTER TABLE public.foo ALTER COLUMN bar SET DEFAULT 'baz';";
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /DROP DEFAULT/i.test(f))).toBe(false);
  });

  it('does NOT flag REVOKE inside a SQL comment', () => {
    const sql = `-- REVOKE EXECUTE FROM anon; (discussion only)\nCREATE INDEX foo ON bar(baz);`;
    const findings = detectDestructiveDDL(sql);
    expect(findings.some((f) => /REVOKE/i.test(f))).toBe(false);
  });
});

describe('buildVerificationQuery', () => {
  it('returns 2 queries for 0018 (function exists + advisory lock used)', () => {
    const checks = buildVerificationQuery('0018');
    expect(checks).toHaveLength(2);
    expect(checks[0]!.name).toBe('0018.fn_exists');
    expect(checks[0]!.sql).toContain('log_water_with_cap');
    expect(checks[1]!.name).toBe('0018.advisory_lock_used');
    expect(checks[1]!.sql).toContain('pg_advisory_xact_lock');
  });

  it('0018 fn_exists predicate accepts a single-row result', () => {
    const [check] = buildVerificationQuery('0018');
    expect(check!.predicate([{ hit: 1 }])).toBe(true);
    expect(check!.predicate([])).toBe(false);
    expect(check!.predicate(null)).toBe(false);
  });

  it('returns 2 queries for 0019 (check constraint + under_daily_limit branch)', () => {
    const checks = buildVerificationQuery('0019');
    expect(checks).toHaveLength(2);
    expect(checks[0]!.name).toBe('0019.check_constraint_allows_negative_ml');
    expect(checks[1]!.name).toBe('0019.fn_under_daily_limit_branch');
  });

  it('0019 check constraint predicate rejects defs missing -5000 or unit=ml', () => {
    const [check] = buildVerificationQuery('0019');
    // Real def shape from 0019:
    const realDef =
      "CHECK ((unit = 'ml' AND count BETWEEN -5000 AND 5000) OR (unit = ANY (ARRAY['glass'::text, 'bottle'::text]) AND count >= 0))";
    expect(check!.predicate([{ def: realDef }])).toBe(true);
    expect(check!.predicate([{ def: 'CHECK (count >= 0)' }])).toBe(false);
    expect(check!.predicate([])).toBe(false);
  });

  it('returns 1 query for 0020 (partial unique index)', () => {
    const checks = buildVerificationQuery('0020');
    expect(checks).toHaveLength(1);
    expect(checks[0]!.name).toBe('0020.partial_unique_index_exists');
    expect(checks[0]!.sql).toContain('food_library_items_user_normalized_name_unique');
  });

  it('0020 predicate requires deleted_at IS NULL + normalized_name IS NOT NULL + UNIQUE in indexdef', () => {
    const [check] = buildVerificationQuery('0020');
    const realDef =
      'CREATE UNIQUE INDEX food_library_items_user_normalized_name_unique ON public.food_library_items USING btree (user_id, normalized_name) WHERE ((deleted_at IS NULL) AND (normalized_name IS NOT NULL))';
    expect(check!.predicate([{ indexdef: realDef }])).toBe(true);
    // Missing the partial-index predicate → FAIL.
    expect(
      check!.predicate([
        {
          indexdef:
            'CREATE UNIQUE INDEX foo ON public.food_library_items (user_id, normalized_name)',
        },
      ]),
    ).toBe(false);
  });

  it('returns 3 queries for 0021 (created_from widened + sketch columns + thumbnail_kind check)', () => {
    const checks = buildVerificationQuery('0021');
    expect(checks).toHaveLength(3);
    expect(checks[0]!.name).toBe('0021.created_from_check_widened');
    expect(checks[1]!.name).toBe('0021.sketch_columns_present');
    expect(checks[2]!.name).toBe('0021.thumbnail_kind_check');
  });

  it('0021 sketch-columns predicate requires the 4 ACTUAL columns from migration body', () => {
    const checks = buildVerificationQuery('0021');
    const sketchCheck = checks[1]!;
    const realRows = [
      { column_name: 'thumbnail_kind', data_type: 'text' },
      { column_name: 'sketch_generated_at', data_type: 'timestamp with time zone' },
      { column_name: 'sketch_attempt_count', data_type: 'integer' },
      { column_name: 'sketch_last_error', data_type: 'text' },
    ];
    expect(sketchCheck.predicate(realRows)).toBe(true);

    // AC2's column names (which do NOT match the actual migration) → FAIL.
    const ac2Rows = [
      { column_name: 'sketch_image_storage_path', data_type: 'text' },
      { column_name: 'sketch_thumb_storage_path', data_type: 'text' },
      { column_name: 'sketch_prompt', data_type: 'text' },
      { column_name: 'sketch_meta', data_type: 'jsonb' },
    ];
    expect(sketchCheck.predicate(ac2Rows)).toBe(false);

    // Partial — only 3 of 4 columns present → FAIL.
    expect(sketchCheck.predicate(realRows.slice(0, 3))).toBe(false);
  });

  it('returns 4 queries for 0026 BAC alcohol tracking artifacts', () => {
    const checks = buildVerificationQuery('0026');

    expect(checks).toHaveLength(4);
    expect(checks[0]!.name).toBe('0026.alcohol_logs_columns_present');
    expect(checks[1]!.name).toBe('0026.alcohol_logs_user_consumed_at_idx');
    expect(checks[2]!.name).toBe('0026.profiles_bio_sex_check_excludes_other');
    expect(checks[3]!.name).toBe('0026.handle_new_user_defaults_bio_sex_male');
    expect(checks[0]!.sql).toContain('alcohol_logs');
    expect(checks[1]!.sql).toContain('alcohol_logs_user_consumed_at_idx');
    expect(checks[2]!.sql).toContain('profiles_bio_sex_check');
    expect(checks[3]!.sql).toContain('handle_new_user');
  });

  it('0026 predicates require actual alcohol tracking migration artifacts', () => {
    const checks = buildVerificationQuery('0026');
    const columnsCheck = checks[0]!;
    const indexCheck = checks[1]!;
    const bioSexCheck = checks[2]!;
    const handleNewUserCheck = checks[3]!;

    const realColumnRows = [
      { column_name: 'id' },
      { column_name: 'user_id' },
      { column_name: 'entry_id' },
      { column_name: 'volume_ml' },
      { column_name: 'abv_percent' },
      { column_name: 'alcohol_grams' },
      { column_name: 'consumed_at' },
      { column_name: 'created_at' },
    ];
    expect(columnsCheck.predicate(realColumnRows)).toBe(true);
    expect(columnsCheck.predicate(realColumnRows.slice(0, 7))).toBe(false);

    expect(
      indexCheck.predicate([
        {
          indexdef:
            'CREATE INDEX alcohol_logs_user_consumed_at_idx ON public.alcohol_logs USING btree (user_id, consumed_at DESC)',
        },
      ]),
    ).toBe(true);
    expect(
      indexCheck.predicate([
        {
          indexdef:
            'CREATE INDEX alcohol_logs_user_consumed_at_idx ON public.alcohol_logs USING btree (user_id)',
        },
      ]),
    ).toBe(false);

    expect(
      bioSexCheck.predicate([
        { def: "CHECK ((bio_sex = ANY (ARRAY['male'::text, 'female'::text])))" },
      ]),
    ).toBe(true);
    expect(
      bioSexCheck.predicate([
        { def: "CHECK ((bio_sex = ANY (ARRAY['male'::text, 'female'::text, 'other'::text])))" },
      ]),
    ).toBe(false);

    expect(handleNewUserCheck.predicate([{ hit: 1 }])).toBe(true);
    expect(handleNewUserCheck.predicate([])).toBe(false);
  });

  it('returns 4 queries for 0027 library recipe artifacts', () => {
    const checks = buildVerificationQuery('0027');

    expect(checks).toHaveLength(4);
    expect(checks[0]!.name).toBe('0027.food_library_items_recipe_eligibility_columns');
    expect(checks[1]!.name).toBe('0027.food_library_recipes_table_present');
    expect(checks[2]!.name).toBe('0027.food_library_recipes_rls_enabled');
    expect(checks[3]!.name).toBe('0027.ai_call_type_constraints_include_library_recipe');
    expect(checks[0]!.sql).toContain('food_library_items');
    expect(checks[1]!.sql).toContain('food_library_recipes');
    expect(checks[2]!.sql).toContain('relrowsecurity');
    expect(checks[3]!.description).toContain('library-recipe');
  });

  it('0027 predicates require actual library recipe migration artifacts', () => {
    const checks = buildVerificationQuery('0027');
    const eligibilityColumnsCheck = checks[0]!;
    const recipesTableCheck = checks[1]!;
    const rlsCheck = checks[2]!;
    const callTypesCheck = checks[3]!;

    const eligibilityRows = [
      { column_name: 'recipe_eligibility' },
      { column_name: 'recipe_eligibility_reason' },
      { column_name: 'recipe_eligibility_checked_at' },
    ];
    expect(eligibilityColumnsCheck.predicate(eligibilityRows)).toBe(true);
    expect(eligibilityColumnsCheck.predicate(eligibilityRows.slice(0, 2))).toBe(false);

    const recipeRows = [
      { column_name: 'id' },
      { column_name: 'user_id' },
      { column_name: 'library_item_id' },
      { column_name: 'recipe' },
      { column_name: 'prompt_version' },
      { column_name: 'model' },
      { column_name: 'input_hash' },
      { column_name: 'created_at' },
      { column_name: 'updated_at' },
    ];
    expect(recipesTableCheck.predicate(recipeRows)).toBe(true);
    expect(recipesTableCheck.predicate(recipeRows.slice(0, 8))).toBe(false);

    expect(rlsCheck.predicate([{ rls_enabled: true }])).toBe(true);
    expect(rlsCheck.predicate([{ rls_enabled: false }])).toBe(false);

    expect(
      callTypesCheck.predicate([
        { conname: 'ai_call_log_call_type_check', def: "CHECK (call_type = 'library-recipe')" },
        {
          conname: 'ai_response_cache_call_type_check',
          def: "CHECK (call_type = 'library-recipe')",
        },
      ]),
    ).toBe(true);
    expect(
      callTypesCheck.predicate([
        { conname: 'ai_call_log_call_type_check', def: "CHECK (call_type = 'text-parse')" },
        {
          conname: 'ai_response_cache_call_type_check',
          def: "CHECK (call_type = 'library-recipe')",
        },
      ]),
    ).toBe(false);
  });

  it('returns empty array for an unknown migration number', () => {
    expect(buildVerificationQuery('9999')).toEqual([]);
    expect(buildVerificationQuery('0001')).toEqual([]);
  });
});

describe('parseFlags', () => {
  it('defaults to dry-run', () => {
    const f = parseFlags([]);
    expect(f.dryRun).toBe(true);
    expect(f.apply).toBe(false);
    expect(f.confirmDestructive).toBe(false);
    expect(f.allowDev).toBe(false);
    expect(f.verbose).toBe(false);
    expect(f.migrationOverride).toBeNull();
  });

  it('--apply flips dryRun off', () => {
    const f = parseFlags(['--apply']);
    expect(f.apply).toBe(true);
    expect(f.dryRun).toBe(false);
  });

  it('--migrations 0018,0019 parses to an array', () => {
    const f = parseFlags(['--migrations', '0018,0019,0020']);
    expect(f.migrationOverride).toEqual(['0018', '0019', '0020']);
  });

  it('--env-file path captures the path', () => {
    const f = parseFlags(['--env-file', 'Planning/devapikeys.txt']);
    expect(f.envFile).toBe('Planning/devapikeys.txt');
  });

  it('--allow-dev sets the flag', () => {
    const f = parseFlags(['--allow-dev']);
    expect(f.allowDev).toBe(true);
  });
});

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines and ignores comments + blanks', () => {
    const text = `# comment\nFOO=bar\n\nBAZ="quoted value"\n`;
    expect(parseEnvFile(text)).toEqual({ FOO: 'bar', BAZ: 'quoted value' });
  });

  it('handles single-quoted values', () => {
    expect(parseEnvFile("FOO='hello'")).toEqual({ FOO: 'hello' });
  });

  it('handles trailing \\r (CRLF inputs)', () => {
    expect(parseEnvFile('FOO=bar\r\nBAZ=qux\r\n')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });
});

// =============================================================================
// detectAppliedMigrations — partial-tracker hazard tests (E.1.9 Codex finding 2)
// =============================================================================
//
// Real prod cutover (2026-05-16) revealed the supabase_migrations.schema_migrations
// tracker can return SOME but not ALL applied migrations (Management API
// applies do not always populate the tracker — the prod tracker returned
// only '0001' while 0002..0017 were known to be applied out-of-band). Treating
// a sparse tracker as authoritative would compute 0002..0021 as pending and
// attempt to replay old migrations. detectAppliedMigrations must detect this
// sparse/non-contiguous state and fall through to artifact detection (which
// IS authoritative because it probes the live schema).

describe('detectAppliedMigrations — partial / sparse tracker', () => {
  it('treats a contiguous tracker (0001..0017) as authoritative', async () => {
    const runQuery = vi.fn(async (sql: string) => {
      if (sql.includes('schema_migrations')) {
        const rows = [];
        for (let n = 1; n <= 17; n += 1) {
          rows.push({ version: String(n).padStart(4, '0') });
        }
        return { status: 200, json: rows };
      }
      return { status: 200, json: [] };
    });

    const { applied, source } = await detectAppliedMigrations(runQuery);
    expect(source).toBe('schema_migrations');
    expect(applied.has('0001')).toBe(true);
    expect(applied.has('0017')).toBe(true);
    expect(applied.has('0018')).toBe(false);
  });

  it('returns "disagreement" source when tracker says 0001 but artifact probe finds 0017 applied (E.1.9 Round 2 finding 2)', async () => {
    // This is the EXACT real-prod scenario discovered during E.1.7 cutover.
    // Tracker returns just '0001'; artifact probes confirm 0017 is applied.
    // Previously this fell through to artifact detection silently — now we
    // surface DISAGREEMENT so main() halts and forces operator override.
    const runQuery = vi.fn(async (sql: string) => {
      if (sql.includes('schema_migrations')) {
        return { status: 200, json: [{ version: '0001' }] };
      }
      if (sql.includes('routine_privileges') && sql.includes('delete_user_data')) {
        // 0017 artifact present.
        return { status: 200, json: [{ hit: 1 }] };
      }
      // Higher artifacts (0018..0021) NOT yet applied.
      return { status: 200, json: [] };
    });

    const result = await detectAppliedMigrations(runQuery);
    expect(result.source).toBe('disagreement');
    expect(result.trackerHighest).toBe('0001');
    expect(result.artifactHighest).toBe('0017');
  });

  it('rejects a tracker with a gap (1, 3, 4) as sparse and falls through', async () => {
    // Non-contiguous tracker — clearly partial. Refuse to trust it.
    const runQuery = vi.fn(async (sql: string) => {
      if (sql.includes('schema_migrations')) {
        return {
          status: 200,
          json: [{ version: '0001' }, { version: '0003' }, { version: '0004' }],
        };
      }
      if (sql.includes('routine_privileges') && sql.includes('delete_user_data')) {
        return { status: 200, json: [{ hit: 1 }] };
      }
      return { status: 200, json: [] };
    });

    const { source } = await detectAppliedMigrations(runQuery);
    expect(source).toMatch(/^artifact:/);
  });

  it('uses tracker when contiguous from 0001 with high cardinality (no gap)', async () => {
    // 1..21 contiguous = trustworthy, even though that is a large set.
    const runQuery = vi.fn(async (sql: string) => {
      if (sql.includes('schema_migrations')) {
        const rows = [];
        for (let n = 1; n <= 21; n += 1) rows.push({ version: String(n).padStart(4, '0') });
        return { status: 200, json: rows };
      }
      return { status: 200, json: [] };
    });
    const { source, applied } = await detectAppliedMigrations(runQuery);
    expect(source).toBe('schema_migrations');
    expect(applied.size).toBe(21);
  });

  it('artifact fallback detects 0027 before 0026 as the high-water mark', async () => {
    const runQuery = vi.fn(async (sql: string, label?: string) => {
      void label;
      if (sql.includes('schema_migrations')) {
        return { status: 200, json: [] };
      }
      if (sql.includes("table_name='food_library_recipes'")) {
        return { status: 200, json: [{ hit: 1 }] };
      }
      throw new Error(`unexpected artifact probe: ${sql}`);
    });

    const { applied, source } = await detectAppliedMigrations(runQuery);
    expect(source).toBe('artifact:0027');
    expect(applied.has('0027')).toBe(true);
    expect(runQuery.mock.calls[1]?.[1]).toBe('artifact_0027');
  });
});

// =============================================================================
// Dry-run integration test (Step 2)
// =============================================================================

describe('dry-run integration — main() with mocked fetch', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logged: string[] = [];

  beforeEach(() => {
    logged = [];
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`__exit:${code ?? 0}__`);
      });
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(
        '[err] ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
      );
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    delete (globalThis as unknown as { __fetchCounter?: number }).__fetchCounter;
  });

  it('dry-run against prod ref renders the plan and exits 0 without writes', async () => {
    // Codex E.CODEX Round 1 (A-H1) — migration 0020 contains
    // `UPDATE ... SET deleted_at = now()` for duplicate cleanup. The
    // hardened destructive-DDL preflight now flags this as a soft-delete
    // hazard requiring --confirm-destructive (because under the privileged
    // migration context the UPDATE bypasses RLS and can hide rows across
    // tenants). The dry-run path needs the explicit confirmation flag to
    // reach the plan-render section that this test exercises.
    //
    // Mock fetch — count every call and return a canned "applied 0001..0017"
    // response for the schema_migrations probe. The dry-run path will exit
    // before any apply call, so we only need the tracker probe.
    const calls: Array<{ url: string; body: unknown }> = [];
    const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body });
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      const sql: string = body.query ?? '';
      if (sql.includes('supabase_migrations.schema_migrations')) {
        const rows = [];
        for (let n = 1; n <= 17; n += 1) {
          rows.push({ version: String(n).padStart(4, '0') });
        }
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      // Any other call during dry-run is unexpected.
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    // The script reads Planning/apikeys.txt — substitute via --env-file
    // pointing at a fixture. We use the real dev keys file (which has the
    // dev ref) and --allow-dev for the safety check.
    // Actually since the safety check refuses non-prod by default, we
    // instead stub a temp creds file with the prod ref so we exercise the
    // prod-path dry-run.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalori-e12-'));
    const credsFile = path.join(tmpDir, 'fake-prod-keys.txt');
    fs.writeFileSync(
      credsFile,
      'SUPABASE_PROJECT_REF=dryysypycsexvlbabtwq\nSUPABASE_PAT=fake-pat-token\n',
      'utf8',
    );

    const { main } = await import('@/scripts/apply-prod-migrations-incremental.mjs');

    let exitCode: number | null = null;
    try {
      // Codex E.CODEX Round 1 (A-H1) — pass --confirm-destructive so the
      // 0020 soft-delete hazard does not abort the dry-run before plan
      // render. The hardened preflight is the correct gate; this test
      // exercises the plan-render path which sits past the preflight.
      await main(['--dry-run', '--confirm-destructive', '--env-file', credsFile]);
    } catch (e) {
      const msg = (e as Error).message;
      const m = msg.match(/^__exit:(\d+)__$/);
      if (m) exitCode = Number(m[1]);
      else throw e;
    }

    expect(exitCode).toBe(0);

    // Plan-section sanity: the four pending migrations should be listed.
    const allOut = logged.join('\n');
    expect(allOut).toContain('Mode:         dry-run');
    expect(allOut).toContain('Target ref:   dryysypycsexvlbabtwq');
    expect(allOut).toContain('[Layer 1 OK] prod ref matches expected');
    expect(allOut).toContain('Pending migrations');
    expect(allOut).toContain('0018_water_log_atomic_cap.sql');
    expect(allOut).toContain('0019_water_log_negative_ml_adjustments.sql');
    expect(allOut).toContain('0020_food_library_dedup_index.sql');
    expect(allOut).toContain('0021_library_overhaul.sql');
    expect(allOut).toContain('Dry-run mode — exiting before any writes');
    // Codex E.CODEX Round 1 (A-H1) — confirm the new soft-delete detector
    // surfaced 0020's UPDATE deleted_at in the destructive-DDL section.
    expect(allOut).toContain('UPDATE public.food_library_items SET deleted_at');

    // Dry-run path: only read-side calls should fire — the schema_migrations
    // tracker probe + (E.1.9 fix) the tracker-vs-artifact crosscheck probes
    // (xcheck_0018..0021). All four xcheck probes return [] (no higher
    // artifacts) so the tracker is honored. Any apply call would be a
    // POST to the /database/query endpoint with a non-SELECT body.
    expect(calls[0]).toBeDefined();
    const probeBody =
      typeof calls[0]!.body === 'string' ? JSON.parse(calls[0]!.body as string) : {};
    expect(probeBody.query).toContain('schema_migrations');
    // Sanity: every recorded call is a READ — `query` field contains SELECT
    // and never any DDL apply payload. The actual count is tracker + 4
    // xchecks = 5 in the contiguous-0001..0017 case.
    for (const c of calls) {
      const body = typeof c.body === 'string' ? JSON.parse(c.body) : {};
      const q: string = String(body.query ?? '');
      expect(q.trim().toUpperCase().startsWith('SELECT')).toBe(true);
    }

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refuses to run with default flags when project ref is not prod', async () => {
    const mockFetch = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalori-e12-dev-'));
    const credsFile = path.join(tmpDir, 'fake-dev-keys.txt');
    fs.writeFileSync(
      credsFile,
      'SUPABASE_PROJECT_REF=aaiohznsqlqchsoxaqkz\nSUPABASE_PAT=fake-pat-token\n',
      'utf8',
    );

    const { main } = await import('@/scripts/apply-prod-migrations-incremental.mjs');

    let exitCode: number | null = null;
    try {
      await main(['--dry-run', '--env-file', credsFile]);
    } catch (e) {
      const m = (e as Error).message.match(/^__exit:(\d+)__$/);
      if (m) exitCode = Number(m[1]);
      else throw e;
    }

    expect(exitCode).toBe(2);
    const allOut = logged.join('\n');
    expect(allOut).toContain('[Layer 1 REFUSE]');
    expect(mockFetch).not.toHaveBeenCalled(); // no network even attempted

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--allow-dev permits a dry-run against the dev project ref', async () => {
    const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      const sql: string = body.query ?? '';
      if (sql.includes('supabase_migrations.schema_migrations')) {
        // Pretend dev has all local migrations applied, so dry-run exits cleanly.
        const fs = await import('node:fs');
        const path = await import('node:path');
        const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
        const migrations = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();
        const rows = migrations.map((f) => ({ version: f.split('_')[0] }));
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalori-e12-allowdev-'));
    const credsFile = path.join(tmpDir, 'fake-dev-keys.txt');
    fs.writeFileSync(
      credsFile,
      'SUPABASE_PROJECT_REF=aaiohznsqlqchsoxaqkz\nSUPABASE_PAT=fake-pat-token\n',
      'utf8',
    );

    const { main } = await import('@/scripts/apply-prod-migrations-incremental.mjs');

    let exitCode: number | null = null;
    try {
      await main(['--dry-run', '--allow-dev', '--env-file', credsFile]);
    } catch (e) {
      const m = (e as Error).message.match(/^__exit:(\d+)__$/);
      if (m) exitCode = Number(m[1]);
      else throw e;
    }

    expect(exitCode).toBe(0);
    const allOut = logged.join('\n');
    expect(allOut).toContain('--allow-dev: running dry-run against known dev ref');
    expect(allOut).toContain('Nothing to apply');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('--allow-dev + --apply is rejected (dry-run only against non-prod)', async () => {
    const mockFetch = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalori-e12-allowdev-apply-'));
    const credsFile = path.join(tmpDir, 'fake-dev-keys.txt');
    fs.writeFileSync(
      credsFile,
      'SUPABASE_PROJECT_REF=aaiohznsqlqchsoxaqkz\nSUPABASE_PAT=fake-pat-token\n',
      'utf8',
    );

    const { main } = await import('@/scripts/apply-prod-migrations-incremental.mjs');

    let exitCode: number | null = null;
    try {
      await main(['--apply', '--allow-dev', '--env-file', credsFile]);
    } catch (e) {
      const m = (e as Error).message.match(/^__exit:(\d+)__$/);
      if (m) exitCode = Number(m[1]);
      else throw e;
    }

    expect(exitCode).toBe(2);
    const allOut = logged.join('\n');
    expect(allOut).toContain('--allow-dev forbids --apply');
    expect(mockFetch).not.toHaveBeenCalled();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
