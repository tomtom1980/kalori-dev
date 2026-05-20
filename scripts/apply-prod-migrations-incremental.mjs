// scripts/apply-prod-migrations-incremental.mjs
//
// Task E.1.2 — incremental prod migration cutover script.
//
// Replaces the original empty-DB-only `scripts/apply-prod-migrations.mjs` for
// kalori-prod cutovers where 0001..0017 are ALREADY applied and we need to
// apply only the delta (currently 0018..0021).
//
// Differences vs. `apply-prod-migrations.mjs` (2026-05-01 empty-DB bootstrap):
//
//   1. Empty-DB sanity guard REPLACED with applied-migration detection. We
//      query `supabase_migrations.schema_migrations` (Supabase's internal
//      tracker). If that table is missing OR empty (the Management API path
//      may not always populate it — see Planning/progress.md note re:
//      migration 0011 renumber), we fall back to artifact detection by
//      checking whether the LAST local migration's known artifact already
//      exists.
//
//   2. Schema-diff pre-flight: each prod-pending migration is statically
//      scanned for destructive DDL (DROP TABLE / DROP COLUMN / TRUNCATE / etc.)
//      and the script refuses to proceed unless --confirm-destructive is set.
//
//   3. Per-migration verification suite runs IMMEDIATELY after each apply,
//      not as a bulk post-apply pass. Verification predicates are sourced
//      from Task E.1 AC2 PLUS the actual migration body (so we catch the
//      AC2 vs. real-schema disconnects — see the "AC2 reconciliation" note
//      below).
//
//   4. Operating modes: --dry-run (default), --apply (required to write),
//      --confirm-destructive (required if destructive DDL detected),
//      --migrations 0018,0019 (explicit override), --verbose, --allow-dev
//      (allow a dry-run against the dev project ref for verification only).
//
//   5. The fail-fast loop + orphan-profile backfill semantics from the
//      original script are preserved.
//
// Safety guards (4 layers, preserved + improved):
//
//   L1 — Hardcoded prod-ref check. Unless --allow-dev, refuse to run if
//        SUPABASE_PROJECT_REF !== 'dryysypycsexvlbabtwq'.
//
//   L2 — Default mode is --dry-run (NEVER --apply). User must pass --apply
//        to make any write.
//
//   L3 — Destructive-DDL pre-flight. If any pending migration contains
//        destructive DDL, require --confirm-destructive.
//
//   L4 — Per-migration verification suite. On verification failure, the
//        loop exits 4 with the failed predicate surfaced.
//
// AC2 reconciliation note (Task E.1 AC2):
//
//   AC2 references:
//     - `water_log_create_with_cap` RPC — actual name is `log_water_with_cap`
//       (verified by reading 0018_water_log_atomic_cap.sql line 74).
//     - `pg_try_advisory_xact_lock` usage — actual call is the unconditional
//       `pg_advisory_xact_lock` (line 115).
//     - `food_library_items_dedup_partial_unique` index — actual name is
//       `food_library_items_user_normalized_name_unique` (0020 line 137).
//     - sketch columns `sketch_image_storage_path`, `sketch_thumb_storage_path`,
//       `sketch_prompt`, `sketch_meta` — actual columns added by 0021 are
//       `thumbnail_kind`, `sketch_generated_at`, `sketch_attempt_count`,
//       `sketch_last_error` (0021 lines 96..146).
//
//   This script verifies the ACTUAL migration artifacts (matching what
//   the migration bodies declare), and surfaces the AC2 wording mismatch
//   in its summary output so the E.1 paperwork can be corrected without a
//   silent gap. The migration content IS the contract; the AC2 row text
//   was a verbal paraphrase that drifted from the SQL.
//
// Exit codes:
//   0 — success (or dry-run rendered plan and exited)
//   1 — bad invocation (missing creds, bad flag combo, no migrations to apply)
//   2 — safety-guard refusal (prod ref mismatch / destructive DDL without flag)
//   3 — migration apply failed
//   4 — verification query failed
//   5 — R1 firewall check failed (auth/anon EXECUTE on cascade RPCs)
//
// Run:
//   node scripts/apply-prod-migrations-incremental.mjs                # dry-run
//   node scripts/apply-prod-migrations-incremental.mjs --apply        # WRITES
//   node scripts/apply-prod-migrations-incremental.mjs --apply \
//       --confirm-destructive --verbose
//   node scripts/apply-prod-migrations-incremental.mjs --allow-dev    # dev dry-run

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const EXPECTED_PROD_REF = 'dryysypycsexvlbabtwq';
export const KNOWN_DEV_REF = 'aaiohznsqlqchsoxaqkz';

// =============================================================================
// Pure helpers — unit-testable, no fs/network side effects
// =============================================================================

/**
 * Extract the leading migration number (`'0018'`) from a migration filename.
 * Returns null if the filename does not match the canonical `NNNN_...` shape.
 */
export function parseMigrationNumber(filename) {
  const m = filename.match(/^(\d{4})_/);
  return m ? m[1] : null;
}

/**
 * Given the locally-available migration list (filenames) and the set of
 * already-applied migration numbers, return the array of migration filenames
 * that still need to be applied, in sorted (apply) order.
 *
 *   local:   ['0001_init.sql', ..., '0021_library_overhaul.sql']
 *   applied: Set { '0001', '0002', ..., '0017' }
 *   returns: ['0018_...', '0019_...', '0020_...', '0021_...']
 */
export function computeMigrationDelta(local, applied) {
  const sorted = [...local].sort();
  return sorted.filter((f) => {
    const n = parseMigrationNumber(f);
    return n !== null && !applied.has(n);
  });
}

/**
 * Strip SQL comments (both `--` line comments and `/* * /` block comments)
 * from a SQL string. Used by detectDestructiveDDL so the destructive-DDL
 * scanner doesn't flag narrative comments that discuss DROP/TRUNCATE/etc.
 *
 * Exported so the unit tests can pin the contract.
 */
export function stripSqlComments(sqlString) {
  // 1. Remove `/* ... * /` block comments (non-greedy, multiline).
  let out = sqlString.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // 2. Remove `-- ...` line comments through end-of-line.
  out = out.replace(/--[^\n\r]*/g, '');
  return out;
}

/**
 * Static scan for destructive DDL. Returns an array of human-readable strings
 * describing each destructive operation found. Empty array = safe.
 *
 * Heuristic — case-insensitive regex match for the canonical destructive
 * patterns. We intentionally tolerate `DROP CONSTRAINT IF EXISTS ... ADD
 * CONSTRAINT` swaps and `DROP INDEX IF EXISTS ... CREATE INDEX` swaps,
 * because those are non-destructive idempotency guards used by every
 * migration in this repo. Specifically we whitelist:
 *
 *   - `DROP CONSTRAINT IF EXISTS` followed by an `ADD CONSTRAINT` later in
 *     the same file (treated as a CHECK / FK swap — non-destructive when
 *     the new constraint is a superset, which is the design pattern in
 *     0021 line 75-80 widening `created_from` from 2 → 3 values).
 *   - `DROP INDEX IF EXISTS` followed by `CREATE` of an index with the same
 *     base name (treated as idempotent re-create).
 *
 * Anything else — `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `TRUNCATE`,
 * `ALTER ... TYPE` (data-loss potential), `DELETE FROM` without WHERE — is
 * flagged.
 */
export function detectDestructiveDDL(sqlString) {
  const findings = [];
  // Strip SQL comments before scanning — both -- line comments and /* */
  // block comments. Migration files include extensive documentation in
  // comments that mention DROP TABLE / DROP COLUMN / etc. as discussion,
  // not as executable DDL (e.g. 0020 lines 39, 67 mention "DROP INDEX IF
  // EXISTS" in narrative comments). Without stripping we'd flag those as
  // destructive ops that don't actually exist in the executable SQL.
  const sql = stripSqlComments(sqlString);

  // DROP TABLE — always flag (no whitelist).
  const dropTableMatches = sql.matchAll(/\bDROP\s+TABLE\b(\s+IF\s+EXISTS)?\s+([^\s;]+)/gi);
  for (const m of dropTableMatches) findings.push(`DROP TABLE ${m[2]}`);

  // DROP SCHEMA — always flag.
  const dropSchemaMatches = sql.matchAll(/\bDROP\s+SCHEMA\b(\s+IF\s+EXISTS)?\s+([^\s;]+)/gi);
  for (const m of dropSchemaMatches) findings.push(`DROP SCHEMA ${m[2]}`);

  // ALTER ... DROP COLUMN — always flag (data loss).
  const dropColMatches = sql.matchAll(/\bDROP\s+COLUMN\b(\s+IF\s+EXISTS)?\s+([^\s;,]+)/gi);
  for (const m of dropColMatches) findings.push(`DROP COLUMN ${m[2]}`);

  // TRUNCATE — always flag.
  const truncateMatches = sql.matchAll(/\bTRUNCATE\b(\s+TABLE)?\s+([^\s;]+)/gi);
  for (const m of truncateMatches) findings.push(`TRUNCATE ${m[2]}`);

  // DELETE FROM ... without WHERE — flag (data loss).
  // Heuristic: look for DELETE FROM <ident> followed by `;` before any WHERE.
  const deleteMatches = sql.matchAll(/\bDELETE\s+FROM\s+([^\s;]+)\s*(?:;|\bRETURNING\b|\n\s*\n)/gi);
  for (const m of deleteMatches) {
    // Verify there is no WHERE clause between DELETE FROM and the terminator.
    const startIdx = m.index;
    const segment = sql.substring(startIdx, startIdx + m[0].length);
    if (!/\bWHERE\b/i.test(segment)) {
      findings.push(`DELETE FROM ${m[1]} (no WHERE)`);
    }
  }

  // Codex E.CODEX Round 1 (A-H1) — UPDATE ... SET deleted_at = ... is a
  // soft-delete that hides rows from RLS-filtered selects. When run under
  // the privileged migration context it bypasses RLS and can affect rows
  // across tenants. 0020's duplicate cleanup uses this pattern. The
  // earlier preflight only scanned DROP/TRUNCATE/DELETE-without-WHERE and
  // missed UPDATE-level data mutations, so this migration could be
  // classified as clean and applied without --confirm-destructive.
  //
  // Heuristic: match `UPDATE <ident> ... SET ... deleted_at` anywhere in
  // the statement. We do not require a WHERE clause here because EVEN a
  // WHERE-scoped soft-delete across users is operator-visible data
  // mutation that warrants explicit confirmation. The capture is
  // intentionally loose (matches across the entire SET clause) so it
  // catches multi-column SETs like `SET updated_at = now(), deleted_at = now()`.
  const softDeleteMatches = sql.matchAll(
    /\bUPDATE\s+([^\s;]+)\s+[\s\S]*?\bSET\s+[\s\S]*?\bdeleted_at\b\s*=/gi,
  );
  for (const m of softDeleteMatches) {
    findings.push(
      `UPDATE ${m[1]} SET deleted_at (soft-delete; cross-tenant under migration RLS bypass)`,
    );
  }

  // ALTER COLUMN ... TYPE — flag (can be lossy on cast).
  const alterTypeMatches = sql.matchAll(
    /\bALTER\s+COLUMN\s+(\w+)\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+)/gi,
  );
  for (const m of alterTypeMatches) findings.push(`ALTER COLUMN ${m[1]} TYPE ${m[2]}`);

  // DROP CONSTRAINT — only flag if NOT followed by a matching ADD CONSTRAINT
  // for the same constraint name (those are non-destructive swap patterns).
  // The (?:IF\s+EXISTS\s+) inside the non-capturing group has to be optional
  // BEFORE the identifier capture, otherwise "DROP CONSTRAINT IF EXISTS foo"
  // captures "IF" as the constraint name.
  const dropConstraintMatches = [
    ...sql.matchAll(/\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi),
  ];
  for (const m of dropConstraintMatches) {
    const name = m[1];
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const addConstraintRe = new RegExp(`\\bADD\\s+CONSTRAINT\\b\\s+${escapedName}\\b`, 'i');
    if (!addConstraintRe.test(sql)) {
      findings.push(`DROP CONSTRAINT ${name} (no matching ADD CONSTRAINT)`);
    }
  }

  // DROP FUNCTION (without OR REPLACE pattern) — flag.
  // `create or replace function` is non-destructive. `drop function` is.
  const dropFnMatches = sql.matchAll(/\bDROP\s+FUNCTION\b(\s+IF\s+EXISTS)?\s+([^\s(;]+)/gi);
  for (const m of dropFnMatches) findings.push(`DROP FUNCTION ${m[2]}`);

  // DROP INDEX — only flag if not followed by CREATE of the same index.
  // Same regex-quirk fix as DROP CONSTRAINT above: IF EXISTS must be inside
  // a non-capturing prefix so the identifier capture lands on the index name,
  // not on "IF".
  const dropIndexMatches = [
    ...sql.matchAll(
      /\bDROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ),
  ];
  for (const m of dropIndexMatches) {
    const name = m[1];
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const createIdxRe = new RegExp(
      `\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\b(?:\\s+CONCURRENTLY)?\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${escapedName}\\b`,
      'i',
    );
    if (!createIdxRe.test(sql)) {
      findings.push(`DROP INDEX ${name} (no matching CREATE INDEX)`);
    }
  }

  // E.1.9 Codex finding 3 — behavior / permission-changing DDL hazards.
  // These do not destroy data but can silently break inserts, role access,
  // or critical RPC behavior. Flag them so the operator sees the hazard and
  // must explicitly pass --confirm-destructive.

  // REVOKE — flag REVOKE statements as potential permission changes, EXCEPT
  // the canonical "revoke from PUBLIC + grant to a specific role for the
  // SAME object" hardening idiom used by every SECURITY DEFINER RPC
  // migration in this repo (see 0018 line 212 / 0019 line 140). That
  // pattern tightens the default PUBLIC grant for a specific function —
  // net-positive for the auth-only contract.
  //
  // E.1.9 Codex Round 2 finding 3 — the whitelist now requires the paired
  // GRANT to target the SAME object name as the REVOKE. Without that
  // check, a migration could revoke from one object and grant on an
  // unrelated one and the gate would silently suppress the hazard.
  const revokeFullMatches = [
    ...sql.matchAll(
      // (1) object name + optional arg list; (2) role the privilege is taken from.
      /\bREVOKE\b\s+[^;]*?\bON\s+(?:FUNCTION|TABLE|SCHEMA|SEQUENCE)?\s*([a-zA-Z_][\w.]*)(?:\s*\([^)]*\))?\s+[^;]{0,200}?\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ),
  ];
  const grantTuples = [
    ...sql.matchAll(
      /\bGRANT\b\s+[^;]*?\bON\s+(?:FUNCTION|TABLE|SCHEMA|SEQUENCE)?\s*([a-zA-Z_][\w.]*)(?:\s*\([^)]*\))?\s+[^;]{0,200}?\bTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ),
  ].map((m) => ({ obj: m[1], role: m[2], index: m.index ?? 0 }));

  for (const m of revokeFullMatches) {
    const revokedObj = m[1];
    const revokedFrom = m[2];
    const revokeIndex = m.index ?? 0;
    if (revokedFrom.toLowerCase() === 'public') {
      const pairedGrant = grantTuples.find(
        (g) => g.index > revokeIndex && g.obj === revokedObj && g.role.toLowerCase() !== 'public',
      );
      if (pairedGrant) {
        // Canonical hardening pattern on the SAME object — net-positive. Skip.
        continue;
      }
    }
    findings.push(`REVOKE ... ON ${revokedObj} FROM ${revokedFrom} (role/privilege change)`);
  }
  // Fallback: catch REVOKE statements without an "ON <object>" capture
  // (rare, e.g. system-catalog REVOKEs). Skip those already attributed
  // by revokeFullMatches.
  const revokeFallback = [
    ...sql.matchAll(/\bREVOKE\b\s+[^;]{0,400}?\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
  ];
  for (const m of revokeFallback) {
    const alreadyCounted = revokeFullMatches.some(
      (full) => Math.abs((full.index ?? 0) - (m.index ?? 0)) < 5,
    );
    if (alreadyCounted) continue;
    findings.push(`REVOKE ... FROM ${m[1]} (role/privilege change, no ON clause matched)`);
  }

  // ALTER ... DROP DEFAULT — removing a column default can break inserts
  // that rely on it. SET DEFAULT is additive and not flagged.
  //
  // E.1.9 Codex Round 2 finding 4 — broaden the regex to cover Postgres
  // syntax variants:
  //   1. `ALTER COLUMN <ident> DROP DEFAULT`           (canonical)
  //   2. `ALTER <ident> DROP DEFAULT`                  (COLUMN is optional)
  //   3. `ALTER COLUMN "createdAt" DROP DEFAULT`       (quoted identifier)
  //   4. `ALTER "createdAt" DROP DEFAULT`              (both shortcuts at once)
  //
  // We capture EITHER a bare identifier OR a double-quoted identifier and
  // make `COLUMN` optional.
  const dropDefaultMatches = sql.matchAll(
    /\bALTER\s+(?:COLUMN\s+)?(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s+DROP\s+DEFAULT\b/gi,
  );
  for (const m of dropDefaultMatches) {
    const name = m[1] ?? m[2];
    findings.push(`ALTER COLUMN ${name} DROP DEFAULT (insert behavior change)`);
  }

  // Note on CREATE OR REPLACE FUNCTION: intentionally NOT flagged here.
  // Every water/library RPC migration uses this pattern legitimately. The
  // per-migration verification suite (`buildVerificationQuery`) catches
  // behavioral regressions via predicate checks (e.g. 0019's
  // `under_daily_limit` body assertion). If a future migration introduces
  // a CREATE OR REPLACE FUNCTION whose behavior change is NOT covered by a
  // predicate, add that predicate to buildVerificationQuery rather than
  // promoting all CREATE OR REPLACE FUNCTION calls to destructive — the
  // false-positive rate would be unworkable.

  return findings;
}

/**
 * Canonical per-migration verification suite. Each entry is `{ name, sql,
 * predicate }` where `predicate(rows)` returns true on PASS, false on FAIL.
 *
 * Predicates are sourced from the ACTUAL migration content (read from
 * supabase/migrations/NNNN_*.sql) — see the "AC2 reconciliation" note at
 * the top of this file for why we don't use the AC2 wording verbatim.
 */
export function buildVerificationQuery(migrationNumber) {
  switch (migrationNumber) {
    case '0018':
      // 0018_water_log_atomic_cap.sql:
      //   - CREATE OR REPLACE FUNCTION public.log_water_with_cap(uuid, date, integer, text)
      //   - body contains pg_advisory_xact_lock (NOT pg_try_advisory_xact_lock as AC2 says)
      return [
        {
          name: '0018.fn_exists',
          sql:
            'SELECT 1 AS hit FROM pg_proc p ' +
            'JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap';",
          predicate: (rows) => Array.isArray(rows) && rows.length === 1,
          description:
            "function public.log_water_with_cap exists (AC2 refers to it as 'water_log_create_with_cap' — actual name verified against 0018 line 74).",
        },
        {
          name: '0018.advisory_lock_used',
          sql:
            'SELECT 1 AS hit FROM pg_proc p ' +
            'JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap' " +
            "  AND pg_get_functiondef(p.oid) ILIKE '%pg_advisory_xact_lock%';",
          predicate: (rows) => Array.isArray(rows) && rows.length === 1,
          description:
            'function body references pg_advisory_xact_lock (AC2 says pg_try_advisory_xact_lock — actual call is the blocking variant, verified at 0018 line 115).',
        },
      ];

    case '0019':
      // 0019_water_log_negative_ml_adjustments.sql:
      //   - alters water_log_count_check CHECK constraint to permit negative ml rows
      //     for unit='ml' between -5000 and 5000.
      //   - re-defines log_water_with_cap with under_daily_limit (P0013) raise.
      return [
        {
          name: '0019.check_constraint_allows_negative_ml',
          sql:
            'SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con ' +
            'JOIN pg_class rel ON rel.oid = con.conrelid ' +
            'JOIN pg_namespace ns ON ns.oid = rel.relnamespace ' +
            "WHERE ns.nspname = 'public' AND rel.relname = 'water_log' " +
            "  AND con.conname = 'water_log_count_check';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.def === 'string' &&
            /-5000/.test(rows[0].def) &&
            /unit\s*=\s*'ml'/i.test(rows[0].def),
          description:
            "water_log_count_check permits unit='ml' rows with count between -5000 and 5000 (per 0019 line 8-12).",
        },
        {
          name: '0019.fn_under_daily_limit_branch',
          sql:
            'SELECT 1 AS hit FROM pg_proc p ' +
            'JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = 'public' AND p.proname = 'log_water_with_cap' " +
            "  AND pg_get_functiondef(p.oid) ILIKE '%under_daily_limit%';",
          predicate: (rows) => Array.isArray(rows) && rows.length === 1,
          description:
            'log_water_with_cap body raises under_daily_limit P0013 (re-defined by 0019; see 0019 line 90-95).',
        },
      ];

    case '0020':
      // 0020_food_library_dedup_index.sql:
      //   - partial unique index food_library_items_user_normalized_name_unique
      //     ON public.food_library_items (user_id, normalized_name)
      //     WHERE deleted_at IS NULL AND normalized_name IS NOT NULL
      //   - AC2 calls it `food_library_items_dedup_partial_unique` — wrong name;
      //     the actual index name is the one above (verified at 0020 line 137).
      return [
        {
          name: '0020.partial_unique_index_exists',
          sql:
            'SELECT indexdef FROM pg_indexes ' +
            "WHERE schemaname = 'public' " +
            "  AND indexname  = 'food_library_items_user_normalized_name_unique';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.indexdef === 'string' &&
            /deleted_at\s+IS\s+NULL/i.test(rows[0].indexdef) &&
            /normalized_name\s+IS\s+NOT\s+NULL/i.test(rows[0].indexdef) &&
            /UNIQUE/i.test(rows[0].indexdef),
          description:
            'partial unique index food_library_items_user_normalized_name_unique on (user_id, normalized_name) WHERE deleted_at IS NULL AND normalized_name IS NOT NULL.',
        },
      ];

    case '0021':
      // 0021_library_overhaul.sql:
      //   - widens food_library_items_created_from_check to ('text','photo','manual')
      //   - adds 4 columns: thumbnail_kind, sketch_generated_at,
      //     sketch_attempt_count, sketch_last_error
      //   - AC2 lists DIFFERENT column names (sketch_image_storage_path,
      //     sketch_thumb_storage_path, sketch_prompt, sketch_meta) — those are
      //     NOT in the migration body (verified at 0021 lines 96-146).
      return [
        {
          name: '0021.created_from_check_widened',
          sql:
            'SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con ' +
            'JOIN pg_class rel ON rel.oid = con.conrelid ' +
            'JOIN pg_namespace ns ON ns.oid = rel.relnamespace ' +
            "WHERE ns.nspname = 'public' AND rel.relname = 'food_library_items' " +
            "  AND con.conname = 'food_library_items_created_from_check';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.def === 'string' &&
            /'manual'/.test(rows[0].def) &&
            /'text'/.test(rows[0].def) &&
            /'photo'/.test(rows[0].def),
          description:
            "food_library_items_created_from_check includes 'manual' (widened by 0021 line 75-80).",
        },
        {
          name: '0021.sketch_columns_present',
          sql:
            'SELECT column_name, data_type FROM information_schema.columns ' +
            "WHERE table_schema = 'public' AND table_name = 'food_library_items' " +
            "  AND column_name IN ('thumbnail_kind','sketch_generated_at','sketch_attempt_count','sketch_last_error') " +
            'ORDER BY column_name;',
          predicate: (rows) => {
            if (!Array.isArray(rows)) return false;
            const names = new Set(rows.map((r) => r.column_name));
            return (
              names.has('thumbnail_kind') &&
              names.has('sketch_generated_at') &&
              names.has('sketch_attempt_count') &&
              names.has('sketch_last_error')
            );
          },
          description:
            "4 sketch tracking columns (thumbnail_kind, sketch_generated_at, sketch_attempt_count, sketch_last_error) added by 0021. AC2's column list (sketch_image_storage_path / sketch_thumb_storage_path / sketch_prompt / sketch_meta) is from an earlier design that did not ship — verify against migration body.",
        },
        {
          name: '0021.thumbnail_kind_check',
          sql:
            'SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con ' +
            'JOIN pg_class rel ON rel.oid = con.conrelid ' +
            'JOIN pg_namespace ns ON ns.oid = rel.relnamespace ' +
            "WHERE ns.nspname = 'public' AND rel.relname = 'food_library_items' " +
            "  AND con.conname = 'food_library_items_thumbnail_kind_check';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.def === 'string' &&
            /'photo'/.test(rows[0].def) &&
            /'sketch'/.test(rows[0].def),
          description:
            "thumbnail_kind CHECK constraint accepts 'photo' / 'sketch' (added by 0021 line 102-107).",
        },
      ];

    case '0026':
      // 0026_bac_alcohol_tracking.sql:
      //   - tightens profiles.bio_sex CHECK to ('male','female') and rewrites
      //     handle_new_user so the inserted default is 'male'
      //   - creates public.alcohol_logs with the BAC ledger columns
      //   - creates alcohol_logs_user_consumed_at_idx on (user_id, consumed_at desc)
      return [
        {
          name: '0026.alcohol_logs_columns_present',
          sql:
            'SELECT column_name, data_type FROM information_schema.columns ' +
            "WHERE table_schema = 'public' AND table_name = 'alcohol_logs' " +
            "  AND column_name IN ('id','user_id','entry_id','volume_ml','abv_percent','alcohol_grams','consumed_at','created_at') " +
            'ORDER BY column_name;',
          predicate: (rows) => {
            if (!Array.isArray(rows)) return false;
            const names = new Set(rows.map((r) => r.column_name));
            return (
              names.has('id') &&
              names.has('user_id') &&
              names.has('entry_id') &&
              names.has('volume_ml') &&
              names.has('abv_percent') &&
              names.has('alcohol_grams') &&
              names.has('consumed_at') &&
              names.has('created_at')
            );
          },
          description:
            'public.alcohol_logs exists with BAC ledger columns id, user_id, entry_id, volume_ml, abv_percent, alcohol_grams, consumed_at, created_at.',
        },
        {
          name: '0026.alcohol_logs_user_consumed_at_idx',
          sql:
            'SELECT indexdef FROM pg_indexes ' +
            "WHERE schemaname = 'public' " +
            "  AND tablename = 'alcohol_logs' " +
            "  AND indexname = 'alcohol_logs_user_consumed_at_idx';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.indexdef === 'string' &&
            /user_id/i.test(rows[0].indexdef) &&
            /consumed_at\s+DESC/i.test(rows[0].indexdef),
          description:
            'index alcohol_logs_user_consumed_at_idx exists on public.alcohol_logs (user_id, consumed_at DESC).',
        },
        {
          name: '0026.profiles_bio_sex_check_excludes_other',
          sql:
            'SELECT pg_get_constraintdef(con.oid) AS def FROM pg_constraint con ' +
            'JOIN pg_class rel ON rel.oid = con.conrelid ' +
            'JOIN pg_namespace ns ON ns.oid = rel.relnamespace ' +
            "WHERE ns.nspname = 'public' AND rel.relname = 'profiles' " +
            "  AND con.conname = 'profiles_bio_sex_check';",
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 1 &&
            typeof rows[0]?.def === 'string' &&
            /'male'/.test(rows[0].def) &&
            /'female'/.test(rows[0].def) &&
            !/'other'/.test(rows[0].def),
          description:
            "profiles_bio_sex_check accepts 'male' / 'female' and no longer includes 'other'.",
        },
        {
          name: '0026.handle_new_user_defaults_bio_sex_male',
          sql:
            'SELECT 1 AS hit FROM pg_proc p ' +
            'JOIN pg_namespace n ON n.oid = p.pronamespace ' +
            "WHERE n.nspname = 'public' AND p.proname = 'handle_new_user' " +
            "  AND regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') ILIKE '%insert into public.profiles%' " +
            "  AND regexp_replace(pg_get_functiondef(p.oid), '\\s+', ' ', 'g') ILIKE '%values (new.id, ''male''%';",
          predicate: (rows) => Array.isArray(rows) && rows.length === 1,
          description: "handle_new_user inserts profiles.bio_sex default 'male' for new users.",
        },
      ];

    case '0027':
      // 0027_library_recipes.sql:
      //   - adds recipe eligibility metadata to food_library_items
      //   - creates food_library_recipes with owner-scoped RLS
      //   - extends AI call/cache call_type constraints with library-recipe
      return [
        {
          name: '0027.food_library_items_recipe_eligibility_columns',
          sql:
            'SELECT column_name, data_type FROM information_schema.columns ' +
            "WHERE table_schema = 'public' AND table_name = 'food_library_items' " +
            "  AND column_name IN ('recipe_eligibility','recipe_eligibility_reason','recipe_eligibility_checked_at') " +
            'ORDER BY column_name;',
          predicate: (rows) => {
            if (!Array.isArray(rows)) return false;
            const names = new Set(rows.map((r) => r.column_name));
            return (
              names.has('recipe_eligibility') &&
              names.has('recipe_eligibility_reason') &&
              names.has('recipe_eligibility_checked_at')
            );
          },
          description:
            'food_library_items has recipe_eligibility, recipe_eligibility_reason, and recipe_eligibility_checked_at columns.',
        },
        {
          name: '0027.food_library_recipes_table_present',
          sql:
            'SELECT column_name FROM information_schema.columns ' +
            "WHERE table_schema = 'public' AND table_name = 'food_library_recipes' " +
            "  AND column_name IN ('id','user_id','library_item_id','recipe','prompt_version','model','input_hash','created_at','updated_at') " +
            'ORDER BY column_name;',
          predicate: (rows) => {
            if (!Array.isArray(rows)) return false;
            const names = new Set(rows.map((r) => r.column_name));
            return (
              names.has('id') &&
              names.has('user_id') &&
              names.has('library_item_id') &&
              names.has('recipe') &&
              names.has('prompt_version') &&
              names.has('model') &&
              names.has('input_hash') &&
              names.has('created_at') &&
              names.has('updated_at')
            );
          },
          description:
            'food_library_recipes exists with persisted recipe payload and provenance columns.',
        },
        {
          name: '0027.food_library_recipes_rls_enabled',
          sql:
            'SELECT relrowsecurity AS rls_enabled FROM pg_class c ' +
            'JOIN pg_namespace n ON n.oid = c.relnamespace ' +
            "WHERE n.nspname = 'public' AND c.relname = 'food_library_recipes';",
          predicate: (rows) =>
            Array.isArray(rows) && rows.length === 1 && rows[0]?.rls_enabled === true,
          description: 'food_library_recipes has row-level security enabled.',
        },
        {
          name: '0027.ai_call_type_constraints_include_library_recipe',
          sql:
            'SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint ' +
            "WHERE conname IN ('ai_response_cache_call_type_check','ai_call_log_call_type_check') " +
            'ORDER BY conname;',
          predicate: (rows) =>
            Array.isArray(rows) &&
            rows.length === 2 &&
            rows.every((row) => typeof row?.def === 'string' && /library-recipe/.test(row.def)),
          description:
            "ai_response_cache and ai_call_log call_type CHECK constraints include 'library-recipe'.",
        },
      ];

    default:
      // Unknown migration — no verification (loop logs a warning).
      return [];
  }
}

/**
 * Parse the simple `KEY=VALUE` env-file format used by Planning/apikeys.txt
 * and Planning/devapikeys.txt. Strips quotes and ignores comments/blank lines.
 */
export function parseEnvFile(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']/, '').replace(/["'\r]$/, '');
  }
  return env;
}

/**
 * Parse argv for the script's recognized flags. Returns a plain object.
 * Unknown flags are ignored (forward-compat with future additions).
 */
export function parseFlags(argv) {
  const flags = {
    dryRun: true, // default
    apply: false,
    confirmDestructive: false,
    allowDev: false,
    verbose: false,
    migrationOverride: null, // null | string[]
    envFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') {
      flags.apply = true;
      flags.dryRun = false;
    } else if (a === '--dry-run') {
      flags.dryRun = true;
      flags.apply = false;
    } else if (a === '--confirm-destructive') {
      flags.confirmDestructive = true;
    } else if (a === '--allow-dev') {
      flags.allowDev = true;
    } else if (a === '--verbose') {
      flags.verbose = true;
    } else if (a === '--migrations') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.migrationOverride = next
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        i += 1;
      }
    } else if (a === '--env-file') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.envFile = next;
        i += 1;
      }
    }
  }
  return flags;
}

// =============================================================================
// I/O — Supabase Management API client
// =============================================================================

/**
 * Build a runQuery function bound to a specific project_ref + PAT.
 * Exported so tests can swap in a mock fetch.
 */
export function makeRunQuery({ projectRef, pat, fetchImpl = fetch, verbose = false }) {
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  return async function runQuery(sql, label) {
    if (verbose) {
      const oneLine = sql.replace(/\s+/g, ' ').trim().slice(0, 200);
      console.log(`  [SQL ${label}] ${oneLine}${sql.length > 200 ? '...' : ''}`);
    }
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pat}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`[${label}] HTTP ${res.status} — body: ${text.slice(0, 1500)}`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json };
  };
}

/**
 * Probe a single artifact ABOVE the tracker's claimed-highest version to
 * detect a partial tracker. Returns `{ disagreement, foundVersion }`.
 *
 * The probe list mirrors the artifact-detection fallback (intentionally —
 * we use the same well-known artifacts). When the tracker says
 * highest=`trackerHighest`, we probe artifacts for every known migration
 * version greater than `trackerHighest`. If any artifact responds positive,
 * a higher migration IS applied and the tracker is partial.
 *
 * Conservative on errors: if any probe throws, treat as no-disagreement
 * (the tracker is the best we have).
 */
async function trackerArtifactCrosscheck(runQuery, trackerHighestNum) {
  const probesAbove = [
    {
      version: '0027',
      versionNum: 27,
      sql: "SELECT 1 AS hit FROM information_schema.tables WHERE table_schema='public' AND table_name='food_library_recipes';",
    },
    {
      version: '0026',
      versionNum: 26,
      sql: "SELECT 1 AS hit FROM pg_indexes WHERE schemaname='public' AND tablename='alcohol_logs' AND indexname='alcohol_logs_user_consumed_at_idx';",
    },
    {
      version: '0021',
      versionNum: 21,
      sql: "SELECT 1 AS hit FROM information_schema.columns WHERE table_schema='public' AND table_name='food_library_items' AND column_name='thumbnail_kind';",
    },
    {
      version: '0020',
      versionNum: 20,
      sql: "SELECT 1 AS hit FROM pg_indexes WHERE schemaname='public' AND indexname='food_library_items_user_normalized_name_unique';",
    },
    {
      version: '0019',
      versionNum: 19,
      sql: "SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_water_with_cap' AND pg_get_functiondef(p.oid) ILIKE '%under_daily_limit%';",
    },
    {
      version: '0018',
      versionNum: 18,
      sql: "SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_water_with_cap';",
    },
    {
      version: '0017',
      versionNum: 17,
      sql: "SELECT 1 AS hit FROM information_schema.routine_privileges WHERE routine_name IN ('delete_user_data','set_account_deleting') LIMIT 1;",
    },
  ];

  // Walk top-down so the FIRST positive hit gives us the highest applied
  // version above the tracker's claim.
  for (const p of probesAbove) {
    if (p.versionNum <= trackerHighestNum) continue;
    try {
      const { json } = await runQuery(p.sql, `xcheck_${p.version}`);
      if (Array.isArray(json) && json.length === 1) {
        return { disagreement: true, foundVersion: p.version };
      }
    } catch {
      // Probe failed — be conservative.
    }
  }
  return { disagreement: false, foundVersion: null };
}

/**
 * Query `supabase_migrations.schema_migrations` (if present) and fall back to
 * artifact detection if the tracker is missing, empty, sparse, or
 * non-contiguous. Returns a Set of applied migration version strings (e.g.
 * '0001', '0017').
 *
 * E.1.9 Codex finding 2 — partial-tracker hazard. Management API applies do
 * not always populate the tracker (prod cutover 2026-05-16 found the tracker
 * returned only `0001` even though `0002..0017` were applied out-of-band).
 * Treating that as authoritative would compute `0002..0021` as pending and
 * replay old migrations. We now treat sparse/non-contiguous tracker results
 * as suspicious and fall through to artifact probes, which interrogate the
 * live schema directly.
 *
 * Tracker is trusted only when its versions form a contiguous run starting
 * at `0001` (e.g. `{0001..0017}` or `{0001..0021}`). Any gap or any starting
 * version other than 0001 triggers the artifact fallback.
 */
export async function detectAppliedMigrations(runQuery) {
  // Step 1 — try the tracker.
  try {
    const { json } = await runQuery(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;',
      'tracker',
    );
    if (Array.isArray(json) && json.length > 0) {
      const versions = new Set();
      for (const row of json) {
        if (typeof row?.version === 'string') {
          // Supabase tracker stores versions as either '0001' or
          // '20240101010101' style — extract the 4-digit prefix when
          // present so we match our local filenames.
          const m = row.version.match(/^(\d{4})/);
          if (m) versions.add(m[1]);
        }
      }
      if (versions.size > 0) {
        // E.1.9 Codex finding 2 — guard against sparse/non-contiguous tracker.
        // A trustworthy tracker MUST be contiguous from 0001 to its highest
        // entry. Any gap (e.g. {0001, 0003, 0004}) is a clear sparse-state
        // signal — reject the tracker outright.
        const sorted = [...versions].sort();
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const lastNum = parseInt(last, 10);
        const expectedSize = lastNum; // contiguous 0001..N → size N
        const isContiguous = first === '0001' && versions.size === expectedSize;
        if (isContiguous) {
          // Cross-check: probe a HIGHER artifact (the artifact above `lastNum`
          // in the canonical probe list). If the artifact says it's applied,
          // the tracker is partial — surface DISAGREEMENT instead of silently
          // falling through to artifact detection.
          //
          // E.1.9 Codex Round 2 finding 2 — silent artifact-fallback was the
          // hazard. A failed/partial 0021 (only `thumbnail_kind` column landed
          // but RPC / index were never applied) would yield artifact:0021 and
          // mark every prior migration applied, skipping verification of the
          // actual unapplied work. Now: return `disagreement` so main() halts
          // and forces the operator to pass --migrations explicitly with
          // manual reconciliation.
          const _trackerCheck = await trackerArtifactCrosscheck(runQuery, lastNum);
          if (_trackerCheck.disagreement) {
            return {
              applied: versions,
              source: 'disagreement',
              trackerHighest: last,
              artifactHighest: _trackerCheck.foundVersion,
            };
          } else {
            return { applied: versions, source: 'schema_migrations' };
          }
        } else {
          // Sparse / non-contiguous — log and fall through. (Original
          // detect-fallback semantics preserved here because a sparse
          // tracker with NO conflicting artifact is best handled by the
          // artifact-detection fallback below.)
          console.warn(
            `  [tracker SPARSE] schema_migrations returned ${versions.size} versions ` +
              `(first=${first}, last=${last}) — expected a contiguous run starting at ` +
              `0001 of size ${expectedSize}. Falling through to artifact detection. ` +
              `If artifact probes disagree, pass --migrations explicitly after manual ` +
              `reconciliation.`,
          );
        }
      }
    }
  } catch {
    // Tracker doesn't exist or query failed — fall through to artifact detection.
  }

  // Step 2 — fallback: artifact detection. Check the most-recent local
  // migration's known artifact. If 0021 columns are present, we treat
  // 0001..0021 as all applied; else we walk backwards.
  const checks = [
    {
      version: '0027',
      sql: "SELECT 1 AS hit FROM information_schema.tables WHERE table_schema='public' AND table_name='food_library_recipes';",
    },
    {
      version: '0026',
      sql: "SELECT 1 AS hit FROM pg_indexes WHERE schemaname='public' AND tablename='alcohol_logs' AND indexname='alcohol_logs_user_consumed_at_idx';",
    },
    {
      version: '0021',
      sql: "SELECT 1 AS hit FROM information_schema.columns WHERE table_schema='public' AND table_name='food_library_items' AND column_name='thumbnail_kind';",
    },
    {
      version: '0020',
      sql: "SELECT 1 AS hit FROM pg_indexes WHERE schemaname='public' AND indexname='food_library_items_user_normalized_name_unique';",
    },
    {
      version: '0019',
      sql: "SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_water_with_cap' AND pg_get_functiondef(p.oid) ILIKE '%under_daily_limit%';",
    },
    {
      version: '0018',
      sql: "SELECT 1 AS hit FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_water_with_cap';",
    },
    {
      version: '0017',
      sql: "SELECT 1 AS hit FROM information_schema.routine_privileges WHERE routine_name IN ('delete_user_data','set_account_deleting') LIMIT 1;",
    },
    {
      version: '0001',
      sql: "SELECT 1 AS hit FROM information_schema.tables WHERE table_schema='public' LIMIT 1;",
    },
  ];

  let highest = null;
  for (const c of checks) {
    try {
      const { json } = await runQuery(c.sql, `artifact_${c.version}`);
      if (Array.isArray(json) && json.length === 1) {
        highest = c.version;
        break;
      }
    } catch {
      // ignore; try the next probe
    }
  }

  if (highest === null) {
    return { applied: new Set(), source: 'artifact-empty' };
  }

  // Treat all migrations <= highest as applied.
  const applied = new Set();
  const highestNum = parseInt(highest, 10);
  for (let n = 1; n <= highestNum; n += 1) {
    applied.add(String(n).padStart(4, '0'));
  }
  return { applied, source: `artifact:${highest}` };
}

// =============================================================================
// Main — only executes when invoked directly (not in tests)
// =============================================================================

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('apply-prod-migrations-incremental.mjs') ||
    process.argv[1].endsWith('apply-prod-migrations-incremental'));

if (isMain) {
  await main(process.argv.slice(2));
}

export async function main(argv) {
  const flags = parseFlags(argv);
  const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
  const KEYS_FILE = resolve(process.cwd(), flags.envFile ?? 'Planning/apikeys.txt');

  // Layer 1 — load creds + prod-ref check.
  if (!existsSync(KEYS_FILE)) {
    console.error(`Missing credentials file: ${KEYS_FILE}`);
    process.exit(1);
  }
  const env = parseEnvFile(readFileSync(KEYS_FILE, 'utf8'));
  const PROJECT_REF = env.SUPABASE_PROJECT_REF;
  const PAT = env.SUPABASE_PAT;

  if (!PROJECT_REF || !PAT) {
    console.error(`Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in ${KEYS_FILE}`);
    process.exit(1);
  }

  console.log(`========================================================`);
  console.log(`  Incremental prod-migration cutover script`);
  console.log(`========================================================`);
  console.log(`Mode:         ${flags.apply ? 'APPLY (WRITES)' : 'dry-run (no writes)'}`);
  console.log(`Target ref:   ${PROJECT_REF}`);
  console.log(`Env file:     ${KEYS_FILE.replace(process.cwd(), '.')}`);
  console.log(`Verbose:      ${flags.verbose}`);
  if (flags.allowDev) console.log(`Allow-dev:    YES (dev project ref permitted, dry-run only)`);

  // Layer 1 — prod-ref check.
  if (PROJECT_REF !== EXPECTED_PROD_REF) {
    if (flags.allowDev && PROJECT_REF === KNOWN_DEV_REF && !flags.apply) {
      console.log(
        `\n[Layer 1 OK] --allow-dev: running dry-run against known dev ref ${KNOWN_DEV_REF}.`,
      );
    } else if (flags.allowDev && flags.apply) {
      console.error(
        `\n[Layer 1 REFUSE] --allow-dev forbids --apply. Dry-run only against non-prod refs.`,
      );
      process.exit(2);
    } else {
      console.error(
        `\n[Layer 1 REFUSE] SUPABASE_PROJECT_REF=${PROJECT_REF} != expected prod ref ${EXPECTED_PROD_REF}.`,
      );
      console.error(`Pass --allow-dev to run a dry-run against the dev ref (no writes).`);
      process.exit(2);
    }
  } else {
    console.log(`\n[Layer 1 OK] prod ref matches expected ${EXPECTED_PROD_REF}.`);
  }

  // Gather local migrations.
  const localFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (localFiles.length === 0) {
    console.error(`No migration files in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  console.log(
    `\nLocal migrations: ${localFiles.length} files (0001..${parseMigrationNumber(localFiles[localFiles.length - 1])}).`,
  );

  // Build runQuery + detect applied set.
  const runQuery = makeRunQuery({ projectRef: PROJECT_REF, pat: PAT, verbose: flags.verbose });

  console.log(`\nDetecting applied migrations on ${PROJECT_REF}...`);
  let appliedInfo;
  try {
    appliedInfo = await detectAppliedMigrations(runQuery);
  } catch (err) {
    console.error(`Failed to detect applied migrations: ${err.message}`);
    process.exit(1);
  }
  console.log(`  Source:  ${appliedInfo.source}`);
  console.log(`  Applied: ${[...appliedInfo.applied].sort().join(', ') || '(none)'}`);

  // E.1.9 Codex Round 2 finding 2 — halt on tracker/artifact disagreement.
  // The script will NOT silently fall back to artifact-rolled-up applied set
  // when the tracker says one thing and probes say another. Operator must
  // pass --migrations explicitly after reconciling manually.
  if (appliedInfo.source === 'disagreement') {
    console.error(
      `\n[Layer 2 HALT] Tracker / artifact disagreement detected.\n` +
        `  schema_migrations highest = ${appliedInfo.trackerHighest}\n` +
        `  artifact probe positive   = ${appliedInfo.artifactHighest}\n` +
        `\nThe Supabase tracker reports migration ${appliedInfo.trackerHighest} as the\n` +
        `latest applied migration, but artifact probes confirm that migration\n` +
        `${appliedInfo.artifactHighest} is ALSO already applied. This indicates the\n` +
        `tracker is partial (Management API applies do not always populate the\n` +
        `tracker) AND/OR the higher migration was partially applied.\n` +
        `\nRefusing to proceed automatically. Reconcile manually and re-run with\n` +
        `--migrations 0018,0019,...  to specify exactly which migrations to apply.`,
    );
    if (!flags.migrationOverride) {
      process.exit(2);
    }
    console.error(
      `[Layer 2] --migrations override accepted; proceeding with operator-supplied list.`,
    );
  }

  // Compute the delta (or honor --migrations override).
  let pending;
  if (flags.migrationOverride) {
    pending = localFiles.filter((f) => {
      const n = parseMigrationNumber(f);
      return n && flags.migrationOverride.includes(n);
    });
    console.log(`\nUsing explicit --migrations override: ${flags.migrationOverride.join(', ')}`);
  } else {
    pending = computeMigrationDelta(localFiles, appliedInfo.applied);
  }

  if (pending.length === 0) {
    console.log(`\nNothing to apply. Exiting cleanly.`);
    process.exit(0);
  }

  console.log(`\nPending migrations (${pending.length}):`);
  for (const f of pending) console.log(`  - ${f}`);

  // Layer 3 — destructive DDL pre-flight.
  console.log(`\nDestructive-DDL pre-flight:`);
  const allDestructive = [];
  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    const findings = detectDestructiveDDL(sql);
    if (findings.length === 0) {
      console.log(`  - ${f}: clean (no destructive DDL).`);
    } else {
      console.log(`  - ${f}: ${findings.length} finding(s):`);
      for (const op of findings) console.log(`      * ${op}`);
      allDestructive.push({ file: f, findings });
    }
  }
  if (allDestructive.length > 0 && !flags.confirmDestructive) {
    console.error(
      `\n[Layer 3 REFUSE] Destructive DDL detected. Pass --confirm-destructive to proceed.`,
    );
    process.exit(2);
  } else if (allDestructive.length === 0) {
    console.log(`  All pending migrations are non-destructive.`);
  } else {
    console.log(`\n  --confirm-destructive set — proceeding despite findings above.`);
  }

  // Render the plan (always, regardless of dry-run / apply).
  console.log(`\n--- Plan ---`);
  for (const f of pending) {
    const num = parseMigrationNumber(f);
    const checks = buildVerificationQuery(num);
    console.log(`\n  ${f}`);
    console.log(`    Verification queries:`);
    if (checks.length === 0) {
      console.log(`      (none — unknown migration number; manual inspection required)`);
    }
    for (const c of checks) {
      console.log(`      * ${c.name}: ${c.description}`);
    }
  }
  console.log(`\n--- end Plan ---`);

  if (flags.dryRun) {
    console.log(`\n[Layer 2] Dry-run mode — exiting before any writes. Pass --apply to execute.`);
    process.exit(0);
  }

  // Apply loop.
  console.log(`\nApplying ${pending.length} migration(s):`);
  let applied = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const f = pending[i];
    const num = parseMigrationNumber(f);
    const label = `[${i + 1}/${pending.length}] ${f}`;
    const t0 = Date.now();
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    process.stdout.write(`${label} ... `);
    try {
      const { status } = await runQuery(sql, f);
      const elapsed = Date.now() - t0;
      console.log(`applied (HTTP ${status}, ${elapsed}ms)`);
      applied += 1;
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.log(`FAILED (${elapsed}ms)`);
      console.error(`  Error: ${err.message}`);
      console.error(`\nStopped after ${applied}/${pending.length} migration(s).`);
      console.error(`Failure at: ${f}`);
      process.exit(3);
    }

    // Layer 4 — per-migration verification.
    const checks = buildVerificationQuery(num);
    if (checks.length === 0) {
      console.log(`    (no verification queries for ${num})`);
    } else {
      console.log(`    Verifying ${checks.length} predicate(s):`);
      for (const c of checks) {
        try {
          const { json } = await runQuery(c.sql, c.name);
          if (c.predicate(json)) {
            console.log(`      PASS ${c.name}`);
          } else {
            console.log(`      FAIL ${c.name}`);
            console.error(`        Description: ${c.description}`);
            console.error(`        Rows: ${JSON.stringify(json).slice(0, 500)}`);
            process.exit(4);
          }
        } catch (err) {
          console.log(`      FAIL ${c.name} (query error)`);
          console.error(`        Error: ${err.message}`);
          process.exit(4);
        }
      }
    }

    // Codex E.CODEX Round 1 (A-H2) — record the applied version in
    // supabase_migrations.schema_migrations. The Management API path
    // does not always populate the tracker (this script's own header
    // documents that hazard at lines 12-15 + the partial-tracker logic
    // in detectAppliedMigrations). When the tracker is stale, later
    // runs fall back to lossy artifact detection and risk re-applying
    // an already-applied migration.
    //
    // Idempotent: ON CONFLICT (version) DO NOTHING. If the table is
    // missing or the schema is locked down, swallow the error and warn
    // — verification has already passed by this point, so the apply is
    // sound; this writeback is a tracker-correctness defense, not the
    // authority. Verification was the authoritative gate, not the
    // tracker write.
    if (num) {
      try {
        await runQuery(
          `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${num}') ON CONFLICT (version) DO NOTHING;`,
          `tracker_writeback_${num}`,
        );
        console.log(`    (tracker writeback OK for ${num})`);
      } catch (err) {
        console.warn(
          `    (tracker writeback FAILED for ${num}: ${err.message.slice(0, 200)}) — apply is sound, tracker may now lag`,
        );
      }
    }
  }

  console.log(`\nAll ${applied}/${pending.length} migrations applied + verified.`);

  // Orphan-profile backfill (preserved from original script).
  console.log(`\nOrphan-profile backfill check:`);
  try {
    const { json: orphans } = await runQuery(
      'SELECT u.id FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;',
      'orphan_check',
    );
    if (Array.isArray(orphans) && orphans.length > 0) {
      console.log(`  Found ${orphans.length} orphan(s). Backfilling...`);
      await runQuery(
        'INSERT INTO public.profiles (id, onboarding_completed_at) SELECT id, NULL FROM auth.users WHERE id NOT IN (SELECT id FROM public.profiles);',
        'orphan_backfill',
      );
      const { json: recheck } = await runQuery(
        'SELECT count(*)::int AS n FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;',
        'orphan_recheck',
      );
      const remaining = recheck?.[0]?.n ?? null;
      if (remaining === 0) {
        console.log(`  Backfill OK — 0 orphans remaining.`);
      } else {
        console.error(`  Backfill INCOMPLETE — ${remaining} remaining.`);
        process.exit(4);
      }
    } else {
      console.log(`  No orphan auth users.`);
    }
  } catch (err) {
    console.error(`  Backfill check failed: ${err.message}`);
    process.exit(4);
  }

  // R1 firewall check (preserved).
  console.log(`\nR1 firewall check (cascade RPC grants):`);
  try {
    const { json: grants } = await runQuery(
      "SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name IN ('delete_user_data','set_account_deleting') AND privilege_type='EXECUTE';",
      'r1_firewall',
    );
    const badGrantees = new Set(['authenticated', 'anon', 'public', 'PUBLIC']);
    const bad = (Array.isArray(grants) ? grants : []).filter((g) => badGrantees.has(g.grantee));
    if (bad.length > 0) {
      console.error(`  FAIL — bad grants:`, bad);
      process.exit(5);
    }
    console.log(`  OK — no public/anon/authenticated EXECUTE on cascade RPCs.`);
  } catch (err) {
    console.error(`  R1 firewall check failed: ${err.message}`);
    process.exit(5);
  }

  console.log(`\nDone. Prod schema delta applied + verified.`);
  process.exit(0);
}
