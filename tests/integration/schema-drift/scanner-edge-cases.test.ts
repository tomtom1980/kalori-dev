/**
 * @vitest-environment node
 *
 * US-STAB-D4 — Schema-drift scanner edge-case lock-ins.
 *
 * These tests pin the fixes for Codex Round 1 review findings against
 * regression. They are NOT part of the AC contract — they guard the
 * scanner against accuracy regressions when future refactors touch
 * `scripts/schema-drift-check.mjs`.
 *
 * Findings covered:
 *   - Codex #2: opaque identifier payloads (`.insert(payload)`) produce an
 *     `unsupported: 'identifier-payload'` reference instead of silently
 *     dropping the call site.
 *   - Codex #3a: joined relationship projections
 *     (`select('id, food_library_items(name)')`) do NOT flag
 *     `food_library_items` as a missing column on the current table.
 *   - Codex #3b: PostgREST alias syntax (`select('display:display_name')`)
 *     keeps the column name AFTER the colon (the underlying column), not
 *     before (the response alias).
 *   - Codex #4: AC4 freshness uses STRICT equality — a future-dated marker
 *     that doesn't exist on disk is rejected as stale.
 *   - Codex #5: nested non-chain `.select(...)` calls
 *     (`.eq('id', helper.select('bogus'))`) are NOT attributed to the
 *     outer `.from(...)` table.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  computeMigrationsContentHash,
  detectDrift,
  extractReferencesFromFile,
  isTypesFileFresh,
  parseSchemaFromTypes,
} from '../../../scripts/schema-drift-check.mjs';
import { readFileSync } from 'node:fs';

const repoRoot = path.resolve(__dirname, '../../..');
const typesFilePath = path.join(repoRoot, 'lib', 'database.types.ts');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const edgeFixturesDir = path.join(repoRoot, 'tests', 'integration', 'schema-drift', '__fixtures__');

const opaquePayloadFixture = path.join(edgeFixturesDir, 'opaque-payload.fixture.ts');
const joinedRelationshipFixture = path.join(edgeFixturesDir, 'joined-relationship.fixture.ts');
const aliasFixture = path.join(edgeFixturesDir, 'alias-syntax.fixture.ts');
const nestedCallFixture = path.join(edgeFixturesDir, 'nested-call.fixture.ts');

describe('US-STAB-D4 scanner edge-cases (Codex Round 1 lock-ins)', () => {
  beforeAll(() => {
    if (!existsSync(edgeFixturesDir)) {
      mkdirSync(edgeFixturesDir, { recursive: true });
    }

    // Codex #2 — opaque identifier payload
    writeFileSync(
      opaquePayloadFixture,
      [
        '// Opaque payload fixture — the scanner must record this call with',
        '// `unsupported: identifier-payload` rather than silently skipping it.',
        'export async function opaque(supabase: any, insertPayload: any) {',
        "  await supabase.from('food_entries').insert(insertPayload);",
        '}',
        '',
      ].join('\n'),
    );

    // Codex #3a — joined relationship projection
    writeFileSync(
      joinedRelationshipFixture,
      [
        '// Joined relationship fixture — the inner `food_library_items(name)`',
        '// names a FOREIGN relationship; `food_library_items` is not a column',
        '// on `food_entries` and must NOT be flagged.',
        'export async function joined(supabase: any) {',
        '  const { data } = await supabase',
        "    .from('food_entries')",
        "    .select('id, food_library_items(display_name)');",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );

    // Codex #3b — alias syntax
    writeFileSync(
      aliasFixture,
      [
        '// Alias fixture — PostgREST aliasing renames the response key.',
        '// `display:display_name` keeps the column `display_name` (not `display`).',
        'export async function aliased(supabase: any) {',
        '  const { data } = await supabase',
        "    .from('food_entries')",
        "    .select('id, display:meal_category');",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );

    // Codex #5 — nested non-chain .select inside .eq argument
    writeFileSync(
      nestedCallFixture,
      [
        '// Nested-call fixture — the inner `helper.select(...)` is NOT a',
        '// continuation of `.from(food_entries)` and must not be attributed',
        '// to that table.',
        'function helperSelect(_arg: string) {',
        '  return null;',
        '}',
        'export async function nested(supabase: any) {',
        '  const { data } = await supabase',
        "    .from('food_entries')",
        "    .eq('id', helperSelect('bogus_outer_column'))",
        "    .select('id, meal_category');",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    for (const f of [
      opaquePayloadFixture,
      joinedRelationshipFixture,
      aliasFixture,
      nestedCallFixture,
    ]) {
      if (existsSync(f)) rmSync(f);
    }
  });

  it('records opaque identifier payloads as unsupported instead of skipping', () => {
    const refs = extractReferencesFromFile(opaquePayloadFixture, repoRoot);
    expect(refs.length).toBe(1);
    expect(refs[0]).toMatchObject({
      table: 'food_entries',
      kind: 'insert',
      columns: [],
      unsupported: 'identifier-payload',
    });
  });

  it('does not flag relationship names as missing columns on the current table', () => {
    const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
    const refs = extractReferencesFromFile(joinedRelationshipFixture, repoRoot);
    expect(refs.length).toBe(1);
    expect(refs[0]?.table).toBe('food_entries');
    // The relationship `food_library_items(display_name)` must NOT appear as
    // a current-table column. Only `id` is on the current table.
    expect(refs[0]?.columns).toEqual(['id']);
    const findings = refs.flatMap((r) => detectDrift(r, schema));
    expect(findings).toHaveLength(0);
  });

  it('keeps the underlying column from PostgREST alias syntax', () => {
    const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
    const refs = extractReferencesFromFile(aliasFixture, repoRoot);
    expect(refs.length).toBe(1);
    // `display:meal_category` -> underlying column `meal_category`, not `display`.
    expect(refs[0]?.columns).toEqual(['id', 'meal_category']);
    const findings = refs.flatMap((r) => detectDrift(r, schema));
    expect(findings).toHaveLength(0);
  });

  it('does not attribute nested non-chain .select calls to the outer .from table', () => {
    const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
    const refs = extractReferencesFromFile(nestedCallFixture, repoRoot);
    // Exactly ONE reference — the chain-level .select('id, meal_category').
    // The nested helperSelect('bogus_outer_column') call must NOT produce
    // a reference attributed to `food_entries`.
    expect(refs.length).toBe(1);
    expect(refs[0]?.columns).toEqual(['id', 'meal_category']);
    const findings = refs.flatMap((r) => detectDrift(r, schema));
    expect(findings).toHaveLength(0);
  });

  it('AC4 strict equality — rejects a future-dated marker that is not on disk', () => {
    // Simulate the current types-file by overriding the marker via a tmp
    // file. We use the real isTypesFileFresh to verify it requires strict
    // equality, not lexicographic `>=`.
    const tmpTypes = path.join(edgeFixturesDir, '__tmp-types.ts');
    try {
      writeFileSync(
        tmpTypes,
        [
          '// Generated 2099-01-01T00:00:00.000Z from migrations through 9999_future_migration.sql',
          'export type Json = unknown;',
          '',
        ].join('\n'),
      );
      const result = isTypesFileFresh({
        typesFile: tmpTypes,
        migrationsDir,
      });
      expect(result.fresh).toBe(false);
      // Must reject because the marker filename doesn't equal the newest on
      // disk AND isn't present in the migrations directory.
      expect(['marker-mismatch', 'marker-not-on-disk']).toContain(result.reason);
    } finally {
      if (existsSync(tmpTypes)) rmSync(tmpTypes);
    }
  });

  it('Codex Round 2 #6 — .from() inside comments/strings does not cut the lookahead', () => {
    const fixturePath = path.join(edgeFixturesDir, 'commented-from.fixture.ts');
    try {
      writeFileSync(
        fixturePath,
        [
          '// Stray `.from()` inside a comment and a string must NOT cap the',
          '// lookahead window or hide the real .select() call.',
          'export async function commented(supabase: any) {',
          "  // outdated chain: .from('profiles')",
          '  const note = "this string also mentions .from(\'profiles\')";',
          '  void note;',
          '  const { data } = await supabase',
          "    .from('food_entries')",
          "    .select('id, meal_category');",
          '  return data;',
          '}',
          '',
        ].join('\n'),
      );
      const refs = extractReferencesFromFile(fixturePath, repoRoot);
      // EXACTLY one chain-level reference, attributed to food_entries.
      expect(refs.length).toBe(1);
      expect(refs[0]?.table).toBe('food_entries');
      expect(refs[0]?.columns).toEqual(['id', 'meal_category']);
      const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
      const findings = refs.flatMap((r) => detectDrift(r, schema));
      expect(findings).toHaveLength(0);
    } finally {
      if (existsSync(fixturePath)) rmSync(fixturePath);
    }
  });

  it('Codex Round 2 #7 — unknown literal table is flagged as drift', () => {
    const fixturePath = path.join(edgeFixturesDir, 'unknown-table.fixture.ts');
    try {
      writeFileSync(
        fixturePath,
        [
          '// References a literal table that does NOT exist in the live',
          '// schema (e.g. renamed or dropped in migrations). The scanner',
          '// must emit an unknown-table finding.',
          'export async function dropped(supabase: any) {',
          '  const { data } = await supabase',
          "    .from('renamed_or_dropped_table')",
          "    .select('id');",
          '  return data;',
          '}',
          '',
        ].join('\n'),
      );
      const refs = extractReferencesFromFile(fixturePath, repoRoot);
      expect(refs.length).toBe(1);
      const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
      const findings = refs.flatMap((r) => detectDrift(r, schema));
      expect(findings.length).toBe(1);
      expect(findings[0]).toMatchObject({
        table: 'renamed_or_dropped_table',
        reason: 'unknown-table',
      });
    } finally {
      if (existsSync(fixturePath)) rmSync(fixturePath);
    }
  });

  it('Codex Round 2 #8 — column::cast is validated as the underlying column', () => {
    const fixturePath = path.join(edgeFixturesDir, 'cast-column.fixture.ts');
    try {
      writeFileSync(
        fixturePath,
        [
          '// PostgREST cast syntax `column::type` must NOT bypass validation.',
          '// `bogus_cast_column::text` should be checked against the table.',
          'export async function casted(supabase: any) {',
          '  const { data } = await supabase',
          "    .from('food_entries')",
          "    .select('id, bogus_cast_column::text');",
          '  return data;',
          '}',
          '',
        ].join('\n'),
      );
      const refs = extractReferencesFromFile(fixturePath, repoRoot);
      expect(refs.length).toBe(1);
      // The underlying identifier `bogus_cast_column` MUST appear in the
      // columns array so detectDrift can flag it.
      expect(refs[0]?.columns).toContain('bogus_cast_column');
      const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
      const findings = refs.flatMap((r) => detectDrift(r, schema));
      expect(
        findings.some((f) => f.column === 'bogus_cast_column' && f.table === 'food_entries'),
      ).toBe(true);
    } finally {
      if (existsSync(fixturePath)) rmSync(fixturePath);
    }
  });

  it('Codex Round 2 #8 — alias:column::cast keeps the underlying column', () => {
    const fixturePath = path.join(edgeFixturesDir, 'alias-cast.fixture.ts');
    try {
      writeFileSync(
        fixturePath,
        [
          '// PostgREST mixed `alias:column::cast` must keep `column`.',
          'export async function aliasCast(supabase: any) {',
          '  const { data } = await supabase',
          "    .from('food_entries')",
          "    .select('id, alias:meal_category::text');",
          '  return data;',
          '}',
          '',
        ].join('\n'),
      );
      const refs = extractReferencesFromFile(fixturePath, repoRoot);
      expect(refs.length).toBe(1);
      // Underlying column = meal_category, NOT alias.
      expect(refs[0]?.columns).toEqual(['id', 'meal_category']);
      const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
      const findings = refs.flatMap((r) => detectDrift(r, schema));
      expect(findings).toHaveLength(0);
    } finally {
      if (existsSync(fixturePath)) rmSync(fixturePath);
    }
  });

  it('AC4 strict equality — rejects a marker that exists but is older than newest', () => {
    const tmpTypes = path.join(edgeFixturesDir, '__tmp-types-old.ts');
    try {
      writeFileSync(
        tmpTypes,
        [
          '// Generated 2026-04-20T00:00:00.000Z from migrations through 0001_init.sql',
          'export type Json = unknown;',
          '',
        ].join('\n'),
      );
      const result = isTypesFileFresh({
        typesFile: tmpTypes,
        migrationsDir,
      });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('marker-mismatch');
    } finally {
      if (existsSync(tmpTypes)) rmSync(tmpTypes);
    }
  });

  // ---------------------------------------------------------------------------
  // Codex Round 1 regression locks (post-Round-2 review)
  // ---------------------------------------------------------------------------

  it('Codex Round 1 #1 — initial .from() discovery skips strings and comments', () => {
    // Finding #1: The initial `.from()` regex matched literals inside string
    // payloads and `//` / `/* */` comments. The schema-drift test files
    // contain intentional drift payloads as string literals, which the
    // scanner falsely flagged. Fix: lexer-aware discovery — `.from(...)`
    // is recognised ONLY when it appears as live code (not in a string or
    // comment).
    //
    // The fixture content is constructed as an array of plain strings then
    // joined — this avoids the tester having to escape literal `\'`/`\"`
    // sequences inside an outer JS string-literal.
    const fixturePath = path.join(edgeFixturesDir, 'string-comment-from.fixture.ts');
    const Q = "'"; // single quote (kept out of backtick/quote scopes for safety)
    const fixtureLines = [
      '// Stray `.from()` inside a single-line comment must NOT be',
      `// picked up as a real call: .from(${Q}fake_comment_table${Q}).select(${Q}id${Q})`,
      'export async function lexerAware(supabase: any) {',
      `  const sqlSingle = ".from(' + "'" + 'fake_single_quoted' + "'" + ').select(' + "'" + 'id' + "'" + ')";`,
      `  const sqlDouble = ".from(${Q}fake_double_quoted${Q}).select(${Q}id${Q})";`,
      '  void sqlSingle; void sqlDouble;',
      `  /* block comment with .from(${Q}fake_block_table${Q}).select(${Q}id${Q}) */`,
      '  const { data } = await supabase',
      `    .from(${Q}food_entries${Q})`,
      `    .select(${Q}id, meal_category${Q});`,
      '  return data;',
      '}',
      '',
    ];
    try {
      writeFileSync(fixturePath, fixtureLines.join('\n'));
      const refs = extractReferencesFromFile(fixturePath, repoRoot);

      // EXACTLY one chain-level reference — the real .from('food_entries').
      // None of the fake tables in strings/comments should appear.
      expect(refs.length).toBe(1);
      expect(refs[0]?.table).toBe('food_entries');
      expect(refs[0]?.columns).toEqual(['id', 'meal_category']);

      // None of the fake-table references should be in the references list.
      const fakeTables = refs.filter((r) =>
        [
          'fake_single_quoted',
          'fake_double_quoted',
          'fake_block_table',
          'fake_comment_table',
        ].includes(r.table),
      );
      expect(fakeTables).toHaveLength(0);

      // No drift findings (food_entries.id + meal_category are real columns).
      const schema = parseSchemaFromTypes(readFileSync(typesFilePath, 'utf8'));
      const findings = refs.flatMap((r) => detectDrift(r, schema));
      expect(findings).toHaveLength(0);
    } finally {
      if (existsSync(fixturePath)) rmSync(fixturePath);
    }
  });

  it('Codex Round 1 #3 — freshness fails when migration content changes without rename', () => {
    // Finding #3: `isTypesFileFresh` previously only sorted migration
    // filenames and compared the header marker to the newest. A PR could
    // edit a migration's CONTENT in place (no rename) and the freshness
    // check would silently pass. Fix: embed a SHA-256 content hash of all
    // migrations in the types-file header; recompute on each check.
    const tmpMigDir = path.join(edgeFixturesDir, '__tmp-migrations');
    const tmpTypes = path.join(edgeFixturesDir, '__tmp-types-hash.ts');
    try {
      mkdirSync(tmpMigDir, { recursive: true });
      const migA = path.join(tmpMigDir, '0001_init.sql');
      const migB = path.join(tmpMigDir, '0002_followup.sql');
      writeFileSync(migA, 'CREATE TABLE foo (id uuid PRIMARY KEY);\n');
      writeFileSync(migB, 'CREATE TABLE bar (id uuid PRIMARY KEY);\n');

      // Compute initial hash via the scanner's own exported helper so the
      // test tracks whatever digest format the implementation chose.
      const hashFresh = computeMigrationsContentHash(tmpMigDir);

      writeFileSync(
        tmpTypes,
        [
          '// Generated 2026-05-15T12:00:00.000Z from migrations through 0002_followup.sql',
          `// Migrations content hash: ${hashFresh}`,
          'export type Json = unknown;',
          '',
        ].join('\n'),
      );

      // First check — both filename AND hash match → fresh.
      const ok = isTypesFileFresh({ typesFile: tmpTypes, migrationsDir: tmpMigDir });
      expect(ok.fresh).toBe(true);

      // Edit migration content WITHOUT renaming the file.
      writeFileSync(migB, 'CREATE TABLE bar (id uuid PRIMARY KEY, name text);\n');

      // Second check — filename still matches but content hash drifted.
      const stale = isTypesFileFresh({ typesFile: tmpTypes, migrationsDir: tmpMigDir });
      expect(stale.fresh).toBe(false);
      expect(stale.reason).toBe('content-hash-mismatch');

      // Restore original content → hash matches again → fresh.
      writeFileSync(migB, 'CREATE TABLE bar (id uuid PRIMARY KEY);\n');
      const restored = isTypesFileFresh({ typesFile: tmpTypes, migrationsDir: tmpMigDir });
      expect(restored.fresh).toBe(true);
    } finally {
      if (existsSync(tmpTypes)) rmSync(tmpTypes);
      if (existsSync(tmpMigDir)) rmSync(tmpMigDir, { recursive: true, force: true });
    }
  });
});
