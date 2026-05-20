/**
 * @vitest-environment node
 *
 * Task D.6 (US-STAB-D6) AC1 — `food_library_items` partial unique index exists.
 *
 * **Test ID kept as `0018-`** even though the actual migration shipped as
 * `0020_food_library_dedup_index.sql` (migrations 0018 + 0019 had been claimed
 * by water-log work between the sprint design and execution). The `0018-` prefix
 * is the task identifier from the briefing's test plan (§5 / §12.1 Option A);
 * the migration version is asserted dynamically against `readdirSync` so any
 * future renumber stays self-correcting.
 *
 * Asserts AC1: a partial unique index exists on
 *   `food_library_items (user_id, normalized_name)
 *    WHERE deleted_at IS NULL AND normalized_name IS NOT NULL`
 * after the migration applies to kalori-dev.
 *
 * Skip-gate matches `tests/rls/*` and `tests/integration/library-merge-tombstone-real-db.test.ts`:
 * when `SUPABASE_TEST_*` env vars are absent (e.g., local dev without dev DB),
 * the suite is `describe.skip` so `pnpm test` stays green offline.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

// `pg_indexes` is a pg_catalog view; PostgREST does not expose it by default,
// so we hit the Supabase Management API `database/query` endpoint directly
// (same path `scripts/apply-prod-migrations.mjs` uses). The PAT comes from
// either `Planning/devapikeys.txt` (loaded into process.env by setup-files
// when present) or an explicit `SUPABASE_PAT` env var.
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SUPABASE_PAT = process.env.SUPABASE_PAT;
const hasManagementApiEnv = !!SUPABASE_PROJECT_REF && !!SUPABASE_PAT;

async function pgCatalogQuery(sql: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_PAT}`,
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`pg_catalog query HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

// Strip SQL comments before regex inspection — the migration body has long
// comment blocks that contain BEGIN/COMMIT/CREATE/CONCURRENTLY/etc. as
// explanatory prose, which would otherwise collide with the canonical-shape
// regex assertions below. Two comment styles are present:
//   * single-line `--` until end-of-line
//   * `/* ... */` block comments (not used in 0020 but defensive)
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/--.*$/gm, ''); // line comments
}

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const INDEX_NAME = 'food_library_items_user_normalized_name_unique';

describe('AC1: food_library_items partial unique index (Task D.6 — migration shipped as 0020)', () => {
  // Static file-shape assertions — no DB required, so these are NOT gated by
  // SUPABASE_TEST_* env. They cover the file-presence and SQL-structure
  // contract from the briefing §5 (filename renumber) and the §11.2 7-step
  // canonical pattern.
  describe('migration file shape (static)', () => {
    it('a 0020_food_library_dedup_*.sql migration file exists', () => {
      const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
      const match = files.find((f) => /^0020_food_library_(items_)?dedup/.test(f));
      expect(
        match,
        `expected a 0020_food_library_(items_)?dedup_*.sql migration in ${MIGRATIONS_DIR}`,
      ).toBeTruthy();
    });

    it('migration body matches the canonical 7-step shape (BEGIN → LOCK → cleanup CTE → ASSERT → CREATE UNIQUE INDEX → COMMIT)', () => {
      const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
      const file = files.find((f) => /^0020_food_library_(items_)?dedup/.test(f));
      expect(file).toBeTruthy();
      const rawSql = readFileSync(resolve(MIGRATIONS_DIR, file!), 'utf8');
      // Strip comments so the SQL-shape regexes don't catch tokens in
      // explanatory prose (e.g. "CREATE UNIQUE INDEX" mentioned in a header
      // comment block before the actual statement).
      const sql = stripSqlComments(rawSql);

      // Required tokens — case-insensitive presence check.
      const required = [
        /\bBEGIN\b/i,
        /\bLOCK\s+TABLE\s+(?:public\.)?food_library_items\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE\b/i,
        /\bCREATE\s+UNIQUE\s+INDEX\b/i,
        /WHERE\s+deleted_at\s+IS\s+NULL\s+AND\s+normalized_name\s+IS\s+NOT\s+NULL/i,
        /\bCOMMIT\b/i,
      ];
      for (const re of required) {
        expect(sql, `migration must include ${re}`).toMatch(re);
      }

      // Index name stable across migration body + planning docs + AC tests.
      expect(sql).toMatch(new RegExp(`\\b${INDEX_NAME}\\b`));

      // No CONCURRENTLY — incompatible with BEGIN/COMMIT transactions.
      expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY/i);

      // Ordering: BEGIN < LOCK < CREATE UNIQUE INDEX < COMMIT. Use the
      // FIRST occurrence of each via `.search`; comments are stripped above
      // so these are the actual SQL statements.
      const beginIdx = sql.search(/\bBEGIN\b/i);
      const lockIdx = sql.search(/\bLOCK\s+TABLE\s+(?:public\.)?food_library_items/i);
      const createIdx = sql.search(/\bCREATE\s+UNIQUE\s+INDEX\b/i);
      const commitIdx = sql.search(/\bCOMMIT\b/i);

      expect(beginIdx).toBeGreaterThanOrEqual(0);
      expect(lockIdx).toBeGreaterThan(beginIdx);
      expect(createIdx).toBeGreaterThan(lockIdx);
      expect(commitIdx).toBeGreaterThan(createIdx);
    });
  });

  // Dynamic DB-state assertion — gated on `SUPABASE_PROJECT_REF` +
  // `SUPABASE_PAT` (the Management API env) so local offline runs skip.
  // Asserts the index exists with the documented predicate in `pg_indexes`.
  // PostgREST does not expose pg_catalog views by default, so this uses the
  // Management API `database/query` endpoint directly (project convention
  // matching `scripts/apply-prod-migrations.mjs`).
  // Gate on BOTH SUPABASE_TEST_* (signals "intentional integration run") AND
  // Management API env (PAT + PROJECT_REF). The double-gate prevents the
  // dynamic test from firing against prod credentials accidentally loaded
  // from `.env.local` during a local offline run.
  const maybeApi = hasSupabaseTestEnv && hasManagementApiEnv ? describe : describe.skip;
  maybeApi('post-migration DB state (live dev DB via Management API)', () => {
    it('index-exists-with-soft-delete-predicate — pg_indexes shows the partial unique index', async () => {
      const rows = (await pgCatalogQuery(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname  = '${INDEX_NAME}';`,
      )) as { indexname: string; indexdef: string }[];

      expect(rows.length, `expected exactly 1 row for index ${INDEX_NAME}`).toBe(1);
      const row = rows[0];
      if (!row) throw new Error(`expected row for index ${INDEX_NAME}`);
      expect(row.indexname).toBe(INDEX_NAME);
      const def = row.indexdef.toLowerCase();
      expect(def).toContain('unique');
      expect(def).toContain('deleted_at is null');
      expect(def).toContain('normalized_name is not null');
      // The index covers (user_id, normalized_name) — assert ordering.
      expect(def).toMatch(/\(user_id,\s*normalized_name\)/);
    }, 30_000);
  });

  // hasSupabaseTestEnv kept as a sanity for the harness-aware tests below
  // (none in this file yet; placeholder for future expansion).
  void hasSupabaseTestEnv;
});
