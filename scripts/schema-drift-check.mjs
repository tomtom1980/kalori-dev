#!/usr/bin/env node
/**
 * US-STAB-D4 — Schema-drift CI guard scanner.
 *
 * Purpose: catch mock fixtures and application code that reference Supabase
 * columns which no longer exist in the live schema. The schema-of-record is
 * `lib/database.types.ts` (regenerated from `kalori-dev` via
 * `supabase gen types typescript`).
 *
 * Scope (per Planning/features/2026-05-01-mvp-stabilization/design-doc.md §11 O-1):
 *   - Annotation only. NO auto-fix, NO mock generation.
 *   - Stage 1 (`--mode report-only`, default): emit `::warning::` annotations
 *     to stdout in GitHub Actions format, exit 0.
 *   - Stage 2 (`--mode block`, flipped 1 day after Stage 1 reports clean):
 *     emit `::error::` annotations, exit 1 on any finding.
 *
 * Detection approach:
 *   Regex-scan all files under `tests/**`, `lib/**` (excluding `lib/auth/**`
 *   per R1 firewall), and `app/api/**` for Supabase client builder shapes:
 *     - `.from('<table>').select('<col1, col2, ...>')`
 *     - `.from('<table>').insert({ col1: ..., col2: ... })`
 *     - `.from('<table>').update({ col1: ... })`
 *     - `.from('<table>').upsert({ col1: ... })`
 *   For each reference, compare the literal column names against the
 *   columns declared for that table in `lib/database.types.ts`. Drift =
 *   reference column missing from the types file's `Row | Insert | Update`
 *   union for that table.
 *
 * CLI:
 *   node scripts/schema-drift-check.mjs --mode report-only|block
 *                                       [--paths <dir>[ <dir> ...]]
 *                                       [--types-file lib/database.types.ts]
 *
 * Exit codes:
 *   0 — no findings (Stage 1 always; Stage 2 only when clean)
 *   1 — drift detected AND mode=block
 *   2 — invocation error (missing types file, unparseable types, etc.)
 *
 * Programmatic API (consumed by tests):
 *   - `runScan({ repoRoot, includeRoots, typesFile, mode })`
 *       returns { references, findings, exitCode }
 *   - `isTypesFileFresh({ typesFile, migrationsDir, simulatedNewestMigration })`
 *       returns { fresh, newestMigration, markerMigration }
 *   - `parseSchemaFromTypes(typesFileContent)`
 *       returns Map<tableName, Set<columnName>>
 *   - `extractReferencesFromFile(absPath, repoRoot)`
 *       returns Array<{ file, line, table, columns, kind }>
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// --- CLI helpers ------------------------------------------------------------

const DEFAULT_INCLUDE_ROOTS = ['tests', 'lib', 'app/api'];

// EXCLUDE_PREFIXES skips paths during the recursive walk + drift check.
//   - `lib/auth/` — R1 firewall (read-only; never edit, also never flag).
//     Per task briefing the scanner MAY scan it OR exclude it; we EXCLUDE
//     to avoid false positives on auth-fence files that query
//     auth.users / public.profiles only.
//   - `tests/integration/schema-drift/check-fixtures-and-app-code.test.ts`
//     — the test itself embeds a literal `bogus_drift_column` reference
//     in its `writeFileSync` payload string. The scanner's regex parser
//     correctly spots that literal but the finding would be a false
//     positive against the scanner's OWN test harness. The
//     `__fixtures__/` subdirectory IS scanned (that's where seeded drift
//     fixtures land — by design).
const EXCLUDE_PREFIXES = [
  'lib/auth/',
  'tests/integration/schema-drift/check-fixtures-and-app-code.test.ts',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function parseArgs(argv) {
  const args = { mode: 'report-only', paths: null, typesFile: 'lib/database.types.ts' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') {
      args.mode = argv[++i];
    } else if (arg === '--paths') {
      // Consume all subsequent non-flag tokens
      const collected = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        collected.push(argv[++i]);
      }
      args.paths = collected;
    } else if (arg === '--types-file') {
      args.typesFile = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.mode !== 'report-only' && args.mode !== 'block') {
    throw new Error(`--mode must be 'report-only' or 'block', got '${args.mode}'`);
  }
  return args;
}

// --- Schema source (lib/database.types.ts) ----------------------------------

/**
 * Parse the Supabase-generated `lib/database.types.ts` content into a map of
 * `tableName -> Set<columnName>`. The generated file shape is:
 *
 *   public: {
 *     Tables: {
 *       food_entries: {
 *         Row: { id: string; user_id: string; ... }
 *         Insert: { id?: string; user_id: string; ... }
 *         Update: { ... }
 *       },
 *       ...
 *     }
 *   }
 *
 * We treat the union of `Row | Insert | Update` columns as the table's
 * column universe (drift = column NOT in this union).
 *
 * Robustness note: this is a structural parse, not a TypeScript AST parse.
 * The generated file format is stable across `supabase gen types` versions,
 * so a brace-aware scan is sufficient and avoids dragging the TS compiler
 * into a lightweight CI guard. The parser tolerates nested types (`Json |
 * Json[]`), optional markers (`field?:`), and quoted keys.
 */
export function parseSchemaFromTypes(content) {
  const schema = new Map();

  // Locate the `public: { Tables: { ... } }` block.
  const publicIdx = content.indexOf('public:');
  if (publicIdx === -1) return schema;
  const tablesIdx = content.indexOf('Tables:', publicIdx);
  if (tablesIdx === -1) return schema;

  // Find the opening `{` after `Tables:` and the matching closing `}`.
  let i = content.indexOf('{', tablesIdx);
  if (i === -1) return schema;
  const tablesBlockStart = i + 1;
  let depth = 1;
  i++;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  const tablesBlockEnd = i; // index of the closing `}`
  const tablesBlock = content.slice(tablesBlockStart, tablesBlockEnd);

  // Walk through top-level table entries. Each entry has the shape
  // `<table_name>: { Row: { ... }, Insert: { ... }, Update: { ... }, Relationships: [...] }`
  let pos = 0;
  while (pos < tablesBlock.length) {
    // Skip whitespace + commas + semicolons. The supabase-generated types
    // file separates table entries with `;` (TypeScript declaration
    // terminators) rather than `,`. Without the `;` skip, the parser stops
    // after the FIRST table — schema would contain only `ai_call_log`,
    // every other table would surface as `unknown-table` drift.
    while (pos < tablesBlock.length && /[\s,;]/.test(tablesBlock[pos])) pos++;
    if (pos >= tablesBlock.length) break;

    // Read identifier (table name)
    const nameMatch = tablesBlock.slice(pos).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/);
    if (!nameMatch) {
      // Skip to next `:` if we hit something unexpected (defensive)
      pos = tablesBlock.indexOf(':', pos);
      if (pos === -1) break;
      pos++;
      continue;
    }
    const tableName = nameMatch[1];
    const blockStart = pos + nameMatch[0].length;

    // Find the matching `}` for this table's value object
    let d = 1;
    let j = blockStart;
    while (j < tablesBlock.length && d > 0) {
      const ch = tablesBlock[j];
      if (ch === '{') d++;
      else if (ch === '}') d--;
      if (d === 0) break;
      j++;
    }
    const tableBlock = tablesBlock.slice(blockStart, j);
    pos = j + 1;

    // Extract column names from Row / Insert / Update sub-blocks
    const columns = new Set();
    for (const section of ['Row', 'Insert', 'Update']) {
      const sectionIdx = tableBlock.indexOf(`${section}:`);
      if (sectionIdx === -1) continue;
      const sectionStart = tableBlock.indexOf('{', sectionIdx);
      if (sectionStart === -1) continue;
      let sd = 1;
      let k = sectionStart + 1;
      while (k < tableBlock.length && sd > 0) {
        const ch = tableBlock[k];
        if (ch === '{') sd++;
        else if (ch === '}') sd--;
        if (sd === 0) break;
        k++;
      }
      const sectionBody = tableBlock.slice(sectionStart + 1, k);
      // Match top-level keys only: `name:` or `"name":` at depth 0 within
      // sectionBody. We rescan with depth tracking.
      let bd = 0;
      let m = 0;
      while (m < sectionBody.length) {
        const ch = sectionBody[m];
        if (ch === '{' || ch === '[' || ch === '(') bd++;
        else if (ch === '}' || ch === ']' || ch === ')') bd--;
        else if (bd === 0) {
          const keyMatch = sectionBody
            .slice(m)
            .match(/^\s*(?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))\s*\??\s*:/);
          if (keyMatch) {
            const key = keyMatch[1] || keyMatch[2];
            columns.add(key);
            m += keyMatch[0].length;
            continue;
          }
        }
        m++;
      }
    }

    if (columns.size > 0) {
      schema.set(tableName, columns);
    }
  }

  return schema;
}

// --- Reference extraction ---------------------------------------------------

/**
 * Scan one file for Supabase client builder shapes and return the list of
 * `(table, columns)` references. Each reference carries file/line for the
 * O-1 annotation locator.
 *
 * Supported shapes:
 *   - `.from('<table>').select('<col1, col2, ...>')` and `.select(\`...\`)`
 *   - `.from('<table>').insert({ <col>: ... })`
 *   - `.from('<table>').update({ <col>: ... })`
 *   - `.from('<table>').upsert({ <col>: ... })`
 *
 * Out of scope (intentionally NOT detected — see briefing scope cap):
 *   - Dynamic table/column names (`from(table)` where `table` is a variable)
 *   - Computed column lists assembled at runtime
 *   - Server-side function calls (`supabase.rpc(...)`) — those don't expose
 *     column literals at the call site.
 */
export function extractReferencesFromFile(absPath, repoRoot) {
  const text = readFileSync(absPath, 'utf8');
  const relFile = path.relative(repoRoot, absPath).replace(/\\/g, '/');
  const references = [];

  // Build a line index for offset -> line conversion
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  const offsetToLine = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    return hi + 1; // 1-indexed line number
  };

  // Match `.from('<name>')` (also tolerates double quotes and backticks)
  // followed by ANY chain (whitespace, comments, newlines) until the next
  // `.select | .insert | .update | .upsert` token at the same call site.
  //
  // Codex Round 1 Finding #1 fix: the discovery pass MUST skip string
  // literals (`'...'`, `"..."`, `` `...` ``) AND comments (`//`, `/* */`).
  // Without lexer awareness the scanner picks up `.from('fake_table')`
  // appearing inside SQL snippets, fixture payloads, or docstrings and
  // emits false-positive findings. The schema-drift test files themselves
  // contain such literals on purpose — Stage 2 (block mode) would then fail
  // legitimate PRs on the scanner's own test fixtures. We delegate to the
  // shared lexer walker (matchesFromAt) which mirrors the comment/string
  // state machine used by `findBuilderAtChainDepth` and `matchClosing`.
  for (const m of iterateFromCalls(text)) {
    const table = m.table;
    const fromEnd = m.endIndex;

    // Look forward up to 1500 chars for a `.<verb>(...)` call that is a
    // DIRECT method continuation of `.from('<table>')`. Supabase chains
    // can include `.eq(...)`, `.in(...)`, `.match(...)`, etc., which we
    // IGNORE — we only care about column-literal builders at the same
    // fluent-chain depth.
    //
    // Critical chain-attribution rules:
    //   (a) Cut the lookahead window at the NEXT chain-depth-0 `.from(...)`
    //       call so we don't attribute a `.select(...)` from a different
    //       query chain to this table. The cutoff MUST be lexer-aware —
    //       `.from(` inside a string or a comment must NOT serve as a
    //       boundary. We delegate the cap to findBuilderAtChainDepth which
    //       already tracks string/comment/depth state.
    //   (b) Only accept builder calls at the SAME parenthesis depth as the
    //       `.from(...)` site itself (depth 0 in the lookahead text). A
    //       nested call such as `.eq('id', helper.select('bogus')).select('id')`
    //       must NOT misattribute `helper.select('bogus')` to this table —
    //       it lives inside the `.eq(...)` argument and is a different
    //       expression entirely. We walk the lookahead with paren-depth
    //       tracking and only emit references for hits at depth 0.
    const lookaheadEnd = fromEnd + 1500;
    const lookahead = text.slice(fromEnd, lookaheadEnd);
    const builderMatch = findBuilderAtChainDepth(lookahead);
    if (builderMatch) {
      const { verb, dotOffsetInLookahead } = builderMatch;
      const openOffset = fromEnd + dotOffsetInLookahead + verb.length + 1; // index of '('
      const closeOffset = matchClosing(text, openOffset, '(', ')');
      if (closeOffset === -1) {
        continue;
      }
      const inner = text.slice(openOffset + 1, closeOffset);
      const callLine = offsetToLine(openOffset);

      let columns = [];
      if (verb === 'select') {
        // .select('col1, col2, ...') — literal string only. Skip wildcard
        // ('*'), template-literal interpolations (contain `${`), and
        // computed expressions.
        const stringMatch = inner.match(/^\s*(['"`])([^\\$`'"]*)\1\s*$/);
        if (stringMatch) {
          const raw = stringMatch[2].trim();
          if (raw && raw !== '*') {
            columns = parseColumnList(raw);
          }
        }
        // Multi-arg select (e.g. `select('col', { count: 'exact' })`) —
        // first arg is the column list; reuse same parsing but only on
        // the first comma-separated argument's string literal.
        if (columns.length === 0) {
          const firstArg = inner.match(/^\s*(['"`])([^\\$`'"]*)\1/);
          if (firstArg) {
            const raw = firstArg[2].trim();
            if (raw && raw !== '*') {
              columns = parseColumnList(raw);
            }
          }
        }
      } else {
        // .insert / .update / .upsert — payload object literal at root of
        // the call expression. Accept `({ k: v, ... })`, `([{ ... }, ...])`,
        // and `({ ... }, { ... options })`. For arrays we take the FIRST
        // object literal element. For multi-arg insert/upsert with options
        // (second arg `{ onConflict: ... }`), we still take the first arg's
        // object keys.
        //
        // Opaque-payload case: `.insert(payload)` / `.update(patch)` where
        // the first argument is a bare identifier. We CANNOT extract column
        // names without inlining the binding. We surface this as a structured
        // reference with `unsupported: 'identifier-payload'` so:
        //   (a) Stage 2 callers can decide to flag opaque payloads (default
        //       false — drift detection treats them as "no columns to
        //       validate"). This avoids breaking Stage 2 on every existing
        //       call site (currently many — app/api/entries/save/route.ts,
        //       app/api/library/[id]/log-now/route.ts, etc.).
        //   (b) Downstream tooling can grep for opaque payloads as a
        //       separate audit target without re-walking the AST.
        const firstObj = extractFirstObjectLiteral(inner);
        if (firstObj) {
          columns = extractObjectKeys(firstObj);
        } else if (isIdentifierPayload(inner)) {
          // No column literals extractable — record an opaque reference.
          references.push({
            file: relFile,
            line: callLine,
            column: dotOffsetInLookahead + 2,
            table,
            columns: [],
            kind: verb,
            unsupported: 'identifier-payload',
          });
          // Continue to outer `.from()` iteration — only ONE builder per
          // .from(...) chain is recorded (subsequent chains either refine
          // the same query or hit a nested .from for a different table
          // caught by the outer loop).
          continue;
        }
      }

      if (columns.length > 0) {
        references.push({
          file: relFile,
          line: callLine,
          column: dotOffsetInLookahead + 2, // best-effort 1-indexed column on that line
          table,
          columns,
          kind: verb,
        });
      }
    }
  }

  return references;
}

/**
 * Yield every `.from('<table>')` call that appears as LIVE CODE in `text`
 * (i.e. outside string literals and outside `//` / `/* * /` comments).
 *
 * Each yielded record carries:
 *   - `table`     — the literal table name (between the quotes)
 *   - `index`     — offset of the `.` in `.from(`
 *   - `endIndex`  — offset immediately after the matching `)` of `.from(...)`
 *
 * Strict literal-only matching: dynamic `from(table)` (variable arg),
 * template-literal interpolations, and `.from('` inside multi-line strings
 * are all excluded. The lexer matches whichever of the three quote styles
 * (`'`, `"`, `` ` ``) opens the table name, then the matching close-quote.
 */
function* iterateFromCalls(text) {
  const VERB = '.from';
  let i = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }

    // Try `.from(<quote><name><quote>)` here. The opening `.` MUST be live
    // code, which the surrounding loop guarantees.
    if (ch === '.' && text.slice(i, i + VERB.length) === VERB) {
      // Match optional whitespace, then `(`, then a quote, identifier,
      // matching quote, optional whitespace, then `)`.
      let j = i + VERB.length;
      // Optional whitespace before `(`
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] !== '(') {
        i++;
        continue;
      }
      j++;
      // Optional whitespace inside `(`
      while (j < text.length && /\s/.test(text[j])) j++;
      const quote = text[j];
      if (quote !== "'" && quote !== '"' && quote !== '`') {
        // Not a string literal (likely dynamic `.from(table)`).
        i++;
        continue;
      }
      const nameStart = j + 1;
      const nameMatch = text.slice(nameStart).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (!nameMatch) {
        i++;
        continue;
      }
      const name = nameMatch[1];
      let k = nameStart + name.length;
      if (text[k] !== quote) {
        i++;
        continue;
      }
      k++;
      // Optional whitespace before `)`
      while (k < text.length && /\s/.test(text[k])) k++;
      if (text[k] !== ')') {
        i++;
        continue;
      }
      k++;
      yield { table: name, index: i, endIndex: k };
      // Continue scanning AFTER the matched `.from(...)` call so we never
      // re-visit characters we've already attributed to this call. This
      // also prevents pathological re-entry when the same offset would
      // otherwise be reconsidered.
      i = k;
      continue;
    }

    i++;
  }
}

/**
 * Walk `lookahead` (text that begins immediately after `.from('table')`)
 * looking for the FIRST `.select | .insert | .update | .upsert` token that
 * sits at fluent-chain depth — i.e. at the same parenthesis depth as the
 * surrounding chain. Anything inside balanced parens (a method argument,
 * a callback, a nested call expression) is IGNORED. The walker STOPS at
 * a chain-depth `.from(` call so the next query chain isn't conflated
 * with the current one.
 *
 * Returns `{ verb, dotOffsetInLookahead }` for the matching `.<verb>(`, or
 * `null` when no chain-level builder is found. The returned offset points
 * to the `.` of the matched method call.
 *
 * String literals + comments are tracked so a `.select(` or `.from(`
 * appearing inside a string or comment never produces a false attribution
 * (and never serves as a chain boundary).
 */
function findBuilderAtChainDepth(lookahead) {
  const verbs = ['select', 'insert', 'update', 'upsert'];
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;
  while (i < lookahead.length) {
    const ch = lookahead[i];
    const next = lookahead[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && ch === '.') {
      // Chain boundary: a NEW `.from(` at chain depth means we left the
      // current query — stop scanning. The outer loop will pick up the
      // new .from(...) call on its own iteration.
      if (lookahead.slice(i + 1, i + 5) === 'from' && /^[\s]*\(/.test(lookahead.slice(i + 5))) {
        return null;
      }
      // Try to match `.<verb>(` at this position.
      for (const verb of verbs) {
        if (
          lookahead.slice(i + 1, i + 1 + verb.length) === verb &&
          // Boundary: next char after verb name is `(` or whitespace then `(`
          /^[\s]*\(/.test(lookahead.slice(i + 1 + verb.length))
        ) {
          return { verb, dotOffsetInLookahead: i };
        }
      }
    }
    i++;
  }
  return null;
}

function matchClosing(text, openIdx, openCh, closeCh) {
  let d = 1;
  let i = openIdx + 1;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < text.length) {
    const ch = text[i];
    const prev = text[i - 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '/' && prev === '*') inBlockComment = false;
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === openCh) d++;
    else if (ch === closeCh) {
      d--;
      if (d === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Parse a Supabase `.select(...)` column list into the set of column names
 * that belong to the CURRENT table.
 *
 * Handles the PostgREST select syntax used by supabase-js:
 *   - Plain columns: `id, display_name`
 *   - JSON paths: `nutrition->kcal`, `nutrition->>kcal` -> `nutrition`
 *   - Aliases: `display:display_name` -> `display_name` (the underlying
 *     column is on the LEFT of the colon in PostgREST: `alias:column`;
 *     supabase-js reads the column AFTER the colon. See
 *     https://supabase.com/docs/reference/javascript/select#renaming-columns)
 *   - Joined relationships: `food_library_items(display_name)`,
 *     `food_library_items!inner(*)`, `tag:tags(name)` — the entire token
 *     names a FOREIGN relationship; columns inside the parens belong to
 *     the foreign table. The scanner intentionally does NOT validate
 *     joined-table columns at this depth (out-of-scope per O-1) AND must
 *     not flag the relationship name itself.
 *
 * Returns only column identifiers on the current table. Tokens recognised
 * as relationship projections are dropped entirely.
 */
function parseColumnList(raw) {
  const cols = [];

  // Split top-level comma-separated tokens while ignoring commas inside
  // nested parens (the inner column lists of foreign-table projections).
  const tokens = [];
  let depth = 0;
  let acc = '';
  for (const ch of raw) {
    if (ch === '(') {
      depth++;
      acc += ch;
    } else if (ch === ')') {
      if (depth > 0) depth--;
      acc += ch;
    } else if (ch === ',' && depth === 0) {
      if (acc.trim()) tokens.push(acc.trim());
      acc = '';
    } else {
      acc += ch;
    }
  }
  if (acc.trim()) tokens.push(acc.trim());

  for (const token of tokens) {
    // Drop trailing modifier hints (`!inner`, `!left`, `::cast`, etc.) AT
    // the relationship level — for non-relationship tokens these don't
    // appear, but the regex below ignores them anyway.

    // Detect relationship projection: contains `(` at top level
    // (e.g. `food_library_items(name)`, `tag:tags(*)`,
    // `food_library_items!inner(display_name)`).
    if (/\(/.test(token)) {
      // Entire token names a foreign relationship — skip.
      continue;
    }

    // STEP 1: strip Postgres `::cast` suffix BEFORE alias parsing. PostgREST
    // accepts both `column::cast` and `alias:column::cast`, but our alias
    // splitter needs to see only single colons. `removed_col::text` parsed
    // as alias would produce `:text` -> empty identifier, silently
    // dropping the validation.
    let identifierPart = token;
    {
      const castIdx = identifierPart.indexOf('::');
      if (castIdx >= 0) {
        identifierPart = identifierPart.slice(0, castIdx);
      }
    }

    // STEP 2: alias parsing — PostgREST `alias:column` renames the response
    // key to `alias` but the underlying CURRENT-TABLE column is `column`.
    // So we keep what's AFTER the first single-colon delimiter (after `::`
    // casts have already been removed).
    if (identifierPart.includes(':')) {
      const afterColon = identifierPart.split(':').slice(1).join(':').trim();
      if (afterColon) identifierPart = afterColon;
    }

    // STEP 3: drop JSON path: `nutrition->kcal` / `nutrition->>kcal` -> `nutrition`
    identifierPart = identifierPart.split('->')[0].trim();

    // STEP 4: drop any remaining trailing modifiers (sort hints, spaces).
    identifierPart = identifierPart.replace(/[^A-Za-z0-9_].*$/, '');

    if (identifierPart && /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifierPart)) {
      cols.push(identifierPart);
    }
  }
  return cols;
}

/**
 * Detect whether the inner text of a `.insert(...)` / `.update(...)` /
 * `.upsert(...)` call is a bare identifier (e.g. `insertPayload`, `patch`,
 * `row`) — i.e. a variable reference whose object shape cannot be inspected
 * without inlining the binding. Returns true for opaque payloads, false
 * for inline object literals or array literals.
 */
function isIdentifierPayload(inner) {
  // Trim whitespace/comments at start. Accept an identifier optionally
  // followed by `,` (multi-arg insert with options), `)` (closing the call),
  // or end-of-string. Reject identifiers followed by `.` (member access —
  // would imply something other than a payload) or `(` (function call).
  const trimmed = inner.replace(/^\s+|\s+$/g, '');
  const idMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(,|$)/);
  return !!idMatch;
}

function extractFirstObjectLiteral(inner) {
  // Skip leading whitespace + optional `[` for array payloads
  let i = 0;
  while (i < inner.length && /\s/.test(inner[i])) i++;
  if (inner[i] === '[') {
    i++;
    while (i < inner.length && /\s/.test(inner[i])) i++;
  }
  if (inner[i] !== '{') return null;
  const closeIdx = matchClosing(inner, i, '{', '}');
  if (closeIdx === -1) return null;
  return inner.slice(i + 1, closeIdx);
}

function extractObjectKeys(body) {
  const keys = [];
  let depth = 0;
  let pos = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  // We walk the body, and at depth==0 right after a `,` or at start-of-body,
  // we capture an identifier/string key followed by `:`.
  let atKeyPosition = true;
  while (pos < body.length) {
    const ch = body[pos];
    const next = body[pos + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      pos++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '/' && body[pos - 1] === '*') inBlockComment = false;
      pos++;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === inString) inString = null;
      pos++;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      pos += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      pos += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      pos++;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
      pos++;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      pos++;
      continue;
    }
    if (ch === ',' && depth === 0) {
      atKeyPosition = true;
      pos++;
      continue;
    }
    if (depth === 0 && atKeyPosition && !/\s/.test(ch)) {
      // Try matching a key
      const keyMatch = body
        .slice(pos)
        .match(/^(?:["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]|([A-Za-z_][A-Za-z0-9_]*))\s*:/);
      if (keyMatch) {
        const key = keyMatch[1] || keyMatch[2];
        // Skip spread (`...rest`) — won't match the regex anyway.
        // Skip computed keys (`[foo]:`) — won't match the regex either.
        keys.push(key);
        pos += keyMatch[0].length;
        atKeyPosition = false;
        continue;
      }
    }
    pos++;
  }
  return keys;
}

// --- File walker ------------------------------------------------------------

function walk(absRoot, repoRoot, results = []) {
  if (!existsSync(absRoot)) return results;
  const stat = statSync(absRoot);
  if (stat.isFile()) {
    const ext = path.extname(absRoot);
    if (SOURCE_EXTENSIONS.has(ext)) {
      const rel = path.relative(repoRoot, absRoot).replace(/\\/g, '/');
      if (!EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) {
        results.push(absRoot);
      }
    }
    return results;
  }
  // Directory
  const entries = readdirSync(absRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    if (entry.name.startsWith('.')) continue;
    walk(path.join(absRoot, entry.name), repoRoot, results);
  }
  return results;
}

// --- Drift detection --------------------------------------------------------

const ALLOWED_PSEUDO_COLUMNS = new Set([
  // Supabase select metadata
  'count',
  // Postgres conflict resolution payload key (insert options object) — not a
  // table column. We don't see it here because we only inspect the FIRST
  // argument to insert/upsert, but defensive anyway.
  'returning',
  'onConflict',
  'ignoreDuplicates',
]);

// Tables whose schemas live outside `public.*` but which Supabase code
// still references via the bare `.from('<name>')` form. These bypass the
// missing-table drift check because their column shape isn't carried in
// the generated types under `public.Tables`. Add a table here only when
// it's intentionally outside scope (e.g. an `auth.*` table when used via
// admin client). Anything else MUST be flagged.
const NON_PUBLIC_TABLE_ALLOWLIST = new Set([
  // Currently empty — every table the app touches lives under `public.*`.
  // If a future task adds `.from('users')` for auth.* admin access, add
  // it here with a justification comment.
]);

export function detectDrift(reference, schema) {
  const tableCols = schema.get(reference.table);
  if (!tableCols) {
    // Unknown literal table. A migration that renamed or dropped a public
    // table would land here while app/test code still references the old
    // name — the freshness check alone wouldn't catch that. Emit a drift
    // finding so the guard surfaces it. Allow-listed non-public tables
    // (e.g. `auth.*` admin access) bypass this.
    if (NON_PUBLIC_TABLE_ALLOWLIST.has(reference.table)) {
      return [];
    }
    return [
      {
        file: reference.file,
        line: reference.line,
        col: reference.column,
        table: reference.table,
        column: '<missing-table>',
        kind: reference.kind,
        reason: 'unknown-table',
      },
    ];
  }
  const findings = [];
  for (const col of reference.columns) {
    if (ALLOWED_PSEUDO_COLUMNS.has(col)) continue;
    if (!tableCols.has(col)) {
      findings.push({
        file: reference.file,
        line: reference.line,
        col: reference.column,
        table: reference.table,
        column: col,
        kind: reference.kind,
      });
    }
  }
  return findings;
}

function formatAnnotation(finding, severity) {
  const tag = severity === 'error' ? 'error' : 'warning';
  const locator = `file=${finding.file},line=${finding.line},col=${finding.col}`;
  if (finding.reason === 'unknown-table') {
    return (
      `::${tag} ${locator}::Schema drift: table '${finding.table}' not in live schema ` +
      `(referenced by .${finding.kind}(...))`
    );
  }
  return (
    `::${tag} ${locator}::Schema drift: column '${finding.column}' not in table '${finding.table}'` +
    ` (referenced by .${finding.kind}(...))`
  );
}

// --- Public API -------------------------------------------------------------

export async function runScan({
  repoRoot,
  includeRoots = DEFAULT_INCLUDE_ROOTS,
  typesFile = 'lib/database.types.ts',
  mode = 'report-only',
} = {}) {
  const absTypesFile = path.isAbsolute(typesFile) ? typesFile : path.join(repoRoot, typesFile);
  if (!existsSync(absTypesFile)) {
    throw new Error(`Schema types file missing at ${absTypesFile}`);
  }
  const typesContent = readFileSync(absTypesFile, 'utf8');
  const schema = parseSchemaFromTypes(typesContent);
  if (schema.size === 0) {
    throw new Error(
      `Failed to parse any tables from ${absTypesFile}. Regenerate via 'npx supabase gen types typescript --project-id <ref>'.`,
    );
  }

  const allRefs = [];
  for (const root of includeRoots) {
    const absRoot = path.isAbsolute(root) ? root : path.join(repoRoot, root);
    const files = walk(absRoot, repoRoot, []);
    for (const file of files) {
      try {
        const refs = extractReferencesFromFile(file, repoRoot);
        for (const ref of refs) allRefs.push(ref);
      } catch (err) {
        // Never silently swallow — re-throw with location context
        throw new Error(`Failed to scan ${file}: ${err.message}`);
      }
    }
  }

  const findings = [];
  for (const ref of allRefs) {
    for (const finding of detectDrift(ref, schema)) {
      finding.annotation = formatAnnotation(finding, mode === 'block' ? 'error' : 'warning');
      findings.push(finding);
    }
  }

  let exitCode = 0;
  if (findings.length > 0 && mode === 'block') exitCode = 1;

  return { references: allRefs, findings, exitCode, mode, tablesKnown: schema.size };
}

/**
 * Compute a deterministic SHA-256 hash over the CONTENT of every
 * `*.sql` file under `migrationsDir`, walked in lexicographic filename
 * order. The hash digests `<filename>\n<file-bytes>\n\0` per file so two
 * files with the same content but different names produce different
 * digests.
 *
 * Codex Round 1 Finding #3 fix: filename-only freshness lets a PR edit
 * an existing migration's content (no rename) without invalidating
 * `lib/database.types.ts`. The content hash captures every byte of the
 * migration corpus, so any in-place edit breaks the freshness contract.
 *
 * Returns the empty string when `migrationsDir` does not exist (treated
 * the same as "no migrations" by `isTypesFileFresh`).
 */
export function computeMigrationsContentHash(migrationsDir) {
  if (!existsSync(migrationsDir)) return '';
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const hash = createHash('sha256');
  for (const f of files) {
    const body = readFileSync(path.join(migrationsDir, f));
    hash.update(f);
    hash.update('\n');
    hash.update(body);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * Freshness check (AC4). Compares the header marker comment of
 * `lib/database.types.ts` against the newest filename under
 * `supabase/migrations/*.sql` AND the SHA-256 content hash of the
 * migration corpus.
 *
 * The marker format is:
 *   `// Generated <ISO> from migrations through <filename>`
 *   `// Migrations content hash: <hex>` (Codex Round 1 #3, optional only
 *      when callers pass `simulatedNewestMigration` for the legacy
 *      filename-only AC4 simulation hook)
 *
 * Strictness contract:
 *   - markerMigration MUST equal the newest filename on disk EXACTLY.
 *     `>=` (lex-greater) would accept future-dated typos like
 *     `9999_future_migration.sql` even when no such migration exists.
 *   - markerMigration MUST also exist as a file under `migrationsDir`.
 *     This catches typos / renamed migrations / out-of-sync regens.
 *   - markerContentHash MUST match `computeMigrationsContentHash(...)`.
 *     This catches in-place edits to existing migration files (no rename).
 *
 * If `simulatedNewestMigration` is provided (test affordance), it overrides
 * the filesystem newest-migration lookup AND the content-hash check is
 * SKIPPED (legacy AC4 simulation path). Content-hash drift is the most
 * common stale-state vector and is therefore enforced on every real check.
 */
export function isTypesFileFresh({ typesFile, migrationsDir, simulatedNewestMigration } = {}) {
  if (!existsSync(typesFile)) {
    return {
      fresh: false,
      newestMigration: null,
      markerMigration: null,
      reason: 'types-missing',
    };
  }
  const content = readFileSync(typesFile, 'utf8');
  const markerMatch = content.match(/from migrations through ([^\s'"`]+\.sql)/);
  const markerMigration = markerMatch ? markerMatch[1] : null;

  const migrations = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];
  const actualNewest = migrations.length > 0 ? migrations[migrations.length - 1] : null;
  const newestMigration = simulatedNewestMigration ?? actualNewest;

  if (!markerMigration) {
    return { fresh: false, newestMigration, markerMigration: null, reason: 'marker-missing' };
  }
  if (!newestMigration) {
    return { fresh: false, newestMigration: null, markerMigration, reason: 'no-migrations' };
  }
  // Strict equality — reject any marker that isn't EXACTLY the newest file.
  if (markerMigration !== newestMigration) {
    return {
      fresh: false,
      newestMigration,
      markerMigration,
      reason: 'marker-mismatch',
    };
  }
  // Marker must exist on disk under migrationsDir. We skip this check when
  // a simulated migration is provided (test-only path can name files that
  // intentionally don't exist).
  if (!simulatedNewestMigration && !migrations.includes(markerMigration)) {
    return {
      fresh: false,
      newestMigration,
      markerMigration,
      reason: 'marker-not-on-disk',
    };
  }

  // Codex Round 1 Finding #3: filename-only check would silently pass when
  // a PR edits an existing migration's CONTENT in place. The content-hash
  // marker captures every byte of every migration. Skip when a simulated
  // newest-migration is supplied (the AC4 legacy simulation hook would
  // otherwise need to fabricate consistent hashes on disk).
  if (!simulatedNewestMigration) {
    const hashMatch = content.match(/Migrations content hash:\s*([0-9a-fA-F]+)/);
    const markerContentHash = hashMatch ? hashMatch[1].toLowerCase() : null;
    const actualContentHash = computeMigrationsContentHash(migrationsDir);
    if (!markerContentHash) {
      return {
        fresh: false,
        newestMigration,
        markerMigration,
        actualContentHash,
        markerContentHash: null,
        reason: 'content-hash-missing',
      };
    }
    if (markerContentHash !== actualContentHash) {
      return {
        fresh: false,
        newestMigration,
        markerMigration,
        actualContentHash,
        markerContentHash,
        reason: 'content-hash-mismatch',
      };
    }
    return {
      fresh: true,
      newestMigration,
      markerMigration,
      actualContentHash,
      markerContentHash,
    };
  }

  return { fresh: true, newestMigration, markerMigration };
}

// --- CLI entry --------------------------------------------------------------

const isDirectExec =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  // pnpm-style direct execution where argv[1] is the script path under .bin
  (process.argv[1] && path.basename(process.argv[1]) === path.basename(import.meta.url));

if (isDirectExec) {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      process.stdout.write(
        `Usage: schema-drift-check.mjs [--mode report-only|block] [--paths <dir>...] [--types-file <path>]\n`,
      );
      process.exit(0);
    }
    const repoRoot = process.cwd();
    const includeRoots = args.paths && args.paths.length > 0 ? args.paths : DEFAULT_INCLUDE_ROOTS;
    const result = await runScan({
      repoRoot,
      includeRoots,
      typesFile: args.typesFile,
      mode: args.mode,
    });

    for (const finding of result.findings) {
      process.stdout.write(finding.annotation + '\n');
    }

    const summaryLine =
      `Schema-drift scan complete: ${result.references.length} references inspected, ` +
      `${result.findings.length} drift findings, ${result.tablesKnown} tables in schema map ` +
      `(mode=${args.mode}).\n`;
    process.stdout.write(summaryLine);

    process.exit(result.exitCode);
  } catch (err) {
    process.stderr.write(`schema-drift-check fatal: ${err.message}\n`);
    process.exit(2);
  }
}
