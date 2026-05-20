/**
 * @vitest-environment node
 *
 * US-STAB-D4 — Schema-drift CI guard (AC1 + AC2).
 *
 * AC1: `tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::audits-both-fixtures-and-app-code`
 *   The scanner audits BOTH test fixtures (under `tests/**`) AND application
 *   code paths in `lib/**` and `app/api/**` that use Supabase client builders
 *   referencing literal table / column names. The guard parses literal
 *   table/column references and compares them against the live schema
 *   (sourced from `lib/database.types.ts`).
 *
 * AC2: `tests/integration/schema-drift/check-fixtures-and-app-code.test.ts::fails-on-drift-in-fixtures-or-app-code`
 *   A fixture / lib / app-api file referencing a column not in the live
 *   schema produces a drift annotation. In `--mode block` the scanner exits
 *   non-zero. In `--mode report-only` (Stage 1, default) the scanner exits 0
 *   but still emits a `::warning::` annotation with `file:line:table.column`
 *   locator per O-1 observability cap.
 *
 * Per design-doc.md §11 (O-1 mitigation): annotation only — no auto-fix,
 * no mock generation, no new test framework. All fixtures live under
 * `tests/integration/schema-drift/__fixtures__/`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runScan } from '../../../scripts/schema-drift-check.mjs';

const repoRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(repoRoot, 'scripts', 'schema-drift-check.mjs');
const fixturesDir = path.join(repoRoot, 'tests', 'integration', 'schema-drift', '__fixtures__');
const driftFixturePath = path.join(fixturesDir, 'drift-sample.fixture.ts');
const cleanFixturePath = path.join(fixturesDir, 'clean-sample.fixture.ts');

describe('US-STAB-D4 schema-drift scanner', () => {
  beforeAll(() => {
    if (!existsSync(fixturesDir)) {
      mkdirSync(fixturesDir, { recursive: true });
    }

    // Controlled drift fixture: references a column (`bogus_drift_column`)
    // that does NOT exist in lib/database.types.ts. The scanner MUST flag
    // this. Wrapped in a function to keep TS happy even though this file is
    // never executed at runtime.
    writeFileSync(
      driftFixturePath,
      [
        '// Controlled drift fixture — referenced ONLY by the schema-drift scanner test.',
        '// Do NOT import this file from production code; it intentionally references',
        '// a column (`bogus_drift_column`) that does not exist in the live schema.',
        'export async function driftSample(supabase: any) {',
        '  const { data } = await supabase',
        "    .from('food_entries')",
        "    .select('id, bogus_drift_column, logged_at');",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );

    // Clean fixture: all columns exist. The scanner MUST NOT flag this.
    writeFileSync(
      cleanFixturePath,
      [
        '// Clean fixture — all referenced columns exist in the live schema.',
        'export async function cleanSample(supabase: any) {',
        '  const { data } = await supabase',
        "    .from('food_entries')",
        "    .select('id, meal_category, logged_at');",
        '  return data;',
        '}',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    if (existsSync(driftFixturePath)) rmSync(driftFixturePath);
    if (existsSync(cleanFixturePath)) rmSync(cleanFixturePath);
  });

  it('audits-both-fixtures-and-app-code', async () => {
    // The scanner exposes a programmatic API so tests can introspect findings
    // without parsing CLI annotations. Invoking it with no drift cases yields
    // the list of REFERENCES the scanner detected — at least one per scoped
    // root (tests/**, lib/**, app/api/**).
    const result = await runScan({
      repoRoot,
      includeRoots: ['tests', 'lib', 'app/api'],
      typesFile: 'lib/database.types.ts',
      mode: 'report-only',
    });

    // AC1.a — references found in lib/**
    expect(
      result.references.some((r) => r.file.startsWith('lib/') && !r.file.startsWith('lib/auth/')),
    ).toBe(true);

    // AC1.b — references found in app/api/**
    expect(result.references.some((r) => r.file.startsWith('app/api/'))).toBe(true);

    // AC1.c — references found in tests/** (the clean fixture we just seeded)
    expect(
      result.references.some((r) =>
        r.file.startsWith('tests/integration/schema-drift/__fixtures__/clean-sample.fixture.ts'),
      ),
    ).toBe(true);

    // AC1.d — each reference records file / line / table / columns (O-1 locator)
    for (const ref of result.references) {
      expect(typeof ref.file).toBe('string');
      expect(typeof ref.line).toBe('number');
      expect(typeof ref.table).toBe('string');
      expect(Array.isArray(ref.columns)).toBe(true);
    }
  });

  it('fails-on-drift-in-fixtures-or-app-code', async () => {
    // AC2.a — drift detection in report-only mode emits a finding but exits 0
    const reportResult = await runScan({
      repoRoot,
      includeRoots: ['tests/integration/schema-drift/__fixtures__'],
      typesFile: 'lib/database.types.ts',
      mode: 'report-only',
    });
    const driftFindings = reportResult.findings.filter(
      (f) => f.column === 'bogus_drift_column' && f.table === 'food_entries',
    );
    expect(driftFindings.length).toBeGreaterThan(0);
    expect(reportResult.exitCode).toBe(0);

    // AC2.b — annotation locator format includes file, line, table.column
    const drift = driftFindings[0];
    if (!drift) throw new Error('expected at least one drift finding');
    expect(drift.file).toContain('drift-sample.fixture.ts');
    expect(typeof drift.line).toBe('number');
    expect(drift.line).toBeGreaterThan(0);
    expect(drift.annotation).toMatch(
      /^::(warning|error) file=[^,]+,line=\d+,col=\d+::Schema drift: column 'bogus_drift_column' not in table 'food_entries'/,
    );

    // AC2.c — block mode raises exit code 1 when drift detected
    const blockResult = await runScan({
      repoRoot,
      includeRoots: ['tests/integration/schema-drift/__fixtures__'],
      typesFile: 'lib/database.types.ts',
      mode: 'block',
    });
    expect(blockResult.exitCode).toBe(1);
    expect(
      blockResult.findings.some(
        (f) => f.column === 'bogus_drift_column' && f.table === 'food_entries',
      ),
    ).toBe(true);

    // AC2.d — CLI invocation in report-only mode exits 0 even with drift.
    // This is the Stage-1 contract (FF #G mitigation).
    let cliExitCode = 0;
    try {
      execFileSync(
        process.execPath,
        [
          scriptPath,
          '--mode',
          'report-only',
          '--paths',
          'tests/integration/schema-drift/__fixtures__',
        ],
        { cwd: repoRoot, stdio: 'pipe' },
      );
    } catch (err) {
      const e = err as { status?: number };
      cliExitCode = e.status ?? 1;
    }
    expect(cliExitCode).toBe(0);
  });
});
